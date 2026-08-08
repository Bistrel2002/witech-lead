# L'infrastructure d'envoi expliquée

**À qui s'adresse ce document.** À quelqu'un qui n'écrit pas de code mais doit
comprendre ce qui a été mis en place, pourquoi, et ce qui se passerait si on
l'enlevait. Chaque terme technique est expliqué à sa première apparition.

Ce document explique **pourquoi**. Pour la marche à suivre pas à pas — quels
boutons cliquer, quelles commandes lancer — voir [`platform-setup.md`](platform-setup.md).

---

## 1. Le problème de départ

Wi'Tech Lead envoie des e-mails de prospection à froid : des messages
commerciaux à des entreprises qui n'ont rien demandé. C'est légal en B2B en
France, sous conditions, mais c'est le type d'envoi que les messageries
surveillent le plus.

Avant ce chantier, le produit fonctionnait ainsi : **chaque client devait
coller ses propres identifiants de messagerie** (serveur SMTP, mot de passe)
dans une page de configuration.

Trois problèmes rendaient ce modèle invendable :

**a) C'était trop compliqué pour un client.** Un plombier ou une agence qui
achète un outil de prospection n'a aucune idée de ce qu'est un serveur SMTP.
Lui demander d'en configurer un avant son premier envoi, c'est perdre la
majorité des inscriptions.

**b) Il y avait une faille de sécurité.** Tous les identifiants étaient stockés
dans une **table partagée** — un même tableau en base de données pour tous les
clients. N'importe quel client connecté pouvait lire, et modifier, les
identifiants de tous les autres.

**c) La réputation était commune.** En envoi d'e-mail, votre « réputation »
détermine si vos messages arrivent en boîte de réception ou en spam. Si tous
les clients envoient depuis la même origine, un seul mauvais client fait
tomber tout le monde avec lui.

L'objectif du chantier : **le client ne configure rien, et les clients sont
isolés les uns des autres.**

---

## 2. Le vocabulaire, une fois pour toutes

| Terme | Ce que c'est, en clair |
|---|---|
| **DNS** | L'annuaire d'Internet. Il traduit un nom (`witechagency.com`) en adresse machine, et sert aussi à prouver qu'on est bien propriétaire d'un domaine. |
| **Domaine / sous-domaine** | `witechagency.com` est un domaine. `mail.witechagency.com` en est un sous-domaine — une branche séparée, qu'on peut confier à un autre prestataire sans toucher au reste. |
| **SES** (Simple Email Service) | Le service d'Amazon qui expédie réellement les e-mails. C'est le facteur. |
| **SNS** (Simple Notification Service) | Le service d'Amazon qui transmet des notifications. C'est le facteur qui revient nous dire « ce courrier n'est jamais arrivé ». |
| **Route 53** | Le service DNS d'Amazon. C'est l'annuaire, côté Amazon. |
| **IAM** (Identity and Access Management) | Le service qui gère *qui a le droit de faire quoi* sur le compte Amazon. |
| **Rebond** (*bounce*) | Un e-mail qui n'a pas pu être remis : adresse inexistante, boîte pleine. |
| **Plainte** (*complaint*) | Le destinataire a cliqué sur « Signaler comme spam ». C'est le signal le plus grave. |
| **Réputation** | La note que Gmail, Outlook et Amazon attribuent à un expéditeur. Elle décide de la boîte de réception ou du dossier spam. |
| **Webhook** | Une adresse web sur notre serveur qu'un service extérieur appelle pour nous transmettre une information. |

---

## 3. Pourquoi Amazon, et pas un service d'emailing classique

Mailchimp, Brevo, SendGrid interdisent explicitement la prospection à froid
dans leurs conditions d'utilisation, et ferment les comptes sans préavis dès
que les signalements montent.

Amazon SES autorise cet usage **à condition de le déclarer** et de gérer
correctement les rebonds et les désinscriptions. C'est ce qui a orienté tout
le reste : l'infrastructure a été construite pour tenir cette promesse, pas
seulement pour envoyer.

---

## 4. Ce qui a été mis en place, morceau par morceau

### 4.1 Un domaine dédié à l'envoi : `mail.witechagency.com`

**Ce qui a été fait.** Une branche séparée du domaine principal a été créée
spécifiquement pour l'envoi d'e-mails.

