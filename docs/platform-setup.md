# Configuration unique de la plateforme d'envoi (SES + Twilio)

Ce document décrit tout ce qu'un opérateur humain doit faire, **une seule fois**,
avant que Witech Lead puisse envoyer un seul e-mail réel. (Le canal SMS est
désactivé dans le produit — voir l'étape 5 ; seules les étapes 1 à 4 et 6 sont
nécessaires pour lancer.) Le code
(provisioning du sous-domaine, DKIM, webhook de bounce/complaint, pause
automatique des tenants) est déjà en place, mais il ne peut pas créer le
compte AWS, déléguer le DNS, ni enregistrer le Sender ID Twilio à votre place.

Tant que les étapes 1 à 5 ci-dessous n'ont pas été exécutées avec de vrais
identifiants AWS et Twilio, l'état honnête du système est : les tests
unitaires passent, le provisioning est tenté à l'inscription et se retrouve
en `pending` ou `failed`, et **aucun e-mail ne part réellement**. En
production le serveur **refuse désormais de démarrer** si l'une des huit
variables de `REQUIRED_VARS` manque (`bootstrap()` appelle
`getPlatformConfig()`, voir plus bas) ; hors production il démarre en
affichant un avertissement. Ne considérez la fonctionnalité comme opérationnelle
qu'après qu'une vraie campagne a été envoyée à un vrai destinataire et
qu'une réponse est arrivée dans la boîte du tenant.

## Variables d'environnement attendues par le code

La liste ci-dessous a été relue directement dans
`backend/src/config/platformConfig.js` (fonction `getPlatformConfig`), pas
recopiée depuis la spec — c'est la source de vérité.

### Obligatoires (le serveur refuse de démarrer sans elles)

`REQUIRED_VARS` dans `platformConfig.js`. `bootstrap()`
(`backend/src/index.js`) appelle `getPlatformConfig()` avant même d'ouvrir
la connexion base : en production, une seule de ces variables manquante
**arrête le démarrage**, avec un message qui les nomme toutes. Hors
production (`NODE_ENV !== 'production'`) le démarrage continue après un
avertissement, pour que le dev local reste possible sans identifiants AWS
ni Twilio réels.

| Variable | Rôle |
|---|---|
| `AWS_REGION` | Région SES/Route53 utilisée pour tous les appels (ex. `eu-west-3`). |
| `MAIL_ROOT_DOMAIN` | Domaine racine délégué à Route53 sous lequel chaque tenant reçoit un sous-domaine (`mail.witechagency.com`). |
| `TWILIO_ACCOUNT_SID` | SID du compte Twilio partagé. |
| `TWILIO_AUTH_TOKEN` | Token d'authentification Twilio partagé. |
| `TWILIO_SENDER_ID` | Sender ID alphanumérique partagé (`WITECH`). |
| `SES_WEBHOOK_TOKEN` | Secret partagé exigé en `?token=...` sur le webhook SNS. **Absent de la spec initiale (task-9-brief.md) — ajouté ici car `getPlatformConfig()` le rend obligatoire et `handleSesEvent` rejette toute requête sans lui (403).** |
| `UNSUBSCRIBE_SECRET` | Secret HMAC qui signe les tokens de désinscription (`unsubscribeService.js`, fonction `sign`). Il n'y a pas de table de tokens : un lien reste valide indéfiniment tant que ce secret ne change pas. **Faire tourner ce secret invalide instantanément tous les liens de désinscription déjà envoyés** (`verifyUnsubscribeToken` échoue sur toute signature calculée avec l'ancien secret) — à traiter comme une valeur permanente dès l'envoi de la première campagne. |
| `PUBLIC_API_URL` | URL publique **du backend lui-même**, pas celle du frontend (`FRONTEND_URL` est la mauvaise valeur ici, voir le commentaire dans `platformConfig.js`). C'est elle qui préfixe chaque lien `/unsubscribe/<token>` inséré dans les e-mails de campagne (`buildUnsubscribeUrl` dans `unsubscribeService.js`) : elle doit donc être joignable en HTTPS depuis la boîte mail d'un destinataire, pas seulement résoluble en local. |

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
| `ROUTE53_HOSTED_ZONE_ID` | `backend/src/services/sendingDomainService.js` (`ChangeResourceRecordSetsCommand`) | Zone Route53 dans laquelle les enregistrements DKIM/MAIL FROM sont écrits. **Non listée dans `REQUIRED_VARS`** : si elle est absente, le provisioning échoue à l'appel Route53 (capturé et journalisé comme `send_subdomain_status = 'failed'`) plutôt qu'au démarrage du serveur. Ne comptez pas sur un crash au boot pour la détecter — vérifiez-la explicitement. Les tenants tombés en `failed` pour cette raison sont rattrapables sans intervention en base : voir l'étape 4, `refreshTenantSendingStatus` re-provisionne. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Chaîne de credentials par défaut du SDK AWS (`SESv2Client`, `Route53Client`) | Ne sont lues nulle part dans le code applicatif — le SDK AWS les prend directement dans `process.env` (ou un rôle IAM/instance profile). Toujours nécessaires en pratique sauf si le backend tourne déjà sous un rôle IAM. |

