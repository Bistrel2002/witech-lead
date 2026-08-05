# Configuration unique de la plateforme d'envoi (SES + Twilio)

Ce document décrit tout ce qu'un opérateur humain doit faire, **une seule fois**,
avant que Witech Lead puisse envoyer un seul e-mail ou SMS réel. Le code
(provisioning du sous-domaine, DKIM, webhook de bounce/complaint, pause
automatique des tenants) est déjà en place, mais il ne peut pas créer le
compte AWS, déléguer le DNS, ni enregistrer le Sender ID Twilio à votre place.

Tant que les étapes 1 à 5 ci-dessous n'ont pas été exécutées avec de vrais
identifiants AWS et Twilio, l'état honnête du système est : les tests
unitaires passent, le serveur démarre, le provisioning est tenté à
l'inscription et se retrouve en `pending` ou `failed`, et **aucun e-mail ne
part réellement**. Ne considérez la fonctionnalité comme opérationnelle
qu'après qu'une vraie campagne a été envoyée à un vrai destinataire et
qu'une réponse est arrivée dans la boîte du tenant.

## Variables d'environnement attendues par le code

La liste ci-dessous a été relue directement dans
`backend/src/config/platformConfig.js` (fonction `getPlatformConfig`), pas
recopiée depuis la spec — c'est la source de vérité.

### Obligatoires (le serveur refuse de démarrer/traiter une requête sans elles)

`REQUIRED_VARS` dans `platformConfig.js` :

| Variable | Rôle |
|---|---|
| `AWS_REGION` | Région SES/Route53 utilisée pour tous les appels (ex. `eu-west-3`). |
| `MAIL_ROOT_DOMAIN` | Domaine racine délégué à Route53 sous lequel chaque tenant reçoit un sous-domaine (`mail.witechagency.com`). |
| `TWILIO_ACCOUNT_SID` | SID du compte Twilio partagé. |
| `TWILIO_AUTH_TOKEN` | Token d'authentification Twilio partagé. |
| `TWILIO_SENDER_ID` | Sender ID alphanumérique partagé (`WITECH`). |
| `SES_WEBHOOK_TOKEN` | Secret partagé exigé en `?token=...` sur le webhook SNS. **Absent de la spec initiale (task-9-brief.md) — ajouté ici car `getPlatformConfig()` le rend obligatoire et `handleSesEvent` rejette toute requête sans lui (403).** |

> **Écart avec la spec de départ :** le brief de la tâche 9 (étape 2) ne
> listait que `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` pour l'IAM,
> `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_SENDER_ID` et le zone ID.
> Il ne mentionnait pas `SES_WEBHOOK_TOKEN`, qui est pourtant dans
> `REQUIRED_VARS`. Ce document corrige cet oubli — voir aussi l'étape 4.

### Optionnelles (valeur par défaut ou fonctionnalité dégradée si absentes)

| Variable | Défaut si absente | Effet |
|---|---|---|
| `SES_CONFIGURATION_SET` | `null` | Si absente, `buildEmailPayload` n'attache **aucun** `ConfigurationSetName` aux e-mails envoyés — les événements BOUNCE/COMPLAINT ne remonteront jamais au webhook, même si l'infrastructure SNS existe. À définir en pratique (voir étape 4). |
| `MAIL_FROM_LOCAL_PART` | `no-reply` | Partie locale de l'adresse d'envoi (`no-reply@{tenant}.mail.witechagency.com`). |

### Utilisées directement (hors `getPlatformConfig`), donc non validées au démarrage mais indispensables

| Variable | Où elle est lue | Rôle |
|---|---|---|
| `ROUTE53_HOSTED_ZONE_ID` | `backend/src/services/sendingDomainService.js` (`ChangeResourceRecordSetsCommand`) | Zone Route53 dans laquelle les enregistrements DKIM/MAIL FROM sont écrits. **Non listée dans `REQUIRED_VARS`** : si elle est absente, le provisioning échoue à l'appel Route53 (capturé et journalisé comme `send_subdomain_status = 'failed'`) plutôt qu'au démarrage du serveur. Ne comptez pas sur un crash au boot pour la détecter — vérifiez-la explicitement. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Chaîne de credentials par défaut du SDK AWS (`SESv2Client`, `Route53Client`) | Ne sont lues nulle part dans le code applicatif — le SDK AWS les prend directement dans `process.env` (ou un rôle IAM/instance profile). Toujours nécessaires en pratique sauf si le backend tourne déjà sous un rôle IAM. |