**Pourquoi.** Le site vitrine `witechagency.com` vit sur Vercel et ne doit
jamais être perturbé. En isolant l'envoi sur `mail.`, une erreur de
configuration côté e-mail ne peut pas mettre le site hors ligne. Inversement,
si la réputation d'envoi se dégrade un jour, le domaine principal — celui de
vos e-mails professionnels quotidiens — n'est pas contaminé.

### 4.2 La délégation de Vercel vers Route 53

**Ce qui a été fait.** Un enregistrement de type `NS` a été ajouté chez Vercel,
qui dit en substance : *« pour tout ce qui concerne `mail.witechagency.com`,
adressez-vous à Amazon »*.

**Pourquoi.** Le logiciel doit pouvoir créer des enregistrements DNS
**automatiquement**, à chaque nouvelle inscription client. L'API de Vercel ne
s'y prête pas ; celle de Route 53 oui. On délègue donc uniquement cette
branche, sans rien changer au reste.

C'est le seul enregistrement ajouté chez Vercel. Le site, le domaine principal
et vos éventuels e-mails professionnels sont intacts.

### 4.3 Un sous-domaine par client — la décision structurante

**Ce qui a été fait.** À l'inscription, chaque client reçoit automatiquement
son propre sous-domaine d'envoi : `1.mail.witechagency.com`,
`2.mail.witechagency.com`, et ainsi de suite.

**Pourquoi — c'est le cœur du système.** Gmail et Outlook jugent la réputation
**par domaine d'envoi**. Si tous vos clients partagent la même origine, un seul
client qui envoie n'importe quoi fait basculer tous les autres en spam. Avec un
sous-domaine par client, chacun porte sa propre réputation : le mauvais élève
se pénalise lui-même, et lui seul.

C'est ce qui rend le produit vendable à plusieurs clients simultanément.

### 4.4 DKIM : la signature qui prouve l'authenticité

**Ce qui a été fait.** Trois enregistrements DNS de type `CNAME` sont créés
automatiquement pour chaque client, de la forme
`<jeton>._domainkey.<sous-domaine>`.

**Pourquoi.** DKIM appose une **signature cryptographique** sur chaque e-mail.
Le destinataire vérifie cette signature auprès du DNS et sait que le message
vient bien de vous, et n'a pas été modifié en route.

Sans DKIM, un e-mail de prospection à froid part directement en spam dans la
quasi-totalité des cas. Ce n'est pas optionnel.

### 4.5 SPF et l'adresse de retour : `bounce.<sous-domaine>`

**Ce qui a été fait.** Deux enregistrements supplémentaires par client :
- un `MX` pointant vers `feedback-smtp.eu-west-3.amazonses.com`
- un `TXT` contenant `v=spf1 include:amazonses.com ~all`

**Pourquoi.** Un e-mail a deux adresses d'expéditeur : celle que le
destinataire voit, et une adresse technique invisible qui reçoit les erreurs de
livraison. Par défaut, cette adresse technique appartient à Amazon.

En la faisant pointer vers votre propre sous-domaine, les deux adresses
concordent — ce qu'on appelle l'**alignement SPF**. Les messageries y voient un
signal de légitimité fort, et cela améliore nettement le placement en boîte de
réception.

C'est le détail qui différencie un envoi correct d'un envoi professionnel.

**Total : 5 enregistrements DNS créés automatiquement par client** (3 DKIM +
1 MX + 1 SPF). Vous n'avez jamais à y toucher.

### 4.6 L'utilisateur IAM : un trousseau à cinq clés

**Ce qui a été fait.** Un utilisateur technique `witech-lead-mailer` a été créé,
avec exactement cinq autorisations :

| Autorisation | Ce qu'elle permet |
|---|---|
| `ses:CreateEmailIdentity` | créer le sous-domaine d'un nouveau client |
| `ses:GetEmailIdentity` | vérifier si ce sous-domaine est prêt |
| `ses:PutEmailIdentityMailFromAttributes` | configurer l'adresse de retour |
| `ses:SendEmail` | envoyer un e-mail |
| `route53:ChangeResourceRecordSets` | écrire les enregistrements DNS, **et uniquement dans la zone `mail.`** |

