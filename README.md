# Wi'Tech Lead

CRM de prospection B2B pour le marché français. Il trouve des entreprises
(Google Maps et la base des sociétés françaises), personnalise un message pour
chacune, l'envoie depuis un sous-domaine dédié au client, et suit chaque
prospect du premier contact à l'affaire signée.

---

## Sommaire

- [Ce que contient le dépôt](#ce-que-contient-le-dépôt)
- [Lancer avec Docker](#lancer-avec-docker--recommandé-obligatoire-sur-windows)
- [Lancer sans Docker](#lancer-sans-docker--macos--linux)
- [Configuration (`.env`)](#configuration-env)
- [Tests](#tests)
- [Scripts de maintenance](#scripts-de-maintenance)
- [Problèmes fréquents](#problèmes-fréquents)

---

## Ce que contient le dépôt

```
.
├── backend/          API Express + PostgreSQL, envoi via AWS SES
├── frontend/         React + Vite. Deux pages livrées par le build :
│                       index.html → la vitrine publique
│                       app.html   → l'application
├── docs/             Spécifications et notes d'infrastructure
├── docker-compose.yml
└── .env.example      Modèle de configuration
```

Le frontend produit **deux points d'entrée**. C'est voulu : un visiteur qui
tape le domaine doit tomber sur la présentation du produit, pas sur un
formulaire de connexion.

| URL | Contenu |
|---|---|
| `/` | vitrine publique |
| `/app.html` | application (connexion, prospects, campagnes) |

**Base de données : PostgreSQL.** Le schéma se crée et se met à jour tout seul
au démarrage du backend — il n'y a pas de commande de migration à lancer.

---

## Lancer avec Docker — recommandé, obligatoire sur Windows

C'est le chemin le plus court, et le seul qui se comporte identiquement sur
Windows, macOS et Linux. Rien d'autre à installer : ni Node, ni PostgreSQL.

### 1. Installer Docker

- **Windows** — [Docker Desktop](https://www.docker.com/products/docker-desktop/).
  À l'installation, laissez l'option **WSL 2** cochée.
- **macOS** — Docker Desktop, ou `brew install --cask docker`.
- **Linux** — Docker Engine + le plugin `docker compose`.

Vérifiez que le démon tourne :

```bash
docker info
```

### 2. Démarrer

```bash
docker compose up --build
```

C'est tout. **Aucune clé à obtenir, aucun fichier à créer.** La base, l'API et
le frontend démarrent avec des valeurs de développement, et vous pouvez créer
un compte et travailler immédiatement.

Le backend annonce clairement ce qui manque :

```
⚠️  Platform configuration incomplete — outreach sending will NOT work.
    Variables manquantes : AWS_REGION, MAIL_ROOT_DOMAIN, ...
⚠️  JWT_SECRET absent — clé aléatoire générée pour ce démarrage.
```

Ce que vous avez sans rien configurer : inscription, connexion, recherche de
prospects, pipeline, campagnes, tableau de bord. Ce qui manque : l'envoi réel
des e-mails, qui demande un compte AWS SES.

### 3. Ajouter vos clés — seulement si vous en avez besoin

**macOS / Linux :**

```bash
cp .env.example .env
```

**Windows (PowerShell) :**

```powershell
Copy-Item .env.example .env
```

Tout ce que vous y mettez est transmis aux conteneurs et prend le pas sur les
valeurs par défaut. Rien n'est obligatoire : ajoutez `JWT_SECRET` pour que vos
sessions survivent à un redémarrage, les clés AWS pour envoyer, les
identifiants Google pour la connexion Google.

Le premier lancement prend plusieurs minutes (installation des dépendances).
Les suivants démarrent en quelques secondes.

| Service | Adresse |
|---|---|
| Vitrine | http://localhost:8080 |
| Application | http://localhost:8080/app.html |
| API | http://localhost:3001 |
| PostgreSQL | `localhost:5433` — utilisateur `witech`, mot de passe `witech` |

Le port **5433** est volontaire : il n'entre pas en conflit avec un PostgreSQL
déjà installé sur la machine.

### Récupérer vos données existantes dans Docker

Docker démarre avec **sa propre base, vide**. C'est voulu : quelqu'un qui
clone le dépôt obtient un environnement propre sans toucher à sa machine.

Si vous avez déjà des prospects dans un PostgreSQL local, vous ne les verrez
donc pas — ce sont deux bases différentes. Pour les copier dans celle de
Docker :

```bash
docker compose stop backend
docker compose exec -T db psql -q -U witech -d postgres -c "DROP DATABASE IF EXISTS witech_crm"
docker compose exec -T db psql -q -U witech -d postgres -c "CREATE DATABASE witech_crm"
pg_dump --no-owner --no-privileges witech_crm | docker compose exec -T db psql -q -U witech -d witech_crm
docker compose start backend
```

Le `DROP` / `CREATE` n'est pas optionnel : importer par-dessus le schéma que
le backend a déjà créé produit des dizaines d'erreurs de clés dupliquées et
un import à moitié fait — les prospects passent, les campagnes non.

C'est une copie, pas un lien. Les deux bases évoluent ensuite séparément.

<details>
<summary>Faire pointer Docker sur votre base locale (déconseillé)</summary>

`DOCKER_DATABASE_URL` dans `.env` redirige les conteneurs ailleurs :

```
DOCKER_DATABASE_URL=postgresql://<utilisateur>@host.docker.internal:5432/witech_crm
```

Deux choses à savoir avant d'essayer :

- **Le nom d'utilisateur est obligatoire.** En local, PostgreSQL prend celui
  de votre session ; dans un conteneur, c'est `root`, et la connexion est
  refusée avec `no PostgreSQL user name specified`.
- **PostgreSQL n'écoute que sur `localhost` par défaut**, et un conteneur
  arrive par la passerelle Docker. Il faut passer `listen_addresses` à `'*'`
  dans `postgresql.conf` et ouvrir le sous-réseau Docker dans `pg_hba.conf` —
  donc exposer votre base sur le réseau. L'import ci-dessus évite tout ça.

</details>

### Commandes utiles

```bash
docker compose up -d          # démarrer en arrière-plan
docker compose logs -f backend # suivre les logs de l'API
docker compose down            # arrêter
docker compose down -v         # arrêter ET effacer la base
```

> `docker compose down -v` supprime **toutes** les données. Sans le `-v`, la
> base survit aux redémarrages.

### Après avoir modifié le code

Les images embarquent le code au moment du build, il n'y a pas de rechargement
à chaud. Reconstruisez :

```bash
docker compose up --build
```

Pour développer avec rechargement à chaud, utilisez plutôt la méthode native
ci-dessous. Docker sert ici à **faire tourner** le projet, pas à le développer.

---

## Lancer sans Docker — macOS / Linux

### Prérequis

- **Node.js 20 ou plus** — `node --version`
- **PostgreSQL 14 ou plus**, démarré localement

### 1. Créer la base

```bash
createdb witech_crm
```

### 2. Installer les dépendances

```bash
npm run install:all
```

### 3. Configurer

```bash
cp .env.example .env
```

Dans `.env`, pointez `DATABASE_URL` sur votre base locale :

```
DATABASE_URL=postgresql://localhost:5432/witech_crm
```

### 4. Démarrer — deux terminaux séparés

**Terminal 1 — l'API :**

```bash
npm run dev --prefix backend
```

Attendez `🚀 Witech Lead backend running on port 3001`. Le backend se connecte
à la base **avant** d'ouvrir son port : tant que ce message n'apparaît pas,
rien n'écoute.

**Terminal 2 — le frontend :**

```bash
npm run dev --prefix frontend
```

Puis ouvrez http://localhost:5173 (vitrine) ou
http://localhost:5173/app.html (application).

> **N'utilisez pas `npm run dev` à la racine.** Ce script lance les deux
> services via `concurrently`, qui propage la variable `PORT` du frontend au
> backend. Le backend tente alors de se lier au port 5173 déjà occupé et
> s'arrête sur `EADDRINUSE`. Les deux commandes ci-dessus, dans deux
> terminaux, évitent le problème.

---

## Configuration (`.env`)

Un seul fichier `.env`, **à la racine du dépôt**. Le backend le lit par un
chemin absolu, donc peu importe d'où vous lancez la commande.

> ⚠️ Ne créez pas de second `.env` dans `backend/`. S'il en existe un, il
> masquera celui de la racine et vos modifications resteront sans effet.

### Le minimum pour démarrer

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | connexion PostgreSQL |
| `JWT_SECRET` | signature des jetons de session |

### Pour la connexion Google

| Variable | Rôle |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | identifiants OAuth |
| `BACKEND_URL` | adresse de l'API, sert à construire l'URI de callback |
| `FRONTEND_URL` | adresse du frontend |

Dans la Google Cloud Console, l'URI de redirection autorisée doit être
exactement :

```
<BACKEND_URL>/api/auth/google/callback
```

soit `http://localhost:3001/api/auth/google/callback` en local. Chaque
environnement (local, préproduction, production) a besoin de la sienne.

### Pour envoyer des e-mails

`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`MAIL_ROOT_DOMAIN`, `SES_WEBHOOK_TOKEN`, `UNSUBSCRIBE_SECRET`,
`PUBLIC_API_URL`.

Le backend le vérifie au démarrage et le dit clairement :

```
Validating platform configuration...
Platform configuration OK.
```

Si une variable manque, il démarre quand même avec un avertissement en clair.
Tout le produit reste utilisable — recherche, campagnes, suivi — seul l'envoi
refuse. Il faut en plus que le sous-domaine d'envoi du compte soit `verified`,
ce que la page Configurations affiche.

Générez les deux secrets vous-même :

```bash
openssl rand -hex 32
```

Voir `docs/platform-setup.md` pour la mise en place AWS complète.

> `.env` est ignoré par Git. Ne le committez jamais.

### Ces identifiants ne se partagent pas

Ils appartiennent à **l'exploitant de la plateforme**, pas à qui clone le
dépôt. Ce sont eux qui donnent accès au compte AWS SES et au domaine
`witechagency.com`.

Quelqu'un qui récupère le dépôt obtient le code, pas les clés — c'est
volontaire. S'il pouvait envoyer avec vos identifiants :

- les envois seraient **facturés sur votre compte AWS** ;
- ils partiraient **de votre domaine** ;
- la moindre plainte pour spam abîmerait **votre réputation d'expéditeur**,
  et AWS suspendrait **votre** compte SES.

C'est précisément ce que l'architecture en sous-domaines par client existe
pour éviter — un `.env` partagé la contournerait entièrement. Committer des
clés AWS dans un dépôt est aussi un incident de sécurité immédiat : des robots
scannent GitHub en continu et les exploitent en quelques minutes.

Pour qu'un tiers puisse envoyer, deux voies :

- **il utilise votre instance déployée** — c'est un client du SaaS, il n'a pas
  besoin de faire tourner l'infrastructure ;
- **il fournit son propre compte AWS SES** et son propre domaine, en
  renseignant son `.env`.

Un développeur qui reprend le projet n'a de toute façon pas besoin d'envoyer
pour travailler : tout le reste tourne sans ces variables.

### La configuration AWS ne se refait jamais

Elle est faite **une fois**, et elle vit dans votre compte AWS — pas dans le
dépôt, pas sur une machine. Zone Route53, utilisateur IAM, accès production
SES, configuration set et topic SNS : tout cela reste en place quoi qu'il
arrive au code.

| Situation | Faut-il refaire la configuration AWS ? |
|---|---|
| Vous déployez sur un nouveau serveur | **Non.** Vous recopiez le `.env`. |
| Vous changez de machine | **Non.** Même `.env`. |
| Un développeur clone pour coder | **Non.** Il n'a besoin d'aucune variable AWS. |
| Un nouveau client s'inscrit sur votre instance | **Non**, et c'est automatique — voir ci-dessous. |
| Quelqu'un veut exploiter **sa propre** instance | Oui. Son compte AWS, son domaine. |

#### Les nouveaux clients ne configurent rien

C'est la promesse du produit, et elle est tenue par le code : à chaque
inscription, `ensureTenantSendingDomain` crée le sous-domaine du client
(`<id>.mail.witechagency.com`), déclare l'identité SES, active DKIM et écrit
les enregistrements DNS dans Route53 — sans intervention.

Le client ne voit jamais AWS. Il crée son compte, et son domaine d'envoi
existe.

#### Si vous deviez tout refaire

`docs/platform-setup.md` documente les six étapes, y compris les réponses
prêtes à coller pour le formulaire d'accès production SES.
`docs/infrastructure-expliquee.md` explique le rôle de chaque brique — SES,
SNS, Route53, IAM — en langage non technique.

---

## Aller jusqu'à l'envoi automatique des e-mails

Le projet tourne sans rien configurer, mais il n'envoie pas. Voici ce qui
manque, dans l'ordre, avec ce que ça coûte réellement.

| # | À obtenir | Où | Durée | Sans ça |
|---|---|---|---|---|
| 1 | `JWT_SECRET` | `openssl rand -hex 32` | 5 s | les sessions sautent à chaque redémarrage |
| 2 | `UNSUBSCRIBE_SECRET`, `SES_WEBHOOK_TOKEN` | `openssl rand -hex 32` | 10 s | l'envoi refuse |
| 3 | Un domaine | votre registrar | déjà fait | pas d'envoi possible |
| 4 | Compte AWS + zone Route53 | AWS | ~30 min | pas d'envoi possible |
| 5 | Utilisateur IAM (5 droits) | AWS | ~10 min | pas d'envoi possible |
| 6 | Accès production SES | AWS, **validation humaine 24-48 h** | ~20 min + attente | 200 e-mails/jour, destinataires vérifiés seulement |
| 7 | Configuration set + topic SNS | AWS | ~15 min | pas de retour sur les rebonds et plaintes |
| 8 | Identifiants Google OAuth | Google Cloud Console | ~10 min | connexion Google indisponible (e-mail/mot de passe fonctionne) |

Le seul délai incompressible est l'étape 6 : AWS examine la demande à la main.
Tout le reste tient dans une après-midi.

**`docs/platform-setup.md`** détaille les étapes 3 à 7 pas à pas, avec les
réponses prêtes à coller pour le formulaire d'accès production SES.
**`docs/infrastructure-expliquee.md`** explique à quoi sert chaque brique —
SES, SNS, Route53, IAM — sans jargon.

### Connexion Google

1. [Google Cloud Console](https://console.cloud.google.com/) → créez un projet.
2. **API et services → Écran de consentement OAuth** : type « Externe »,
   renseignez le nom de l'application et votre e-mail de contact.
3. **Identifiants → Créer → ID client OAuth → Application Web**.
4. Dans **URI de redirection autorisés**, ajoutez exactement :

   ```
   http://localhost:3001/api/auth/google/callback
   ```

   et, en production, la même chose avec l'adresse de votre backend. Chaque
   environnement a besoin de la sienne — c'est l'oubli qui provoque
   `redirect_uri_mismatch`.

5. Copiez l'identifiant et le secret dans `.env` :

   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   BACKEND_URL=http://localhost:3001
   ```

L'URI de redirection pointe vers le **backend**, jamais vers le frontend : le
backend reçoit le code d'autorisation, l'échange, puis renvoie l'utilisateur
vers l'application.

### Et vos clients ?

Ils ne configurent rien. À l'inscription, le produit crée leur sous-domaine
d'envoi, déclare l'identité SES, active DKIM et écrit les DNS dans Route53
sans intervention. Cette liste est le travail de **l'exploitant**, fait une
fois.

### Le SMS

Il n'est pas activé, et les identifiants Twilio ne sont donc **pas** requis.
Le canal est refusé à la création de campagne comme à l'envoi, tant que la
gestion des réponses `STOP` n'existe pas — obligatoire en France.

---

## Tests

```bash
npm test --prefix backend
```

190 tests, sans base de données ni identifiants AWS : ils injectent des faux.

```bash
npm run lint --prefix frontend    # 74 problèmes préexistants = la référence
npm run build --prefix frontend   # doit produire index.html ET app.html
```

Il n'y a pas de tests frontend.

---

## Scripts de maintenance

### Rattraper les prospects mal classés

Un ancien défaut laissait des prospects en « Nouveau » alors que leur e-mail
était bien parti. Ce script les reclasse, **à blanc par défaut** :

```bash
node backend/scripts/backfill-campaign-lead-status.js           # simulation
node backend/scripts/backfill-campaign-lead-status.js --apply   # écriture
```

Il ne touche jamais un prospect que vous avez fait avancer à la main. À lancer
une fois par base — donc aussi en production après un déploiement.

---

## Problèmes fréquents

**Le backend démarre mais rien ne répond sur le port 3001.**
Il attend la base. Vérifiez que PostgreSQL tourne et que `DATABASE_URL` est
correcte. Aucun port n'est ouvert tant que la connexion n'a pas abouti.

**`EADDRINUSE` sur le port 5173 au démarrage du backend.**
Vous avez lancé `npm run dev` à la racine. Utilisez les deux commandes
séparées.

**La connexion Google renvoie `redirect_uri_mismatch`.**
L'URI de callback de cet environnement n'est pas déclarée dans la Google
Cloud Console. Elle doit correspondre au caractère près à
`<BACKEND_URL>/api/auth/google/callback`.

**Le bouton Google ne fait rien / erreur réseau.**
Le backend n'écoute pas. Vérifiez le terminal 1, ou `docker compose ps`.

**`/` affiche l'application au lieu de la vitrine.**
Le build n'est pas à jour. `npm run build --prefix frontend` doit produire
`dist/index.html` (vitrine) et `dist/app.html` (application).

**Windows : `docker compose up` échoue au démarrage.**
Docker Desktop n'est pas lancé, ou WSL 2 n'est pas activé. `docker info` doit
répondre sans erreur.