Toutes ces variables sont déjà présentes dans `.env.example` sous la section
« 4. Platform Outreach Infrastructure » et « 5. Shared Twilio account » ; ce
document ne fait qu'expliquer comment leur donner de vraies valeurs.

---

## Étape 1 — Zone Route53 pour `mail.witechagency.com` et délégation depuis Vercel

Le domaine apex `witechagency.com` et le site vitrine restent hébergés et
gérés sur **Vercel** — cette étape n'y touche pas. On ne délègue que le
sous-domaine `mail.witechagency.com`.

1. Créer une hosted zone publique Route53 pour `mail.witechagency.com` :

   ```bash
   aws route53 create-hosted-zone \
     --name mail.witechagency.com \
     --caller-reference "witech-mail-$(date +%s)"
   ```

2. Récupérer les 4 serveurs de noms (`NS`) attribués à cette zone :

   ```bash
   aws route53 get-hosted-zone --id <ZONE_ID>
   ```

3. Dans le panneau DNS Vercel du projet/domaine `witechagency.com` (**pas**
   un nouveau projet, le même domaine apex qui sert déjà le site vitrine),
   ajouter un enregistrement `NS` pour l'hôte `mail` pointant vers ces 4
   serveurs de noms Route53. Ne modifier aucun autre enregistrement du
   domaine apex.

4. Noter l'ID de la hosted zone (`/hostedzone/XXXXXXXXXXXX`, sans le préfixe
   `/hostedzone/`) dans `ROUTE53_HOSTED_ZONE_ID`.

5. Vérifier la délégation avant de continuer :

   ```bash
   dig NS mail.witechagency.com +short
   ```

   doit renvoyer les mêmes 4 serveurs que ceux de la hosted zone.

---

## Étape 2 — Utilisateur IAM programmatique (droits minimaux)

La politique doit couvrir **exactement** les appels API que le code fait,
ni plus ni moins. Ces appels ont été relus dans
`backend/src/services/sendingDomainService.js` et
`backend/src/services/emailService.js` :

- `CreateEmailIdentityCommand` → `ses:CreateEmailIdentity`
- `GetEmailIdentityCommand` → `ses:GetEmailIdentity`
- `PutEmailIdentityMailFromAttributesCommand` → `ses:PutEmailIdentityMailFromAttributes`
- `SendEmailCommand` (dans `emailService.js`) → `ses:SendEmail`
- `ChangeResourceRecordSetsCommand` → `route53:ChangeResourceRecordSets`, scopé à la hosted zone créée à l'étape 1