Toutes ces variables sont déjà présentes dans `.env.example` sous la section
« 4. Platform Outreach Infrastructure » et « 5. Shared Twilio account » ; ce
document ne fait qu'expliquer comment leur donner de vraies valeurs.

Elles sont également déclarées dans `render.yaml` (service
`witech-lead-api`), toutes en `sync: false` : Render les demande au moment
du déploiement et **aucune valeur secrète n'est versionnée**. Un déploiement
depuis le blueprint sans les renseigner échouera au démarrage plutôt que de
produire un serveur en apparence sain mais incapable d'envoyer.

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

Remplacer `<ROUTE53_HOSTED_ZONE_ID>` par l'ID récupéré à l'étape 1.

> **Point non vérifié — à contrôler avant de créer la politique en
> production.** La politique ci-dessus accorde les quatre actions SES sur
> `Resource: "*"`. Il est possible que SES supporte en réalité une
> restriction par ARN d'identité de la forme
> `arn:aws:ses:<region>:<account-id>:identity/*.mail.witechagency.com`
> pour tout ou partie de `ses:CreateEmailIdentity` /
> `ses:GetEmailIdentity` / `ses:PutEmailIdentityMailFromAttributes` /
> `ses:SendEmail`, ce qui correspondrait naturellement au schéma
> `{userId}.mail.witechagency.com` de ce backend et serait plus restrictif
> que `"*"`. Cette affirmation n'a pas été vérifiée contre la référence AWS
> IAM Service Authorization Reference à jour pour SES au moment de la
> rédaction de ce document — **consultez cette référence au moment de créer
> la politique**, et scopez ces actions à ce pattern d'ARN si le service le
> permet. Ne considérez pas `Resource: "*"` comme la solution la plus
> restrictive possible tant que ce point n'a pas été tranché. Ne pas élargir
> les actions elles-mêmes au-delà de la liste ci-dessus, quelle que soit la
> restriction de ressource retenue.

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
- **La gestion de l'opt-out** : voir « Réponses prêtes à coller » ci-dessous.
- **La gestion des bounces et plaintes** : voir « Réponses prêtes à coller »
  ci-dessous.
- **Comment la liste de prospects est constituée** : voir « Réponses prêtes
  à coller » ci-dessous.

Ce traitement prend **typiquement 24 à 48h**. Ne planifiez aucune campagne
réelle avant confirmation écrite d'AWS. Tant que le compte est en sandbox,
`checkDomainVerification` peut renvoyer `verified` (le domaine, lui, est
bien vérifié) sans que l'envoi à un prospect non-vérifié fonctionne pour
autant — la sortie de sandbox est une condition **distincte** de la
vérification de domaine.

### Réponses prêtes à coller pour le formulaire « Request production access »

Les trois paragraphes ci-dessous ont été rédigés en relisant directement le
code listé en regard de chacun, pas recopiés depuis une spec. Collez-les
tels quels dans les champs correspondants du formulaire SES ; les seules
adaptations attendues sont stylistiques.

**Comment un destinataire se désinscrit.**

