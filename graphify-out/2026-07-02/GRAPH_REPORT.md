# Graph Report - .  (2026-07-02)

## Corpus Check
- 49 files · ~50,668 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 155 nodes · 216 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Packages & Config|Frontend Packages & Config]]
- [[_COMMUNITY_React Frontend Pages & Core App|React Frontend Pages & Core App]]
- [[_COMMUNITY_Backend Router & CRM Services|Backend Router & CRM Services]]
- [[_COMMUNITY_Backend NPM Packages|Backend NPM Packages]]
- [[_COMMUNITY_Express Server & Database Core|Express Server & Database Core]]
- [[_COMMUNITY_Backup Service & Vault Encryption|Backup Service & Vault Encryption]]
- [[_COMMUNITY_Backend Package Meta|Backend Package Meta]]
- [[_COMMUNITY_Root Package Workspace Meta|Root Package Workspace Meta]]
- [[_COMMUNITY_Database Adapters & Init|Database Adapters & Init]]
- [[_COMMUNITY_Web Scraping & Google Maps Python Script|Web Scraping & Google Maps Python Script]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 15 edges
2. `runSecureBackup()` - 8 edges
3. `runSecureRestore()` - 8 edges
4. `DatabaseAdapter` - 7 edges
5. `initPostgresDb()` - 5 edges
6. `runCampaignBackground()` - 5 edges
7. `scripts` - 5 edges
8. `authenticateUser()` - 4 edges
9. `getVaultSecrets()` - 4 edges
10. `scripts` - 4 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/index.js → backend/src/database/db.js
- `runSecureBackup()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/backupService.js → backend/src/database/db.js
- `runSecureRestore()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/backupService.js → backend/src/database/db.js
- `runCampaignBackground()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/emailService.js → backend/src/database/db.js
- `authenticateUser()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/middlewares/authMiddleware.js → backend/src/database/db.js

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "Frontend Packages & Config"
Cohesion: 0.07
Nodes (28): dependencies, lucide-react, react, react-dom, recharts, @tailwindcss/vite, devDependencies, autoprefixer (+20 more)

### Community 1 - "React Frontend Pages & Core App"
Cohesion: 0.12
Nodes (11): App(), INITIAL_FALLBACK_LEADS, AdminPanel(), Campaigns(), Dashboard(), DATABASE_FIELDS, LeadsManager(), PIPELINE_STATUSES (+3 more)

### Community 2 - "Backend Router & CRM Services"
Cohesion: 0.14
Nodes (12): router, activeCampaignRuns, compileTemplate(), createTransport(), runCampaignBackground(), testSmtpConnection(), client, __dirname (+4 more)

### Community 3 - "Backend NPM Packages"
Cohesion: 0.12
Nodes (16): dependencies, @aws-sdk/client-s3, axios, bcryptjs, cheerio, cookie-parser, cors, dotenv (+8 more)

### Community 4 - "Express Server & Database Core"
Cohesion: 0.30
Nodes (9): getDb(), getFrenchDb(), allowedOrigins, app, bootstrap(), authenticatePortal(), authenticateUser(), router (+1 more)

### Community 5 - "Backup Service & Vault Encryption"
Cohesion: 0.26
Nodes (13): __dirname, downloadFromS3(), execPromise, __filename, getFileSha256(), getOrCreateFernetKey(), getVaultSecrets(), listAvailableBackups() (+5 more)

### Community 6 - "Backend Package Meta"
Cohesion: 0.18
Nodes (10): description, devDependencies, nodemon, main, name, scripts, dev, start (+2 more)

### Community 7 - "Root Package Workspace Meta"
Cohesion: 0.18
Nodes (10): description, devDependencies, concurrently, name, private, scripts, dev, install:all (+2 more)

### Community 9 - "Web Scraping & Google Maps Python Script"
Cohesion: 0.60
Nodes (5): audit_website(), clean_social_url(), main(), parse_args(), scrape_google_maps()

## Knowledge Gaps
- **69 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Express Server & Database Core` to `Database Adapters & Init`, `Backend Router & CRM Services`, `Backup Service & Vault Encryption`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend NPM Packages` to `Backend Package Meta`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _69 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Packages & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `React Frontend Pages & Core App` be split into smaller, more focused modules?**
  _Cohesion score 0.11857707509881422 - nodes in this community are weakly interconnected._
- **Should `Backend Router & CRM Services` be split into smaller, more focused modules?**
  _Cohesion score 0.14210526315789473 - nodes in this community are weakly interconnected._
- **Should `Backend NPM Packages` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._