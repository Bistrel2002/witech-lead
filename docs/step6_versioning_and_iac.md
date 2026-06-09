# Step 6: Versioning & Infrastructure as Code (IaC) Specification

This document describes the deployment pipeline, version management, rollback workflows, and AWS/Vercel resources managed by Terraform.

---

## 1. Requirement Overview
The user requested a reliable release management and roll-out structure:
- A versioning system that tracks application updates.
- Ability to rollback code or database states easily.
- Propose deployment configurations to direct updates to individual instances or groups of instances.
- Act as a senior DevOps engineer to configure automated infrastructure blueprints.

---

## 2. Infrastructure as Code (IaC) Architecture

We chose **Terraform** to manage and orchestrate the cloud infrastructure, ensuring that development, staging, and production environments remain identical.

### Resources Provisioned (`main.tf`)
1.  **Vercel Frontend Project**:
    - Automatically links to the GitHub repository (`Bistrel2002/witech-lead`).
    - Compiles and deploys the Vite React code.
    - Manages production environment parameters (`VITE_API_URL` pointing to AWS backend instances and disabling developer mock switches: `VITE_MOCK_AUTH=false`).
2.  **AWS RDS PostgreSQL Instance**:
    - Provisions a managed `db.t3.micro` Postgres database.
    - Features automatic storage scaling starting at 20GB up to 100GB to accommodate growth.
3.  **AWS S3 Backup Bucket**:
    - Allocates a private storage bucket specifically for CRM database backups.
    - **Versioning Enabled**: Keeps old revisions of backup files. If a file is corrupted, overwritten, or malicious deletion is attempted, administrators can recover previous versions of the SQL dump.
    - **Public Access Blocked**: Blocks all public permissions (`block_public_acls = true`, etc.), forcing access strictly through IAM keys.

```
                   +------------------------+
                   |    Terraform Engine    |
                   +------------------------+
                   /           |            \
       (API Token) /           | (IAM Keys)  \ (IAM Keys)
                  v            v              v
         [Vercel Project]  [AWS RDS PG]   [AWS S3 Bucket]
         (React Frontend)  (Database Core) (Encrypted Dumps)
```

---

## 3. Versioning & Rollback Workflows

### Code Versioning (Semantic Versioning - SemVer)
The codebase uses standard SemVer tags (`vMAJOR.MINOR.PATCH`):
*   **MAJOR**: Breaking changes (e.g. database schema migrations).
*   **MINOR**: New features (e.g. adding WhatsApp support).
*   **PATCH**: Bug fixes (e.g. scraper element updates).

### Rollback Procedures

#### 1. Frontend Code Rollback
- **Mechanism**: Vercel keeps an immutable snapshot of every Git commit deploy.
- **Action**: In the event of a critical frontend bug, the DevOps engineer navigates to the Vercel dashboard and clicks "Rollback" on the last known stable deployment. The rollback takes effect globally in **less than 10 seconds** without rebuilding code.

#### 2. Backend Code Rollback
- **Mechanism**: Docker images are built and pushed to a registry (e.g. AWS ECR) tagged with the version tag (e.g. `witech-backend:v1.2.0`).
- **Action**: To roll back the API, the container orchestrator updates the target container image to the previous tag (e.g. `witech-backend:v1.1.9`) and performs a rolling update.

#### 3. Database State Rollback
- **Mechanism**: Handled by S3 bucket versioning and our restore tool.
- **Action**: If database tables are corrupted, administrators use the CRM Restore route `/api/portal/admin/backups/restore` to pull the cryptographic database dump, decrypt it via Vault, verify SHA-256 hashes, and reload the database.

---

## 4. Decision Rationale: Pros & Cons

### Infrastructure Management: Terraform vs. Manual Cloud Console Setup

| Strategy | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **Terraform IaC** | **No Config Drift**: Cloud setups are documented in code. **Multi-Tenant Scaling**: Deploying new server environments for separate clients requires simply changing a variable file (`variables.tf`). | Requires managing the Terraform state file securely. | **Selected**. |
| **Manual AWS Console** | Quick setup for a single instance; no scripting required. | Impossible to duplicate reliably; prone to manual permission errors; no version history. | **Rejected**. |

---

## 5. Security & Devops Best Practices

*   **Secret Protection in State Files**: Terraform state files (`.tfstate`) contain plain passwords.
    - *Mitigation*: State files should be stored in a remote S3 backend with encryption at rest enabled (KMS) and access limited to deployment servers (CI/CD runners).
*   **VPC Peering**: In the default Terraform configuration, RDS is marked `publicly_accessible = true` to facilitate initial dev connections.
    - *Production Recommendation*: RDS should be marked `publicly_accessible = false` and placed inside a private subnet. The backend container should connect to it using a VPC endpoint or Peering connection.

---

## 6. Client-Facing Talking Points (How to explain to a client)
> "We implement Infrastructure as Code (IaC) to give you enterprise stability:
> - **Instant recovery**: All database backups are stored on Amazon S3 with full versioning history. If database rows are deleted by accident, we can roll back to any hourly checkpoint.
> - **One-Click Deployments**: We can spin up a dedicated, isolated server stack for new branches or regions in minutes using our code blueprint.
> - **Git Version Tracking**: Every update goes through a Git revision process. If a new release has a bug, we can roll back the entire frontend globally in under 10 seconds."