> Chaque e-mail de campagne porte un en-tête `List-Unsubscribe` (URL de
> désinscription entre chevrons) et un en-tête
> `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, conformément à la
> désinscription en un clic (RFC 8058) exigée par Gmail et Outlook pour les
> expéditeurs en volume. Le corps texte de l'e-mail contient également un
> lien de désinscription visible. Ce lien est ajouté automatiquement par la
> plateforme si le message composé par le client ne le contient pas déjà :
> aucun e-mail de campagne ne peut donc partir sans moyen de se
> désinscrire. Une désinscription en un clic déclenchée par le client de
> messagerie enregistre l'adresse immédiatement ; un clic sur le lien
> visible dans le corps du message ouvre une page de confirmation, et
> l'adresse est enregistrée dès validation de cette page. Dans les deux
> cas, l'adresse est ajoutée à une liste de suppression vérifiée avant
> l'envoi de chaque message : une adresse qui s'est désinscrite d'un
> expéditeur donné ne reçoit plus jamais rien de cet expéditeur, et sans
> limite de durée.

Sourcé sur : `buildEmailPayload` et `appendUnsubscribeNotice` dans
`backend/src/services/emailService.js` (en-têtes et texte exacts), l'appel à
`isSuppressed` dans `runCampaignBackground` (même fichier, juste avant
l'envoi) et `unsubscribeService.js` (`recordUnsubscribe`,
`isSuppressed`). Détail utile pour vous, pas nécessairement pour le
formulaire : une désinscription manuelle (page publique, source `manual`)
ne bloque que le tenant depuis lequel le lien a été envoyé ; une
désinscription issue d'une plainte (source `complaint`, voir ci-dessous)
bloque tous les tenants de la plateforme pour cette adresse — voir
`isSuppressed` dans `unsubscribeService.js`, qui matche
`user_id = ? OR user_id IS NULL`. Il n'existe dans le code aucun mécanisme
pour réinscrire une adresse : une fois désinscrite, elle ne peut être
retirée de la liste de suppression que par une intervention manuelle en
base (voir la section « Opérations courantes — consulter les
suppressions » plus bas).

**Comment les bounces et les plaintes sont traités.**

> Le configuration set SES de la plateforme est relié à un topic SNS,
> lui-même abonné à un webhook authentifié de l'application
> (`POST /api/ses/events`, protégé par un jeton partagé). Chaque événement
> `Bounce` et `Complaint` reçu est enregistré et attribué au tenant
> concerné. Toute adresse à l'origine d'une plainte (`Complaint`) est
> immédiatement ajoutée à la liste de suppression pour l'ensemble de la
> plateforme, pas seulement pour le tenant visé par la plainte. Si un
> tenant accumule au moins 20 événements de livraison (bounces et plaintes
> confondus) sur les 30 derniers jours et que la part de plaintes parmi
> ces événements atteint 5 %, l'envoi de ce tenant est automatiquement
> suspendu (e-mail et SMS) jusqu'à intervention d'un opérateur.

Sourcé sur : `backend/src/routes/sesWebhookRoutes.js` — constantes
`COMPLAINT_RATE_THRESHOLD = 0.05`, `COMPLAINT_SAMPLE_FLOOR = 20` et
`COMPLAINT_WINDOW_DAYS = 30` en tête de fichier, fonction
`pauseIfComplaintRateExceeded` pour la logique de pause, et l'appel à
`recordUnsubscribe(db, null, event.recipient, 'complaint')` (user_id `null`
= suppression globale) pour la désinscription automatique sur plainte. Le
webhook est monté en `app.use('/api/ses', ..., sesWebhookRouter)` dans
`backend/src/index.js` avec la route `router.post('/events', ...)`. Ce
mécanisme de pause existait déjà avant la fonctionnalité de désinscription
(voir Étape 4) ; ce qui est nouveau ici est que la plainte suppresse
désormais aussi l'adresse. Nuance à connaître avant d'interpréter le
chiffre de 5 % vous-même : le dénominateur ne compte que les bounces et
les plaintes, pas le volume total envoyé — le détail complet est dans la
section « Opérations courantes — lever la pause automatique d'un tenant »
plus bas.

**Comment la liste de prospects est constituée.**

> Les coordonnées de prospects proviennent de fiches d'entreprises
> publiques référencées sur Google Maps (nom, catégorie, ville, téléphone,
> site web) et, lorsqu'un site web est renseigné, d'une adresse e-mail
> publiée sur ce site (liens `mailto:` ou texte de la page d'accueil). Ce
> sont des coordonnées professionnelles publiques utilisées dans un cadre
> de prospection B2B, pas des adresses de particuliers.

Sourcé sur : `backend/src/services/scraper.py`, fonctions
`scrape_google_maps` (collecte des fiches Google Maps) et `audit_website`
(extraction de l'e-mail publié sur le site de l'entreprise). Ce paragraphe
ne couvre que ce chemin-là.

> **Point à trancher avant de soumettre le formulaire — ne pas coller le
> paragraphe ci-dessus sans le lire.** Le code expose aussi
> `POST /api/leads/french-db-import` (`backend/src/routes.js`), qui insère
> en base tout CSV envoyé par un tenant authentifié (colonnes `name`,
> `category`, `city`, `phone`, `email`, `website`, `address`, `rating`,
> `review_count`) dans la table `french_businesses` partagée entre tous les
> tenants. Rien dans le code ne réserve cette route à un rôle
> administrateur, et rien n'y vérifie la provenance des lignes importées :
> la garantie « aucune liste achetée » n'est donc **pas** imposée par le
> système pour ce chemin, c'est un engagement opérationnel de l'opérateur.
> Avant de répondre à AWS, décidez comment vous encadrez cette route —
> par exemple en la réservant à un rôle admin, en ajoutant un champ de
> provenance vérifié à l'import, ou en l'acceptant telle quelle comme
> contrôle purement documentaire — et assurez-vous que ce que vous
> déclarez à AWS correspond à ce qui est réellement vrai au moment où vous
> soumettez le formulaire. Ce document ne tranche pas ce choix à votre
> place.

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

> **Le canal SMS est aujourd'hui désactivé dans le produit — cette étape n'est
> pas nécessaire pour lancer.** Un tenant ne peut ni créer ni exécuter une
> campagne SMS : `validateChannel` (`backend/src/routes.js`, ensemble
> `DISABLED_CHANNELS`) refuse `channel: 'sms'` à la création, et
> `assertChannelSendable` (`backend/src/services/emailService.js`, constante
> `SMS_UNAVAILABLE_MESSAGE`) le refuse à l'envoi ; le bouton SMS de l'assistant
> de campagne est affiché désactivé avec la mention « Bientôt disponible ». Le
> code d'envoi Twilio et la config Twilio restent en place : c'est un
> interrupteur, pas une suppression.
>
> **Raison.** Un Sender ID alphanumérique est à sens unique (point 3
> ci-dessous) : il ne peut pas recevoir les réponses `STOP` que la
> réglementation française exige pour la prospection par SMS. Un SMS de
> campagne partirait donc sans lien de désinscription, sans `STOP`, et sans
> aucun moyen d'alimenter la table `unsubscribes` — l'inverse exact de la
> garantie donnée à AWS pour l'e-mail.
>
> **Ce qui doit exister avant de réactiver SMS** (retirer `'sms'` de
> `DISABLED_CHANNELS` ne suffit pas, et ne doit pas être fait avant) :
> 1. un numéro Twilio **bidirectionnel** (long code ou numéro court FR) à la
>    place — ou en complément — du Sender ID alphanumérique ;
> 2. une route entrante de réception des SMS dans ce backend (il n'en existe
>    aucune aujourd'hui) qui enregistre `STOP` / `ARRET` dans `unsubscribes` ;
> 3. la vérification de suppression étendue aux **numéros de téléphone** —
>    `isSuppressed` ne connaît aujourd'hui que les adresses e-mail ;
> 4. la mention du mot-clé d'opt-out dans le corps des SMS de campagne
>    (l'équivalent de `appendUnsubscribeNotice` côté e-mail) ;
> 5. la mise à jour de la réponse « opt-out » du formulaire SES/AWS et de la
>    spec `docs/superpowers/specs/2026-08-06-unsubscribe-design.md`, qui
>    décrivent aujourd'hui un lancement e-mail uniquement.
>
> Les étapes ci-dessous restent documentées pour ce jour-là.

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

3. **Vérifier dans Route53** que les enregistrements suivants existent pour
   ce sous-domaine — les valeurs exactes ci-dessous viennent de
   `dkimRecordsFor` et `mailFromRecordsFor` dans
   `backend/src/services/sendingDomainService.js`, pas d'une supposition :

   | Type | Nom | Valeur |
   |---|---|---|
   | `CNAME` (× 3, un par token DKIM) | `<token>._domainkey.<send_subdomain>` | `<token>.dkim.amazonses.com` |
   | `MX` | `bounce.<send_subdomain>` | `10 feedback-smtp.<AWS_REGION>.amazonses.com` |
   | `TXT` | `bounce.<send_subdomain>` | `"v=spf1 include:amazonses.com ~all"` (guillemets inclus littéralement — Route53 les exige dans la valeur d'un enregistrement TXT) |

   Les 3 `<token>` DKIM sont ceux renvoyés par SES à la création de
   l'identité (`CreateEmailIdentityCommand` / `DkimAttributes.Tokens`), donc
   propres à chaque tenant — ils ne sont pas prévisibles à l'avance,
   contrairement au nom du MAIL FROM (`bounce.<send_subdomain>`) et à sa
   valeur SPF qui sont fixes.

   ```bash
   aws route53 list-resource-record-sets --hosted-zone-id <ROUTE53_HOSTED_ZONE_ID> \
     --query "ResourceRecordSets[?contains(Name, '<send_subdomain>')]"
   ```

   La sortie doit contenir 3 `CNAME` (DKIM) + 1 `MX` + 1 `TXT` (MAIL FROM)
   pour ce tenant, soit 5 enregistrements au total.

4. **Confirmer que le statut bascule** : appeler
   `GET /api/sending-status` (authentifié comme ce compte) et vérifier que
   `status` passe de `pending` à `verified` — en pratique sous ~15 minutes,
   le temps que SES valide les CNAME DKIM propagés. Cette route rappelle
   `refreshTenantSendingStatus` tant que le statut stocké n'est pas déjà
   `verified`.

   `refreshTenantSendingStatus` **re-provisionne** aussi le tenant si
   `send_subdomain` est `NULL` ou si le statut stocké est `failed` : c'est
   le chemin de rattrapage pour un compte dont le provisioning a échoué à
   l'inscription (throttle AWS, clé expirée, `ROUTE53_HOSTED_ZONE_ID`
   absente). Le bouton « Actualiser » de l'écran *Configurations & Outils*
   déclenche exactement cet appel. Deux garde-fous encadrent les appels AWS,
   tous deux dans `backend/src/services/tenantProvisioning.js` :

   - `STATUS_CACHE_TTL_MS` (30 s) — le statut résolu est réutilisé, donc
     rafraîchir en boucle n'enchaîne pas les `GetEmailIdentity` (quota
     SESv2 partagé par tout le compte) ;
   - `PROVISION_RETRY_COOLDOWN_MS` (5 min) — délai minimum entre deux
     tentatives de re-provisioning pour un même tenant.

   Conséquence opérationnelle : après avoir corrigé la cause d'un échec
   (par exemple renseigner `ROUTE53_HOSTED_ZONE_ID` et redéployer), il
   suffit d'attendre la fin du cooldown puis de rappeler la route — inutile
   de toucher la base. Tout résultat est écrit en base, donc le statut
   retourné par l'API et `users.send_subdomain_status` ne peuvent plus
   diverger.

5. **Ne déclarer la fonctionnalité opérationnelle** qu'après l'envoi d'une
   vraie campagne à un vrai destinataire externe et la réception d'une
   réponse dans la boîte du tenant (le `ReplyTo` de la campagne). Un
   statut `verified` seul ne prouve pas que SES est sorti de sandbox
   (étape 3) ni que Twilio a validé le Sender ID (étape 5).

---

## Opérations courantes — lever la pause automatique d'un tenant

Ce n'est pas une étape de configuration initiale, mais un opérateur en aura
besoin dès qu'un tenant est mis en pause. Documenté ici pour qu'il n'ait pas
à relire le code sous pression.

**Déclenchement.** Le webhook `POST /api/ses/events`
(`backend/src/routes/sesWebhookRoutes.js`, fonction
`pauseIfComplaintRateExceeded`) met un tenant en pause automatiquement dès
que, sur un échantillon d'**au moins 20 événements** enregistrés
(`COMPLAINT_SAMPLE_FLOOR = 20`) **au cours des 30 derniers jours**
(`COMPLAINT_WINDOW_DAYS = 30`), le taux de plaintes (`Complaint` / total)
dépasse **5 %** (`COMPLAINT_RATE_THRESHOLD = 0.05`). À ce moment :

- `users.sending_paused_at` est renseigné (`CURRENT_TIMESTAMP`) ;
- toutes ses campagnes `Active` passent à `Paused`
  (`UPDATE campaigns SET status = 'Paused' WHERE user_id = ? AND status = 'Active'`).

**Ce que le dénominateur mesure exactement — à lire avant d'interpréter un
chiffre.** La table `sending_events` ne contient **que** des `Bounce` et des
`Complaint` : `extractDeliveryEvent` renvoie `null` pour `Delivery` et
`Send`, et enregistrer ces événements-là est hors périmètre (cela
multiplierait le volume de la table par ~100 et imposerait de reconfigurer
l'abonnement SNS). Le ratio n'est donc **pas** « plaintes par message
envoyé » mais « plaintes par incident de délivrabilité ». Un tenant avec
10 000 envois parfaitement propres et 19 bounces sur la fenêtre sera mis en
pause à sa première plainte : c'est attendu, mais cela veut dire qu'un
déclenchement n'est pas en soi la preuve d'un abus. Toujours regarder le
volume d'envoi réel (console SES / métriques CloudWatch du configuration
set) avant de conclure.

**Fenêtre glissante de 30 jours.** Le comptage est restreint à
`created_at > now() - interval '30 days'`. Sans cette fenêtre le ratio était
calculé sur toute la vie du compte et ne pouvait que monter : l'historique
ancien restait indéfiniment au dénominateur *et* au numérateur, si bien
qu'un tenant assaini ne redescendait jamais sous le seuil.

**Effet.** Tant que `sending_paused_at` n'est pas `NULL`,
`assertChannelSendable` (`backend/src/services/emailService.js`) bloque tout
envoi — e-mail **et** SMS — pour ce tenant, avec le message :
« Envoi suspendu pour ce compte suite à un taux de plainte trop élevé.
Contactez le support. » Relancer une campagne depuis l'interface
(`POST /campaigns/:id/start` ou `/restart`) ne contourne pas ce blocage :
`runCampaignBackground` revérifie `sending_paused_at` à chaque exécution et
fait échouer la campagne (statut `Failed`) si la pause est toujours active.

**Il n'existe aujourd'hui aucune UI ni endpoint pour lever cette pause** —
c'est une opération manuelle en base de données, à faire seulement après
avoir investigué la cause des plaintes (contenu de campagne, ciblage,
réputation du sous-domaine) :

```sql
UPDATE users SET sending_paused_at = NULL WHERE id = <user_id>;
```

Après cette mise à jour, le tenant (ou l'opérateur pour son compte) doit
relancer manuellement ses campagnes restées en `Paused` depuis
l'interface — la levée de `sending_paused_at` ne les remet pas `Active`
automatiquement.

**Cette levée tient-elle dans le temps ?** Oui, grâce à la fenêtre de
30 jours — et c'est précisément ce qui ne fonctionnait pas avant elle. Avec
un ratio calculé sur toute la vie du compte, remettre `sending_paused_at` à
`NULL` ne durait que jusqu'à la plainte suivante : le ratio historique était
toujours au-dessus du seuil, donc le webhook remettait le tenant en pause
immédiatement. L'opérateur voyait sa correction « marcher », puis se défaire
seule sans trace claire.

Avec la fenêtre glissante, ce qui compte est le comportement des 30 derniers
jours. Deux conséquences pratiques :

1. **Si les plaintes viennent d'une campagne déjà arrêtée**, la levée est
   définitive dès que ces événements sortent de la fenêtre. En attendant,
   ils comptent encore : si le tenant est toujours au-dessus du seuil sur
   les 30 derniers jours, il sera re-mis en pause à la prochaine plainte.
   C'est le comportement voulu — ne pas contourner la fenêtre.
2. **Pour vérifier avant de lever la pause**, exécuter le même comptage que
   le webhook et confirmer que le tenant est bien redescendu :

   ```sql
   SELECT COUNT(*) FILTER (WHERE event_type = 'Complaint') AS complaints,
          COUNT(*) AS total
     FROM sending_events
    WHERE user_id = <user_id>
      AND created_at > now() - interval '30 days';
   ```

   Si `total < 20`, le plancher d'échantillon suffit à empêcher toute
   nouvelle pause automatique. Sinon, vérifier que
   `complaints / total < 0.05`. Si le ratio est encore au-dessus, lever la
   pause maintenant ne tiendra pas : il faut attendre que les événements
   fautifs sortent de la fenêtre, ou traiter la cause avant de reprendre
   les envois.

Le seuil (5 %), le plancher (20 événements) et la fenêtre (30 jours) sont
les constantes `COMPLAINT_RATE_THRESHOLD`, `COMPLAINT_SAMPLE_FLOOR` et
`COMPLAINT_WINDOW_DAYS` en tête de
`backend/src/routes/sesWebhookRoutes.js` — les modifier en base est
impossible, c'est un déploiement.

---

## Opérations courantes — consulter les suppressions (désinscriptions)

**Il n'existe aujourd'hui aucune interface pour consulter ou gérer la liste
de suppression.** Un opérateur qui veut savoir si une adresse est
désinscrite, ou lister les désinscriptions d'un tenant, travaille en SQL
directement sur la table `unsubscribes` (schéma dans
`backend/src/database/db.js`).

Rappel du modèle, tel qu'implémenté dans `isSuppressed`
(`backend/src/services/unsubscribeService.js`) : une ligne avec `user_id`
renseigné ne suppresse qu'un tenant précis (désinscription manuelle depuis
la page publique, colonne `source = 'manual'`) ; une ligne avec
`user_id IS NULL` suppresse l'adresse pour **toute** la plateforme
(déclenchée automatiquement par une plainte SES, colonne
`source = 'complaint'`, voir la section précédente). Ce sont les deux
seules valeurs de `source` produites par le code aujourd'hui.

**Désinscriptions d'un tenant donné** (uniquement les lignes propres à ce
tenant — n'inclut pas les suppressions globales qui le concernent aussi) :

```sql
SELECT id, email, source, created_at
  FROM unsubscribes
 WHERE user_id = <user_id>
 ORDER BY created_at DESC;