Créer l'utilisateur et attacher une politique inline équivalente à :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SesIdentityManagement",
      "Effect": "Allow",
      "Action": [
        "ses:CreateEmailIdentity",
        "ses:GetEmailIdentity",
        "ses:PutEmailIdentityMailFromAttributes",
        "ses:SendEmail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53MailZoneOnly",
      "Effect": "Allow",
      "Action": "route53:ChangeResourceRecordSets",
      "Resource": "arn:aws:route53:::hostedzone/<ROUTE53_HOSTED_ZONE_ID>"
    }
  ]
}
```

Remplacer `<ROUTE53_HOSTED_ZONE_ID>` par l'ID récupéré à l'étape 1. SES v2 ne
supporte pas de restriction par ARN d'identité sur `CreateEmailIdentity` /
`GetEmailIdentity` / `SendEmail`, d'où `Resource: "*"` pour ce bloc — ne pas
élargir les actions au-delà de cette liste.

Générer une clé d'accès pour cet utilisateur et renseigner :

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (la région SES utilisée, ex. `eu-west-3` — doit être une
  région où SES est disponible et où la production access sera demandée à
  l'étape 3)

---

## Étape 3 — Demande d'accès production SES

Un compte SES neuf démarre en **sandbox** :

- seuls les **destinataires vérifiés individuellement** peuvent recevoir un e-mail ;
- limite de **200 messages / 24h** ;
- **aucun prospect réel** ne peut être contacté tant que le compte est en sandbox.

Il faut donc ouvrir une demande de sortie de sandbox (« production access »)
depuis la console SES (Account dashboard → Request production access, ou
`aws support create-case` si un plan de support le permet). Le formulaire
doit décrire explicitement :

- **Le cas d'usage** : prospection B2B à froid (« cold outreach ») envoyée
  au nom de chaque client de la plateforme, un sous-domaine dédié par
  tenant (`{tenant}.mail.witechagency.com`) pour isoler la réputation.
- **La gestion de l'opt-out** : chaque campagne inclut la possibilité de se
  désinscrire / de répondre pour ne plus être contacté (le `ReplyTo` pointe
  vers l'adresse du tenant, cf. `buildEmailPayload` dans `emailService.js`).
- **La gestion des bounces et plaintes** : décrire le mécanisme déjà en
  place — configuration set SES → SNS → webhook `/api/ses/events` → un
  tenant dont le taux de plainte dépasse 5 % (sur un échantillon d'au
  moins 20 envois) est automatiquement mis en pause (voir
  `pauseIfComplaintRateExceeded` dans `sesWebhookRoutes.js`).

Ce traitement prend **typiquement 24 à 48h**. Ne planifiez aucune campagne
réelle avant confirmation écrite d'AWS. Tant que le compte est en sandbox,
`checkDomainVerification` peut renvoyer `verified` (le domaine, lui, est
bien vérifié) sans que l'envoi à un prospect non-vérifié fonctionne pour
autant — la sortie de sandbox est une condition **distincte** de la
vérification de domaine.

---

## Étape 4 — Configuration set SES + topic SNS (BOUNCE / COMPLAINT)

1. Créer un configuration set SES dont le nom correspond exactement à la
   valeur que vous mettrez dans `SES_CONFIGURATION_SET` (`.env.example`
   propose `witech-outreach`) :

   ```bash
   aws sesv2 create-configuration-set --configuration-set-name witech-outreach
   ```

   Rappel : si cette variable est absente, aucun e-mail envoyé
   n'attachera ce configuration set (voir `buildEmailPayload`), et donc
   aucun événement ne sera jamais notifié — cette étape est inutile sans
   elle.

2. Créer un topic SNS et y attacher une destination d'événements sur le
   configuration set, pour les types `BOUNCE` et `COMPLAINT` uniquement
   (ce sont les deux seuls types que `extractDeliveryEvent` dans
   `backend/src/routes/sesWebhookRoutes.js` sait interpréter — tout autre
   type, ex. `Delivery`/`Send`/`Open`/`Click`, est silencieusement ignoré
   par le webhook, donc inutile d'abonner davantage) :

   ```bash
   aws sns create-topic --name witech-ses-events

   aws sesv2 create-configuration-set-event-destination \
     --configuration-set-name witech-outreach \
     --event-destination-name sns-bounce-complaint \
     --event-destination '{
       "Enabled": true,
       "MatchingEventTypes": ["BOUNCE", "COMPLAINT"],
       "SnsDestination": { "TopicArn": "<TOPIC_ARN>" }
     }'
   ```

3. Générer un secret fort pour `SES_WEBHOOK_TOKEN` — c'est la **seule**
   protection du endpoint, SNS ne peut pas présenter de cookie de session
   (voir le commentaire dans `sesWebhookRoutes.js`) :

   ```bash
   openssl rand -hex 32
   ```

   Mettre cette valeur dans `SES_WEBHOOK_TOKEN` côté backend.

4. Abonner le backend au topic, en pointant vers le endpoint webhook
   **avec le paramètre de requête `token` obligatoire** — le mount exact
   est `app.use('/api/ses', ..., sesWebhookRouter)` dans
   `backend/src/index.js`, et la route est `router.post('/events', ...)`,
   soit au total :

   ```bash
   aws sns subscribe \
     --topic-arn <TOPIC_ARN> \
     --protocol https \
     --notification-endpoint "https://<votre-host-api>/api/ses/events?token=<SES_WEBHOOK_TOKEN>"
   ```

   Remplacer `<votre-host-api>` par le domaine réel du backend déployé
   (pas `localhost`, SNS doit pouvoir l'atteindre publiquement en HTTPS) et
   `<SES_WEBHOOK_TOKEN>` par la valeur générée à l'étape précédente — elle
   doit être identique de part et d'autre.

   La confirmation d'abonnement SNS est gérée automatiquement par le
   serveur : `handleSesEvent` détecte le message `SubscriptionConfirmation`
   et effectue lui-même le GET sur `SubscribeURL`, mais uniquement si cette
   URL est en `https://` et sur un hôte `sns.<region>.amazonaws.com` — tout
   autre hôte est rejeté (protection anti-SSRF), donc pas d'action manuelle
   à faire pour confirmer, il suffit que le endpoint soit joignable et que
   le token soit correct.

