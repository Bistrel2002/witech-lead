# Witech CRM Modernization: Architecture, Security, & Scaling Report

This document serves as the official architectural specification and security report for the modernized **Witech Lead CRM** platform. It describes the technical design decisions, comparative pros and cons, security implications, and implementation strategies for each component.

---

## Table of Contents
1. [Authentication & Session Management](#1-authentication--session-management)
2. [Playwright Python Scraper & Digital Audits](#2-playwright-python-scraper--digital-audits)
3. [Database Architecture & PostgreSQL Migration](#3-database-architecture--postgresql-migration)
4. [Multi-Channel Campaigns & Staggering Queue](#4-multi-channel-campaigns--staggering-queue)
5. [Database Security: 10-Step Backup & 3-Stage Restore](#5-database-security-10-step-backup--3-stage-restore)
6. [Containerization & Infrastructure as Code (IaC)](#6-containerization--infrastructure-as-code-iac)

---

## 1. Authentication & Session Management

### Architectural Design
To secure user access, the CRM implements cookie-based JSON Web Token (JWT) sessions alongside OAuth integrations (Google/Apple) and password-gated secret portals.

```
+------------------+        /api/auth/login        +---------------------+
|                  | ----------------------------> |                     |
|   React Client   |                               |  Express API Server |
|                  | <---------------------------- |                     |
+------------------+   Set-Cookie: auth_token      +---------------------+
                                                      |
                                                      v
                                               Database Check
                                           (bcrypt Password Verify)
```

#### JWT HttpOnly Cookies vs. LocalStorage
*   **HttpOnly Cookies (Selected)**: The JWT is stored in a cookie configured with `HttpOnly`, `Secure`, and `SameSite=Lax` headers.
    *   *Pros*: Mitigates Cross-Site Scripting (XSS) attacks because JavaScript running in the browser cannot read the cookie content.
    *   *Cons*: Susceptible to Cross-Site Request Forgery (CSRF) if not protected.
    *   *Mitigation*: Setting `SameSite=Lax` ensures that cookies are not sent on cross-site subrequests (e.g. image loads), protecting against CSRF.
*   **LocalStorage**: JWT stored in browser storage and appended in the `Authorization` header.
    *   *Pros*: Immune to CSRF attacks.
    *   *Cons*: Vulnerable to XSS. If any third-party script or dependency is compromised, it can read the token and hijack the user session.

### Google / Apple OAuth and Mock Bypass
- **Mock Bypass (`VITE_MOCK_AUTH=true`)**: In local development, developers can bypass OAuth login prompts. Clicking "Google" or "Apple" immediately logs in a mock user without contacting external APIs.
  - *Security Implication*: The mock bypass is strictly restricted to development environments. In production, this flag is disabled in the environment configuration, forcing real OAuth token handshakes.

### Obfuscated Portals (/portal/admin-panel & /portal/team-space)
- **Design Decision**: The portals are hidden from the primary user interface. There are no navigation links in the standard sidebar. Access requires navigating directly to the secret URL paths.
- **Portal Password Gate**: Even if a user knows the URL, they are presented with a separate, dark HUD password gate. The gate verifies the password against environment variables (`ADMIN_PORTAL_PASSWORD` / `TEAM_PORTAL_PASSWORD`) and issues an independent, short-lived (8 hours) portal cookie token (`admin_portal_token` / `team_portal_token`).

---

## 2. Playwright Python Scraper & Digital Audits

### Architectural Design
The Google Maps scraper has been re-engineered in Python using Playwright and BeautifulSoup to replace the old Puppeteer JavaScript crawler.

```
+--------------------+                       +---------------------+
|                    |   Spawn (Child Proc)  |                     |
| Express Backend    | --------------------> | python3 scraper.py  |
|                    |                       |                     |
+--------------------+                       +---------------------+
          ^                                             |
          |               JSON Stdout Stream            |
          +---------------------------------------------+
```

#### Playwright Python vs. Puppeteer Node
*   **Playwright Python (Selected)**: Spawns a Python child process within a dedicated virtual environment (`venv`).
    *   *Pros*: Python has a robust ecosystem for data manipulation and parsing (`beautifulsoup4`, `pandas`, `nltk`). Spawning a child process keeps the main Node.js event loop unblocked. Playwright auto-handles anti-scraping checks better than vanilla Puppeteer.
    *   *Cons*: Slightly higher startup overhead when spawning a new process.
*   **Puppeteer Node**: Headless browser controller written in JavaScript.
    *   *Pros*: Native to Node.js; no need to spawn child processes.
    *   *Cons*: Prone to locking the CPU event loop under heavy scraping tasks.

### Cookie Consent & scrolling Feed Selectors
- **Consent Bypass**: The scraper checks for the presence of Google's consent dialog buttons (`"Tout accepter"`, `"Accept all"`) and clicks them to expose the search page.
- **Scroll Engine**: The left results pane (`div[role="feed"]`) is scrolled iteratively to load listings. To ensure memory safety, scrolling caps at 40 leads per run.

### Digital Audit Algorithm
For every lead with a website, the scraper triggers a secondary thread to audit the site:
1.  **SSL Validation**: Asserts if the connection redirects successfully to `https://`.
2.  **Mobile Friendly Check**: Scans HTML tags to check if `<meta name="viewport" content="width=device-width">` is present.
3.  **Email Extraction**: Performs double-layered checks using a `mailto:` tag scan and a Regex lookup over the raw HTML body.
4.  **Social Channels Detection**: Scans anchor links (`<a>`) for URLs containing Facebook, Instagram, LinkedIn, and Twitter/X.
5.  **Chat Widget Scan**: Searches the DOM for signatures of popular chat widgets (Crisp, Intercom, Tawk.to, Calendly, Drift, HubSpot).
6.  **Tech Stack Fingerprinting**: Reads the `<meta name="generator">` tag and HTML keywords to detect CMS stacks (WordPress, Wix, Squarespace, Shopify).

---

## 3. Database Architecture & PostgreSQL Migration

### Architectural Design
To handle enterprise scaling, the application database was migrated from SQLite to **PostgreSQL 15**.

```
                           +----------------------+
                           |  Express Application |
                           +----------------------+
                              /                \
             Main DB Pool    /                  \   External DB Pool
             (Write/Read)   /                    \  (Read-Only Lookup)
                           v                      v
                  +-----------------+     +-----------------------+
                  |  Main CRM DB    |     |  French Business DB   |
                  |  (Lightweight)  |     |  (2GB+ National Table)|
                  +-----------------+     +-----------------------+
```

### PostgreSQL vs. SQLite
*   **PostgreSQL (Selected)**: Robust relational database.
    *   *Pros*: High concurrency (handles hundreds of simultaneous read/write connections), advanced transaction isolation, built-in support for indexes, partitions, and role permissions.
    *   *Cons*: Requires hosting and administration.
*   **SQLite**: File-based database.
    *   *Pros*: Zero configuration, serverless.
    *   *Cons*: File locking on concurrent writes. Slows down significantly when data exceeds 1GB.

### Database Indexing & Optimizations
The PostgreSQL database has B-tree indexes applied to fields queried in search filters:
-   `idx_leads_city` & `idx_leads_category`: Speeds up CRM lead filtering.
-   `idx_leads_status` & `idx_leads_email`: Optimizes campaign targeting.

### 2GB+ French Business Directory Architecture
To keep the main database lightweight (<100MB), the 2GB+ national directory of French businesses is stored separately.
-   **Read-Only Schema Separation**: The national directory is hosted on a separate PostgreSQL database/schema. The Express server queries it through a separate database connection pool.
-   **Stream CSV Importer**: Uploading large CSVs is processed using Node stream events. As chunks of data arrive, they are parsed and written to the database in bulk inserts of **500 rows**. This ensures that the memory footprint stays under **50MB**, even when importing files larger than 2GB.

---

## 4. Multi-Channel Campaigns & Staggering Queue

### Architectural Design
Witech CRM supports automated campaigns across three channels: **Email** (SMTP), **SMS** (Twilio), and **WhatsApp** (Twilio WhatsApp).

```
                      +-----------------------------+
                      |   Campaign Process Trigger  |
                      +-----------------------------+
                                     |
                       Loop Leads with 5s Delay
                                     |
                +--------------------+--------------------+
                |                    |                    |
            [Email]                [SMS]             [WhatsApp]
                |                    |                    |
                v                    v                    v
          SMTP Server           Twilio SMS API      Twilio WhatsApp API
```

### Outreach Channel Routing
- **Email**: Compiled templates are sent via Nodemailer.
- **SMS**: Twilio's messages resource sends text templates directly to phone numbers.
- **WhatsApp**: Pre-pends `whatsapp:` to sender and recipient phone numbers, formatting phone numbers to E.164 standard (e.g. `+33xxxxxxxxx`).

### Staggering Queue (Spam Regulation & Limits)
To protect SMTP server IP reputations and comply with Twilio's sending limits, a **5-second staggering delay** is executed between every message.
- *Pros*: Mimics natural human behavior to bypass carrier spam filters, prevents API rate limiting (429 errors), and ensures stable queue execution.

---

## 5. Database Security: 10-Step Backup & 3-Stage Restore

### The 10-Step Secure Backup Pipeline
To ensure the confidentiality and integrity of database dumps, a strict cryptographic pipeline is executed:

```
[Start] -> Fetch Vault Secrets -> Get Fernet Key -> Run pg_dump -> Check 1 (Pre-Enc SHA-256)
   -> Encrypt with Fernet -> Check 2 (Post-Enc SHA-256) -> Write Metadata JSON
   -> S3 Upload -> Zero-out Disk Scrubbing -> [Done]
```

1.  **Secret Fetch**: Credentials (DB URL, S3 Keys) are retrieved from HashiCorp Vault. No secrets are hardcoded.
2.  **Key Retrieval**: Fetches the symmetric **Fernet** key from the vault (or generates a new one if missing).
3.  **Database Dump**: Runs `pg_dump` (Postgres) or duplicates the file (SQLite) into a local `/tmp` folder.
4.  **Check 1 (Pre-Encryption SHA-256)**: Computes the SHA-256 hash of the plaintext SQL dump.
5.  **Symmetric Encryption**: Encrypts the SQL dump using Fernet (AES-128-CBC + HMAC-SHA-256).
6.  **Check 2 (Post-Encryption SHA-256)**: Computes the SHA-256 hash of the encrypted `.enc` file.
7.  **Metadata JSON Generation**: Saves a JSON file containing the timestamps, hashes, file sizes, and database row count statistics.
8.  **Remote S3 Upload**: Uploads both the `.enc` and `.json` files to S3/MinIO.
9.  **Zero-out Scrubbing**: Overwrites the local plaintext SQL file with random bytes before deletion to prevent data extraction from disk.
10. **Sanitization**: Deletes the local encrypted and JSON metadata files.

### The 3-Stage Restore pipeline
A restore will fail immediately if any integrity verification checks fail:
-   **Check 1 (Transport Integrity)**: Computes the SHA-256 of the downloaded `.enc` file and verifies it matches the metadata `hash_apres_chiffrement`.
-   **Check 2 (Decryption Integrity)**: Decrypts the archive using the Fernet key, computes the SHA-256 of the resulting `.sql` file, and verifies it matches `hash_avant_chiffrement`.
-   **Check 3 (Data Completeness)**: Restores the SQL dump, runs a count query over the live `leads` table, and verifies it matches the row count recorded in the metadata.

---

## 6. Containerization & Infrastructure as Code (IaC)

### Docker Compose Container Stack
The application is structured into five containerized services to ensure network isolation:
-   `witech-frontend`: Nginx serving static React bundle, routing SPA paths to `index.html`.
-   `witech-backend`: Node.js Express server + Python Playwright runtime.
-   `witech-postgres`: Persistent PostgreSQL database.
-   `witech-vault`: Dev instance of HashiCorp Vault.
-   `witech-minio`: Local S3-compatible bucket for database backups.

### Terraform Blueprint
Blueprints in `terraform/main.tf` and `variables.tf` manage cloud resources:
-   **Vercel Project**: Deploys the React frontend and sets environment variables (`VITE_API_URL`).
-   **AWS RDS PostgreSQL**: Allocates a managed Postgres instance with automatic scaling.
-   **AWS S3 Bucket**: Provisions a private, versioned bucket for encrypted database backups.
