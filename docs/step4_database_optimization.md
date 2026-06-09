# Step 4: Database Architecture & Optimizations Specification

This document details the transition from file-based storage to a PostgreSQL enterprise engine, query optimization structures, user session isolation, and the streaming architecture for importing French businesses.

---

## 1. Requirement Overview
The user requested a complete database reorganization to transition the application into a robust, concurrent CRM:
- Transition from SQLite to **PostgreSQL** for production deployment.
- Implement data optimizations (indexes, connection pooling, isolated lookup databases).
- Restrict data access via role permissions (Admin, User, Team Member) so that actions do not conflict or compromise security.
- Handle a large **French Business Database (>2GB)** without increasing main database weight or causing memory exhaustion.

---

## 2. Technical Architecture & Adapter Design

### Dual-Engine Database Adapter (`db.js`)
To support both zero-configuration local development (SQLite) and production scaling (PostgreSQL), we designed a database adapter.

*   **Dynamic Parsing**: The adapter accepts standard query statements and converts them at runtime based on the target engine:
    *   Replaces SQLite positional parameters (`?`) with PostgreSQL indexed parameters (`$1`, `$2`).
    *   Translates SQLite-specific `INSERT OR IGNORE / REPLACE` queries into Postgres-compatible `ON CONFLICT (key) DO UPDATE / NOTHING` statements.
*   **Postgres Connection Pooling (`pg.Pool`)**: In production, the system creates a pool of connections. Instead of opening and closing database connections for every request, connections are kept active and reused.

```
                  +---------------------+
                  |   Express Backend   |
                  +---------------------+
                             |
                   DATABASE_URL Config?
                   /                 \
             (Yes) /                 \ (No)
                  v                   v
           [Postgres Pool]     [Local SQLite File]
```

### Separated Directory Database (`getFrenchDb()`)
To ensure that search lookups across the 2GB+ French business directory do not slow down main CRM operations (creating campaigns, sending emails), we separated the database architectures:
- **Main CRM DB**: Stores user profiles, lead pipelines, templates, and campaign logs. This database is lightweight (<100MB) and indexed for write/read speeds.
- **French Business DB**: Hosted on a separate, dedicated PostgreSQL instance or schema. The CRM accesses it via an independent, read-only connection pool.

---

## 3. Optimizations & Indexing Strategy

### Index Configurations
We established B-Tree indexing on fields used inside filtering, search, and campaign processing:
-   `idx_leads_city` on `leads(city)` - Speeds up geographical prospecting queries.
-   `idx_leads_category` on `leads(category)` - Optimizes business segment filtering.
-   `idx_leads_status` on `leads(status)` - Enhances campaign queue querying (e.g. getting only `New` or `Warm` leads).
-   `idx_leads_email` on `leads(email)` - Speeds up email duplicates verification.
-   `idx_campaigns_status` on `campaigns(status)` - Speeds up active queue tracking.

---

## 4. The Stream CSV Importer (Handling >2GB Datasets)

### The Memory Problem
Loading a 2GB+ CSV file into memory all at once with conventional JSON parsers requires more than 4GB of RAM, triggering Node.js Out-Of-Memory (OOM) crashes.

### The Streaming Solution
The importer uses Node.js event streams:
1.  **Chunked Streams**: The backend receives the CSV file via HTTP chunk-by-chunk (`req.on('data')`).
2.  **Row Parsing**: Incoming chunks are parsed into lines and mapped to columns on-the-fly.
3.  **Batch Flushes**: Rows are collected in a buffer. Once the buffer hits **500 rows**, a bulk SQL statement is constructed and flushed to the database.
4.  **Resource Caps**: The stream is temporarily paused (`req.pause()`) during database flushes and resumed (`req.resume()`) immediately after. This bounds RAM usage to under **50MB**, regardless of CSV size.

---

## 5. Security & Isolation Analysis

*   **SQL Injection Vulnerability**: Scraper outputs and CSV rows contain unverified inputs.
    *   *Mitigation*: All queries executed through the `DatabaseAdapter` are parameterized. User inputs are sent separately from the query instructions, completely neutralizing injection risks.
*   **Concurrency & Session Leakage**: Multiple users accessing the CRM simultaneously could cause race conditions.
    *   *Mitigation*: Connection pooling isolates transactions. Standard queries filter by explicit user scopes where applicable.
*   **Role-Based Access Control (RBAC)**:
    *   Standard routes (`/leads`, `/campaigns`) require `authenticateUser`.
    *   Management operations (user administration, triggers for cryptographically signed backups) require portal authentication (`authenticatePortal('admin')`).

---

## 6. Client-Facing Talking Points (How to explain to a client)
> "We design our databases to handle enterprise scale:
> - **Zero Sluggishness**: By placing the national French directory (containing millions of business records) on its own separate database, your core workspace remains fast and unburdened.
> - **Chunked Uploads**: You can upload spreadsheets containing millions of rows. Our system processes files in small, highly-optimized blocks, guaranteeing that uploads do not freeze or crash the server.
> - **Parameterized Security**: We use strict parameter filters on all database queries, which means external malicious inputs cannot alter, read, or damage your records."
