# Graph Report - .  (2026-08-05)

## Corpus Check
- 49 files · ~51,059 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 307 nodes · 392 edges · 26 communities (20 shown, 6 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.91)
- Token cost: 410,096 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Secure BackupRestore Pipeline|Secure Backup/Restore Pipeline]]
- [[_COMMUNITY_Frontend npm Dependencies|Frontend npm Dependencies]]
- [[_COMMUNITY_Backend npm Dependencies|Backend npm Dependencies]]
- [[_COMMUNITY_Backend Bootstrap & Auth Middleware|Backend Bootstrap & Auth Middleware]]
- [[_COMMUNITY_Proposed Architecture (PRD Draft)|Proposed Architecture (PRD Draft)]]
- [[_COMMUNITY_React Page Components|React Page Components]]
- [[_COMMUNITY_Scraping & Digital Audit Engine|Scraping & Digital Audit Engine]]
- [[_COMMUNITY_PostgreSQL Database Architecture|PostgreSQL Database Architecture]]
- [[_COMMUNITY_Security & Auth Report Sections|Security & Auth Report Sections]]
- [[_COMMUNITY_Backup Service Implementation|Backup Service Implementation]]
- [[_COMMUNITY_Root Project Scripts|Root Project Scripts]]
- [[_COMMUNITY_Graphify Knowledge Graph Tooling|Graphify Knowledge Graph Tooling]]
- [[_COMMUNITY_Scraper Service Implementation|Scraper Service Implementation]]
- [[_COMMUNITY_UI Icon Sprite Set|UI Icon Sprite Set]]
- [[_COMMUNITY_Database Adapter Class|Database Adapter Class]]
- [[_COMMUNITY_Python Scraper CLI|Python Scraper CLI]]
- [[_COMMUNITY_UXUI Redesign Decisions|UX/UI Redesign Decisions]]
- [[_COMMUNITY_Hero Image Branding|Hero Image Branding]]
- [[_COMMUNITY_Vite Frontend Branding|Vite Frontend Branding]]
- [[_COMMUNITY_Page Layout & Animations|Page Layout & Animations]]
- [[_COMMUNITY_Tailwind CSS Styling Decision|Tailwind CSS Styling Decision]]
- [[_COMMUNITY_French Business DB Import|French Business DB Import]]
- [[_COMMUNITY_Favicon Branding|Favicon Branding]]
- [[_COMMUNITY_React Logo Asset|React Logo Asset]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 15 edges
2. `docker-compose backend Service` - 9 edges
3. `runSecureBackup()` - 8 edges
4. `runSecureRestore()` - 8 edges
5. `Secure Backup Pipeline (10-Step)` - 8 edges
6. `Five-Service Docker Network Topology` - 8 edges
7. `backupService.js 10-Step Backup Pipeline (Implemented)` - 8 edges
8. `Icons SVG Sprite Sheet` - 8 edges
9. `DatabaseAdapter` - 7 edges
10. `Secure Restore Pipeline (3-Stage)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `AWS RDS PostgreSQL Instance` --semantically_similar_to--> `docker-compose postgres Service`  [INFERRED] [semantically similar]
  docs/step6_versioning_and_iac.md → docker-compose.yml
- `Playwright Scraping Engine (Proposed)` --semantically_similar_to--> `Rewrite Scraper in Python`  [INFERRED] [semantically similar]
  doc.md → Optimisation.md
- `PostgreSQL + Prisma ORM (Proposed)` --semantically_similar_to--> `PostgreSQL Migration & Data Optimization`  [INFERRED] [semantically similar]
  doc.md → Optimisation.md
- `docker-compose postgres Service` --semantically_similar_to--> `PostgreSQL Migration & Data Optimization`  [INFERRED] [semantically similar]
  docker-compose.yml → Optimisation.md
- `Next.js 14 + Tailwind + Shadcn/ui Frontend (Proposed)` --semantically_similar_to--> `React + Vite Frontend`  [INFERRED] [semantically similar]
  doc.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deployment Targets for Witech Lead (Docker/Render/Vercel/AWS)** — docker_compose_backend_service, docker_compose_frontend_service, render_witech_lead_api_service, render_witech_lead_app_service, docs_step6_versioning_and_iac_vercel_frontend_project, docs_step6_versioning_and_iac_aws_rds_postgres [INFERRED 0.80]
- **Secure Backup Pipeline Components** — database_security_vault_secret_retrieval, database_security_fernet_encryption, database_security_sha256_integrity_check, database_security_s3_upload [EXTRACTED 0.95]
- **Database Migration & Security Plan** — optimisation_postgresql_migration, optimisation_role_based_permissions, docs_step4_database_optimization_postgresql_migration, docs_step4_database_optimization_rbac, docs_step7_database_security_backup_pipeline [INFERRED 0.80]

## Communities (26 total, 6 thin omitted)

### Community 0 - "Secure Backup/Restore Pipeline"
Cohesion: 0.08
Nodes (36): Fernet Symmetric Encryption, Immediate Local Cleanup Principle, pg_dump Non-Determinism Pitfall, S3-Compatible Remote Storage Upload, Secure Backup Pipeline (10-Step), Secure Restore Pipeline (3-Stage), SHA-256 Multi-Stage Integrity Check, Vault Secret Retrieval (+28 more)

### Community 1 - "Frontend npm Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, lucide-react, react, react-dom, recharts, @tailwindcss/vite, devDependencies, autoprefixer (+20 more)

### Community 2 - "Backend npm Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, @aws-sdk/client-s3, axios, bcryptjs, cheerio, cookie-parser, cors, dotenv (+18 more)

### Community 3 - "Backend Bootstrap & Auth Middleware"
Cohesion: 0.17
Nodes (15): getDb(), getFrenchDb(), allowedOrigins, app, bootstrap(), authenticatePortal(), authenticateUser(), router (+7 more)

### Community 4 - "Proposed Architecture (PRD Draft)"
Cohesion: 0.09
Nodes (24): Integrated Bulk Outreach Module (Proposed), Redis + BullMQ Task Queue (Proposed), Dual-Queue Architecture (Scrape Queue A / Outreach Queue B), Node.js/Fastify Backend (Proposed), GDPR B2B Legitimate Interest Compliance, Next.js 14 + Tailwind + Shadcn/ui Frontend (Proposed), Wi'Tech Maps Prospector PRD, 5-Second Staggering Queue (+16 more)

### Community 5 - "React Page Components"
Cohesion: 0.12
Nodes (11): App(), INITIAL_FALLBACK_LEADS, AdminPanel(), Campaigns(), Dashboard(), DATABASE_FIELDS, LeadsManager(), PIPELINE_STATUSES (+3 more)

### Community 6 - "Scraping & Digital Audit Engine"
Cohesion: 0.12
Nodes (20): Digital Maturity Enrichment Engine (Proposed), Entity Classification Engine (Proposed), Playwright Scraping Engine (Proposed), Residential Proxy Rotation (Proposed), Report Section 2: Playwright Python Scraper & Digital Audits, Direct-to-Campaign Injector Route (Route B), Category/City Filter Search Submission, Website Digital Audit Algorithm (+12 more)

### Community 7 - "PostgreSQL Database Architecture"
Cohesion: 0.12
Nodes (19): PostgreSQL + Prisma ORM (Proposed), docker-compose postgres Service, Postgres Connection Pooling (pg.Pool), Dual-Engine Database Adapter (db.js), B-Tree Index Strategy (leads/campaigns), SQLite to PostgreSQL Migration (Implemented), Role-Based Access Control (authenticateUser/authenticatePortal), Parameterized Query SQL Injection Mitigation (+11 more)

### Community 8 - "Security & Auth Report Sections"
Cohesion: 0.13
Nodes (16): Report Section 1: Authentication & Session Management, Report Section 5: Database Security 10-Step Backup & 3-Stage Restore, Report Section 4: Multi-Channel Campaigns & Staggering Queue, Report Section 3: Database Architecture & PostgreSQL Migration, Multi-Channel Campaigns (Email/SMS/WhatsApp), Witech CRM Modernization: Architecture, Security, & Scaling Report, bcryptjs Password Hashing, SameSite=Lax CSRF Mitigation (+8 more)

### Community 9 - "Backup Service Implementation"
Cohesion: 0.26
Nodes (13): __dirname, downloadFromS3(), execPromise, __filename, getFileSha256(), getOrCreateFernetKey(), getVaultSecrets(), listAvailableBackups() (+5 more)

### Community 10 - "Root Project Scripts"
Cohesion: 0.18
Nodes (10): description, devDependencies, concurrently, name, private, scripts, dev, install:all (+2 more)

### Community 11 - "Graphify Knowledge Graph Tooling"
Cohesion: 0.22
Nodes (9): GRAPH_REPORT.md, graphify explain / get_node Command, Graphify Knowledge Graph, graphify path / shortest_path Command, graphify query Command, graphify update Command, graphify-out/wiki/index.md, graphify SKILL.md (external skill) (+1 more)

### Community 12 - "Scraper Service Implementation"
Cohesion: 0.25
Nodes (6): client, __dirname, __filename, normalizeUrl(), scrapeGoogleMapsFromLink(), scrapeWebsite()

### Community 13 - "UI Icon Sprite Set"
Cohesion: 0.39
Nodes (9): Bluesky Icon, Third-Party Brand Icon Group (Bluesky, Discord, GitHub, X), Discord Icon, Documentation Icon, GitHub Icon, Icons SVG Sprite Sheet, Social/Share Icon, Accent-Colored UI Icon Group (Documentation, Social/Share) (+1 more)

### Community 15 - "Python Scraper CLI"
Cohesion: 0.60
Nodes (5): audit_website(), clean_social_url(), main(), parse_args(), scrape_google_maps()

### Community 16 - "UX/UI Redesign Decisions"
Cohesion: 0.40
Nodes (5): WCAG AA Accessibility Compliance, HubSpot/Monday.com Design Inspiration, Light-Mode Slate/Indigo Color Palette, Light Mode vs Dark Mode CRM Decision Rationale, UX/UI Redesign (HubSpot/Monday.com inspired)

### Community 17 - "Hero Image Branding"
Cohesion: 0.67
Nodes (3): Hero Image (hero.png), Isometric Floating Card Illustration, Purple/Violet Gradient Brand Palette

### Community 18 - "Vite Frontend Branding"
Cohesion: 0.67
Nodes (3): Frontend App (Witech Lead), Vite (build tool), Vite Logo (vite.svg)

## Knowledge Gaps
- **108 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Witech CRM Modernization: Architecture, Security, & Scaling Report` connect `Security & Auth Report Sections` to `Secure Backup/Restore Pipeline`, `Scraping & Digital Audit Engine`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `Node.js/Fastify Backend (Proposed)` connect `Proposed Architecture (PRD Draft)` to `PostgreSQL Database Architecture`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `SQLite to PostgreSQL Migration (Implemented)` connect `PostgreSQL Database Architecture` to `Security & Auth Report Sections`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Secure Backup/Restore Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.0761904761904762 - nodes in this community are weakly interconnected._
- **Should `Frontend npm Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Backend npm Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._