---

## Étape 5 — Twilio : Sender ID alphanumérique partagé

1. Dans la console Twilio, enregistrer le Sender ID alphanumérique
   `WITECH` (valeur attendue dans `TWILIO_SENDER_ID`, cf. `.env.example`).
2. L'enregistrement pour la zone **FR/EU est soumis à revue** par les
   opérateurs mobiles locaux — ne pas s'attendre à une activation
   instantanée.
3. **Un Sender ID alphanumérique est à sens unique** : les destinataires
   ne peuvent pas répondre par SMS à ce numéro (il n'a pas de capacité de
   réception). C'est cohérent avec le code — `emailService.js` n'utilise
   `cfg.twilio.senderId` que comme `from` sortant, il n'y a aucune route de
   réception de SMS entrants dans ce backend.
4. Renseigner `TWILIO_ACCOUNT_SID` et `TWILIO_AUTH_TOKEN` depuis la console
   Twilio (Account → API keys & tokens).

---

## Étape 6 — Vérification de bout en bout

Une fois les étapes 1 à 5 effectuées :

1. **Créer un compte de test** via le flux d'inscription normal de
   l'application.
2. **Vérifier en base** qu'une ligne `users` a bien reçu un
   `send_subdomain` (format `{userId}.mail.witechagency.com`, posé par
   `ensureTenantSendingDomain` dans `backend/src/services/tenantProvisioning.js`,
   appelé de façon fire-and-forget à l'inscription dans
   `backend/src/routes/authRoutes.js`) :

   ```sql
   SELECT id, send_subdomain, send_subdomain_status FROM users ORDER BY id DESC LIMIT 1;
   ```

3. **Vérifier dans Route53** que les enregistrements DKIM existent pour ce
   sous-domaine — 3 CNAME de la forme
   `<token>._domainkey.<send_subdomain>` → `<token>.dkim.amazonses.com`,
   plus le MX et le TXT SPF du MAIL FROM (`bounce.<send_subdomain>`) :

   ```bash
   aws route53 list-resource-record-sets --hosted-zone-id <ROUTE53_HOSTED_ZONE_ID> \
     --query "ResourceRecordSets[?contains(Name, '<send_subdomain>')]"
   ```

4. **Confirmer que le statut bascule** : appeler
   `GET /api/sending-status` (authentifié comme ce compte) et vérifier que
   `status` passe de `pending` à `verified` — en pratique sous ~15 minutes,
   le temps que SES valide les CNAME DKIM propagés. Cette route rappelle
   `refreshTenantSendingStatus` tant que le statut stocké n'est pas déjà
   `verified`.

5. **Ne déclarer la fonctionnalité opérationnelle** qu'après l'envoi d'une
   vraie campagne à un vrai destinataire externe et la réception d'une
   réponse dans la boîte du tenant (le `ReplyTo` de la campagne). Un
   statut `verified` seul ne prouve pas que SES est sorti de sandbox
   (étape 3) ni que Twilio a validé le Sender ID (étape 5).