```

**Suppressions globales** (plaintes, applicables à tous les tenants) :

```sql
SELECT id, email, source, created_at
  FROM unsubscribes
 WHERE user_id IS NULL
 ORDER BY created_at DESC;
```

**Statut d'une adresse précise pour un tenant donné** — reproduit
exactement la condition de `isSuppressed` (`email = ? AND (user_id = ? OR
user_id IS NULL)`), donc un résultat non vide ici signifie que
`runCampaignBackground` sauterait cette adresse pour ce tenant :

```sql
SELECT id, user_id, source, created_at
  FROM unsubscribes
 WHERE email = lower(trim('<email>'))
   AND (user_id = <user_id> OR user_id IS NULL);
```

> **Le `lower(trim(...))` n'est pas décoratif.** Les adresses sont stockées
> normalisées (`normaliseEmail` dans
> `backend/src/services/unsubscribeService.js` : `trim()` puis `toLowerCase()`),
> et `isSuppressed` normalise la valeur recherchée avant de comparer. Coller
> `Contact@Exemple.FR` tel quel dans un `WHERE email = '...'` ne renvoie donc
> **rien**, alors même que l'adresse est bel et bien désinscrite — et un
> opérateur en conclut à tort qu'il peut la contacter. La colonne n'a pas de
> `lower()` côté base : c'est la valeur cherchée qu'il faut normaliser, comme
> ci-dessus. Même remarque pour toute recherche ponctuelle du type
> `WHERE email LIKE '%...%'`.

Il n'existe pas non plus de mécanisme, dans le code, pour réinscrire une
adresse : la seule façon de retirer une suppression est de supprimer la
ligne correspondante en base, à faire seulement à la demande explicite du
destinataire (une adresse désinscrite par plainte ne devrait, en pratique,
jamais être retirée manuellement).