**Pourquoi.** Ces identifiants vivent sur un serveur exposé à Internet. S'ils
fuitaient un jour, l'attaquant ne pourrait qu'envoyer des e-mails et modifier
la zone `mail.` — il ne pourrait ni lire votre base, ni créer des machines, ni
toucher à quoi que ce soit d'autre sur votre compte Amazon.

C'est le **principe du moindre privilège** : ne donner que le strict nécessaire.
Ce choix a une conséquence visible : ces clés ne peuvent pas créer de topic SNS
ni de configuration set — ces opérations d'installation se font depuis la
console, avec votre compte administrateur.

### 4.7 Le configuration set `witech-outreach`

**Ce qui a été fait.** Un « configuration set » a été créé et son nom inscrit
dans la variable `SES_CONFIGURATION_SET`.

**Pourquoi.** C'est une étiquette qu'on attache à chaque e-mail envoyé. Elle dit
à Amazon : *« pour ces messages-là, préviens-moi de ce qui se passe »*.

⚠️ **Sans cette variable, Amazon n'émet aucune notification** — et toute la
chaîne de surveillance décrite ci-dessous devient inerte, silencieusement.
C'est le point de configuration le plus facile à oublier.

### 4.8 SNS : le canal de retour

**Ce qui a été fait.** Un topic SNS `witech-ses-events` a été créé, relié au
configuration set pour deux types d'événements seulement : **rebonds** et
**plaintes**. Une souscription pointe vers notre serveur.

**Pourquoi.** Sans ce canal, vous seriez aveugle. Vous ne sauriez pas qu'un
client envoie à des adresses mortes, ni qu'il se fait signaler comme spam —
jusqu'au jour où Amazon suspendrait le compte entier.

Seuls ces deux types sont écoutés : les livraisons réussies et les ouvertures
n'apportent rien ici et généreraient un volume inutile.

### 4.9 Le jeton secret du webhook

**Ce qui a été fait.** L'adresse du webhook contient un mot de passe :
`.../api/ses/events?token=<secret>`. Toute requête sans le bon jeton est
rejetée.

**Pourquoi — une faille réelle a été fermée ici.** Le webhook doit être ouvert
sur Internet, puisque Amazon doit pouvoir l'appeler et qu'Amazon n'a pas de
compte chez vous. Or le sous-domaine d'un client est **public** : il apparaît
dans l'en-tête de chaque e-mail envoyé.

Sans ce jeton, n'importe qui pouvait envoyer 20 fausses plaintes visant un
client précis et **faire suspendre son envoi** — une attaque triviale contre un
client payant nommément désigné.

### 4.10 La suspension automatique

**Ce qui a été fait.** Si un client dépasse **5 % de plaintes** sur les
**30 derniers jours**, avec un minimum de **20 événements** pour éviter les
faux positifs sur de petits volumes, son envoi est automatiquement suspendu.

**Pourquoi.** C'est le disjoncteur. Il coupe un client abusif avant qu'Amazon ne
coupe la plateforme entière.

⚠️ **Une limite à connaître.** Ce calcul se fait sur les rebonds et plaintes
uniquement, pas sur le volume total envoyé. Amazon, lui, mesure les plaintes
sur le total, avec un seuil de **0,1 %**. Un client peut donc être au-dessus du
seuil d'Amazon sans déclencher notre disjoncteur. **Ce garde-fou ne remplace pas
la consultation régulière du tableau de bord Amazon.**

### 4.11 La désinscription

**Ce qui a été fait.** Chaque e-mail contient un lien de désinscription, ajouté
**automatiquement** si le modèle du client ne le contient pas. Les en-têtes
`List-Unsubscribe` sont également présents — c'est le bouton « Se désabonner »
que Gmail affiche en haut du message.

Une désinscription volontaire ne bloque **que l'expéditeur concerné** : le
destinataire se désabonne d'un client, pas de la plateforme. Une plainte pour
spam, en revanche, bloque l'adresse **pour tous les clients** — quelqu'un qui
signale du spam ne doit plus jamais être sollicité.

**Pourquoi.** Deux raisons également contraignantes :
1. **Légale** : la CNIL impose un moyen de désinscription dans chaque message
   de prospection B2B.
2. **Pratique** : le formulaire d'Amazon pose la question de manière
   obligatoire. Sans mécanisme réel, pas d'accès production.

