# Graph Report - Witech Lead  (2026-07-02)

## Corpus Check
- 41 files · ~50,675 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 370 nodes · 416 edges · 26 communities (23 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01ef52d8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Step-by-Step Implementation Details|Step-by-Step Implementation Details]]
- [[_COMMUNITY_Product Requirement Document (PRD) Wi'Tech Maps Prospector (Revised)|Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)]]
- [[_COMMUNITY_Step 6 Versioning & Infrastructure as Code (IaC) Specification|Step 6: Versioning & Infrastructure as Code (IaC) Specification]]
- [[_COMMUNITY_Step 5 Docker Containerization Specification|Step 5: Docker Containerization Specification]]
- [[_COMMUNITY_Step 7 Database Security & Cryptographic Backups Specification|Step 7: Database Security & Cryptographic Backups Specification]]
- [[_COMMUNITY_Step 1 Authentication & Session Management Specification|Step 1: Authentication & Session Management Specification]]
- [[_COMMUNITY_Step 4 Database Architecture & Optimizations Specification|Step 4: Database Architecture & Optimizations Specification]]
- [[_COMMUNITY_Step 2 UX and UI Design Specification|Step 2: UX and UI Design Specification]]
- [[_COMMUNITY_Step 3 Playwright Python Scraper Specification|Step 3: Playwright Python Scraper Specification]]
- [[_COMMUNITY_Wi'Tech Maps Prospector (Witech Lead)|Wi'Tech Maps Prospector (Witech Lead)]]
- [[_COMMUNITY_Optimisation|Optimisation]]
- [[_COMMUNITY_React + Vite|React + Vite]]
- [[_COMMUNITY_graphify|graphify.md]]
- [[_COMMUNITY_graphify|graphify.md]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 15 edges
2. `Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)` - 11 edges
3. `Step-by-Step Implementation Details` - 10 edges
4. `runSecureBackup()` - 8 edges
5. `runSecureRestore()` - 8 edges
6. `Witech CRM Modernization: Architecture, Security, & Scaling Report` - 8 edges
7. `Step 7: Database Security & Cryptographic Backups Specification` - 8 edges
8. `DatabaseAdapter` - 7 edges
9. `Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)` - 7 edges
10. `Step 3: Playwright Python Scraper Specification` - 7 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/index.js → backend/src/database/db.js
- `runCampaignBackground()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/emailService.js → backend/src/database/db.js
- `authenticateUser()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/middlewares/authMiddleware.js → backend/src/database/db.js
- `runSecureBackup()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/backupService.js → backend/src/database/db.js
- `runSecureRestore()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/services/backupService.js → backend/src/database/db.js

## Import Cycles
- None detected.

## Communities (26 total, 3 thin omitted)

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
Cohesion: 0.07
Nodes (26): dependencies, @aws-sdk/client-s3, axios, bcryptjs, cheerio, cookie-parser, cors, dotenv (+18 more)

### Community 4 - "Express Server & Database Core"
Cohesion: 0.16
Nodes (22): getDb(), getFrenchDb(), allowedOrigins, app, bootstrap(), authenticatePortal(), authenticateUser(), router (+14 more)

### Community 5 - "Backup Service & Vault Encryption"
Cohesion: 0.07
Nodes (29): 1.1 Problem Statement, 1.2 Proposed Solution, 1.3 Core Agency Value Metrics, 1. Executive Summary & Strategic Value Proposition, 2.1 Technology Stack Selection, 2.1 Technology Stack Selection, 2. Platform Architecture & Technical Stack, 3.1 Scraping Execution Workflow (+21 more)

### Community 6 - "Backend Package Meta"
Cohesion: 0.07
Nodes (27): 1. Authentication & Session Management, 2. Playwright Python Scraper & Digital Audits, 2GB+ French Business Directory Architecture, 3. Database Architecture & PostgreSQL Migration, 4. Multi-Channel Campaigns & Staggering Queue, 5. Database Security: 10-Step Backup & 3-Stage Restore, 6. Containerization & Infrastructure as Code (IaC), Architectural Design (+19 more)

### Community 7 - "Root Package Workspace Meta"
Cohesion: 0.18
Nodes (10): description, devDependencies, concurrently, name, private, scripts, dev, install:all (+2 more)

### Community 9 - "Web Scraping & Google Maps Python Script"
Cohesion: 0.60
Nodes (5): audit_website(), clean_social_url(), main(), parse_args(), scrape_google_maps()

### Community 12 - "Step-by-Step Implementation Details"
Cohesion: 0.10
Nodes (20): 1. Secret Retrieval, 2. Key Management, 3. Database Dump Generation, 4. Integrity Validation (Pre-Encryption), 5. Symmetric Encryption, 6. Integrity Validation (Post-Encryption), 7. Metadata JSON Generation, 8. Remote Storage Upload (+12 more)

### Community 13 - "Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)"
Cohesion: 0.11
Nodes (17): 1.1 Problem Statement, 1.2 Proposed Solution, 1.3 Core Agency Value Metrics, 1. Executive Summary & Strategic Value Proposition, 2.1 Technology Stack Selection, 2. Platform Architecture & Technical Stack, 3.1 Scraping Execution Workflow, 3.2 Digital Maturity Enrichment Engine (+9 more)

### Community 14 - "Step 6: Versioning & Infrastructure as Code (IaC) Specification"
Cohesion: 0.13
Nodes (14): 1. Frontend Code Rollback, 1. Requirement Overview, 2. Backend Code Rollback, 2. Infrastructure as Code (IaC) Architecture, 3. Database State Rollback, 3. Versioning & Rollback Workflows, 4. Decision Rationale: Pros & Cons, 5. Security & Devops Best Practices (+6 more)

### Community 15 - "Step 5: Docker Containerization Specification"
Cohesion: 0.14
Nodes (13): 1. Requirement Overview, 1. `witech-frontend` (Vite SPA + Nginx), 2. Technical Architecture & Container Topology, 2. `witech-backend` (Node API + Scraper Environment), 3. Container Services & Dockerfiles, 3. `witech-postgres` (PostgreSQL Database Engine), 4. Decision Rationale: Pros & Cons, 4. `witech-vault` (Centralized Key Management) (+5 more)

### Community 16 - "Step 7: Database Security & Cryptographic Backups Specification"
Cohesion: 0.14
Nodes (13): 1. Requirement Overview, 2. Technical Architecture & Cryptographic Workflow, 3. The 10-Step Secure Backup Pipeline, 4. The 3-Stage Restore Pipeline, 5. Decision Rationale: Pros & Cons, 6. Security Analysis, 7. Client-Facing Talking Points (How to explain to a client), Cryptographic Method: Fernet (AES-128-CBC + HMAC) vs. Standard AES-256-GCM (+5 more)

### Community 17 - "Step 1: Authentication & Session Management Specification"
Cohesion: 0.15
Nodes (12): 1. Requirement Overview, 2. Technical Architecture & Decisions, 3. Decision Rationale: Pros & Cons, 4. Security & Vulnerability Analysis, 5. Client-Facing Talking Points (How to explain to a client), CSRF Mitigation Detail, Hidden Portals & Portal Session Gates, Password Hashing: bcryptjs (+4 more)

### Community 18 - "Step 4: Database Architecture & Optimizations Specification"
Cohesion: 0.15
Nodes (12): 1. Requirement Overview, 2. Technical Architecture & Adapter Design, 3. Optimizations & Indexing Strategy, 4. The Stream CSV Importer (Handling >2GB Datasets), 5. Security & Isolation Analysis, 6. Client-Facing Talking Points (How to explain to a client), Dual-Engine Database Adapter (`db.js`), Index Configurations (+4 more)

### Community 19 - "Step 2: UX and UI Design Specification"
Cohesion: 0.17
Nodes (11): 1. Requirement Overview, 2. Design Choices & Visual System, 3. Decision Rationale: Pros & Cons, 4. Usability & Accessibility (UX/A11y), 5. Client-Facing Talking Points (How to explain to a client), Color Layout: Light Mode CRM vs. Dark Mode CRM, Color Palette & Visual Identity, Layout & Page Architecture (+3 more)

### Community 20 - "Step 3: Playwright Python Scraper Specification"
Cohesion: 0.17
Nodes (11): 1. Requirement Overview, 2. Technical Architecture & Data Flow, 3. Playwright Sync API vs. Puppeteer Node, 4. Web Auditing & Scraping Algorithm Details, 5. Security Implications, 6. Client-Facing Talking Points (How to explain to a client), A. Cookie Consent Bypass, B. Scrolling Feed Selector (+3 more)

### Community 21 - "Wi'Tech Maps Prospector (Witech Lead)"
Cohesion: 0.18
Nodes (10): 1. Prerequisites, 2. Install All Dependencies, 3. Run the Application, Backend (Render, Railway, or VPS), Frontend (Vercel), 🛠️ Key Features, 🏗️ Platform Architecture, 📦 Production Deployment (+2 more)

### Community 22 - "Optimisation"
Cohesion: 0.29
Nodes (6): Add a login and signup page, Database., Database security system, Docker, Optimisation, Versionning

### Community 23 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

## Knowledge Gaps
- **209 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+204 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)` connect `Backup Service & Vault Encryption` to `Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Express Server & Database Core` to `Database Adapters & Init`, `Backend Router & CRM Services`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _209 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Packages & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `React Frontend Pages & Core App` be split into smaller, more focused modules?**
  _Cohesion score 0.11857707509881422 - nodes in this community are weakly interconnected._
- **Should `Backend Router & CRM Services` be split into smaller, more focused modules?**
  _Cohesion score 0.14210526315789473 - nodes in this community are weakly interconnected._
- **Should `Backend NPM Packages` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._