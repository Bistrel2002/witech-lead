# Step 5: Docker Containerization Specification

This document details the configuration, networking, and multi-stage container architecture designed for local development and single-command production deployment.

---

## 1. Requirement Overview
The user requested containerizing the Witech Lead platform to simplify deployment, isolate services, and protect data networks:
- Containerize the entire web application.
- Establish sub-containers (microservices) for the database, security key engines, storage systems, backend, and frontend.
- Author a `docker-compose.yml` file to launch the stack in a single execution.
- Create a `.env.example` template containing necessary configuration flags.

---

## 2. Technical Architecture & Container Topology

The application structure is split into five containerized services connected over an isolated Docker network bridge:

```
                  +---------------------------+
                  |  User Browser (Port 80)   |
                  +---------------------------+
                                |
                                v
                   +-------------------------+
                   |  witech-frontend        | (Serves React App via Nginx)
                   +-------------------------+
                                |
             (Proxies API Requests to Port 3001)
                                v
                   +-------------------------+
                   |  witech-backend         | (Node Express + Python Playwright)
                   +-------------------------+
                    /           |           \
         (Internal API)   (Internal API)   (Internal API)
                  /             |             \
                 v              v              v
     +---------------+  +---------------+  +---------------+
     |witech-postgres|  | witech-vault  |  | witech-minio  |
     | (Postgres 15) |  | (Secrets Eng) |  | (Local S3)    |
     +---------------+  +---------------+  +---------------+
```

---

## 3. Container Services & Dockerfiles

### 1. `witech-frontend` (Vite SPA + Nginx)
- **Multi-Stage Build**:
  - **Stage 1 (Build)**: Pulls a lightweight Node image, installs dependencies using `--legacy-peer-deps` (to bypass peer conflicts), and runs the Vite build compiler to generate the static files.
  - **Stage 2 (Nginx)**: Pulls a minimal Nginx image, discards the source code and `node_modules` from Stage 1, copies the compiled static assets into Nginx's public serving folder, and sets up a custom routing file.
- **Routing Resolution**: Standard Nginx configuration fails when a user reloads pages directly (e.g. `/portal/admin-panel`). We applied a fallback redirect configuration so that Nginx serves the main `index.html` file, letting the React router load correct views dynamically.

### 2. `witech-backend` (Node API + Scraper Environment)
- **Base Image**: Built on `mcr.microsoft.com/playwright:v1.44.0-jammy` (Ubuntu Jammy preloaded with required system dependencies for headless browsers).
- **Environment**: Installs Node packages, builds a Python virtual environment (`venv`), installs data-science dependencies (`requests`, `beautifulsoup4`, `playwright`), and triggers Playwright's Chromium CLI utility to fetch optimized binaries.

### 3. `witech-postgres` (PostgreSQL Database Engine)
- **Base Image**: `postgres:15-alpine`.
- **Persistence**: Mounts a volume (`postgres_data`) mapping `/var/lib/postgresql/data` to ensure CRM data is not deleted when the container is stopped or rebuilt.

### 4. `witech-vault` (Centralized Key Management)
- **Base Image**: `hashicorp/vault:latest`.
- **Purpose**: Runs a local Vault server to manage symmetric cryptographic keys and S3/SMTP passwords.

### 5. `witech-minio` (S3 Backup Target)
- **Base Image**: `minio/minio:latest`.
- **Purpose**: Acts as a local S3 endpoint for testing encrypted backup storage.

---

## 4. Decision Rationale: Pros & Cons

### Playwright Backend Packaging Strategy: Single Base Image vs. Multi-Container Orchestration

| Strategy | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **Combined Node + Playwright Base (Selected)** | **No Network Latency**: Scraper runs locally as a child process; instant data piping via process stdout. **Simplified Setup**: Single Node codebase coordinates browser spawns. | Large container image size (~1.5GB) due to Playwright headless browser binaries. | **Selected**. |
| **Separate Scraper Service Container** | Keeps Node server extremely lightweight; divides scraper memory footprint. | Requires designing a complex REST or gRPC communication API between Node and Python containers; higher setup overhead. | **Rejected** for initial CRM launch. |

---

## 5. Security & Isolation Analysis

*   **Port Exposure Whitelisting**:
    - *Only* port `80` (Frontend) and port `3001` (Backend API) are exposed to the host machine.
    - Databases, secret vaults, and MinIO storage ports are isolated within the internal bridge network. Attackers cannot probe PostgreSQL (port `5432`) or Vault (port `8200`) from the public internet.
*   **Persistent Volume Protection**:
    - Host mounts are restricted to dedicated volumes (`postgres_data`, `minio_data`) controlled directly by Docker to prevent unauthorized file read/write permissions from the local filesystem.

---

## 6. Client-Facing Talking Points (How to explain to a client)
> "We leverage Docker containerization to deliver a highly reliable system:
> - **Self-Contained Security**: Databases, cryptographic key vaults, and file storage containers communicate over an invisible private network. They are inaccessible from the outside world.
> - **Crash Resilience**: If a scraping thread encounters a corrupted website and crashes, it affects only that container. The database and main frontend continue to run smoothly.
> - **Consistent Runs**: The application runs inside identical Linux environments on development, staging, and production servers, eliminating environmental bugs."