L'ajout automatique est la garantie importante : **aucun client ne peut envoyer
un message non conforme**, même en réécrivant son modèle de zéro.

### 4.12 Le délai de 5 secondes entre chaque envoi

**Ce qui a été fait.** Une pause de 5 secondes sépare deux e-mails.

**Pourquoi.** Envoyer 500 messages en rafale depuis un domaine neuf est la
signature classique du spam. Un rythme régulier ressemble à une activité
humaine. Une campagne de 100 prospects prend donc environ 8 minutes — c'est
volontaire, et cela améliore le taux de délivrabilité.

---

## 5. Côté Render : où vit l'application

**Base de données PostgreSQL.** Elle stocke les clients, les prospects, les
campagnes, les désinscriptions et l'historique des rebonds.

⚠️ **Découverte importante pendant le chantier :** l'application tournait
jusque-là sur une base temporaire, effacée à chaque redéploiement. Toutes les
données de production disparaissaient régulièrement sans que personne ne s'en
aperçoive. Une vraie base a été créée.

**Le plan gratuit expire au bout de 30 jours.** À prévoir avant les premiers
clients payants.

**Les variables d'environnement.** Les identifiants ne sont jamais écrits dans
le code — ils sont saisis dans Render, qui les injecte au démarrage. Le code
est donc publiable sans exposer aucun secret.

**La validation au démarrage.** Le serveur **refuse de démarrer** si une
variable essentielle manque. C'est délibéré : un serveur qui démarre en
paraissant sain mais incapable d'envoyer est bien pire qu'un serveur qui
s'arrête en disant exactement ce qui manque.

---

## 6. Ce qui bloque encore l'envoi vers de vrais prospects

Le compte Amazon est en **bac à sable** (*sandbox*) : le mode d'essai imposé à
tout nouveau compte.

- maximum **200 e-mails par 24 h**
- uniquement vers des adresses que vous avez **vous-même pré-vérifiées**

Impossible donc d'écrire à un prospect scrapé. Il faut **demander l'accès
production** — un formulaire à remplir une fois, réponse sous 24 à 48 h.

**Une décision reste à prendre avant de le soumettre.** Le formulaire demande
comment la liste de prospects est constituée. Le scraping Google Maps ne
collecte que des coordonnées professionnelles publiques, ce qui est
défendable. Mais l'application expose aussi un import de fichier CSV libre,
accessible à tout client, sans vérification de provenance — donc l'affirmation
« aucune liste achetée » n'est pas garantie techniquement.

Trois options : réserver cet import aux administrateurs, tracer la provenance
des imports, ou en faire un engagement contractuel envers vos clients. **Ce que
vous déclarez à Amazon doit correspondre à la réalité au moment où vous le
soumettez** — une fausse déclaration entraîne la fermeture du compte, pas un
simple refus.

---

## 7. Récapitulatif : ce qui se passe quand un client s'inscrit

1. Le client crée son compte.
2. L'application demande à Amazon de créer `<son numéro>.mail.witechagency.com`.
3. Amazon renvoie trois jetons de signature DKIM.
4. L'application écrit 5 enregistrements DNS dans Route 53.
5. Amazon vérifie ces enregistrements — quelques minutes.
6. La page Configurations passe à « Prêt à l'envoi ».
7. Le client lance sa campagne. Chaque e-mail part de son sous-domaine, signé,
   avec son nom affiché, les réponses arrivant dans sa vraie boîte, et un lien
   de désinscription en bas.
8. Si un destinataire se désinscrit, il n'est plus jamais contacté par ce client.
9. Si un destinataire signale du spam, il n'est plus contacté par personne, et
   le client s'approche de la suspension automatique.

**Le client n'a rien configuré.** C'était l'objectif.

---

## 8. Ce qu'il reste à faire

| Priorité | Action |
|---|---|
| **Bloquant** | Trancher la question de l'import CSV, puis demander l'accès production SES |
| **Avant les premiers clients** | Passer la base Render en plan payant |
| **Hebdomadaire** | Consulter les taux de rebond et de plainte dans SES → Account dashboard |
| **À prévoir** | Le SMS est désactivé : un identifiant alphanumérique ne peut pas recevoir les « STOP » exigés par la loi française |
