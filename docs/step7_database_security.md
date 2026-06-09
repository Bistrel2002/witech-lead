# Step 7: Database Security & Cryptographic Backups Specification

This document details the architectural implementation, cryptographic methods, and security operations governing the 10-step backup pipeline and 3-stage restore system.

---

## 1. Requirement Overview
The user requested implementing the database security plan defined in `database_security.md`:
- Standardized, secure encrypted backup and restore pipelines.
- Centralized secret management (Vault).
- Strong symmetric encryption (Fernet / AES-128-CBC + HMAC-SHA-256).
- Multi-point integrity validation (SHA-256).
- Remote object storage (AWS S3 / MinIO) and disk-level sanitization (zero-out scrubbing).

---

## 2. Technical Architecture & Cryptographic Workflow

```
[Postgres Database] --(pg_dump)--> [Plaintext SQL Dump] 
                                            |
                                    (SHA-256 Hash 1)
                                            v
[HashiCorp Vault] --(Fernet Key)----> [Fernet Encrypter]
                                            |
                                            v
                                    [Encrypted .enc]
                                            |
                                    (SHA-256 Hash 2)
                                            v
                                     [Metadata JSON]
                                            |
                                     (S3 Sync Upload)
                                            v
                                      [Amazon S3]
                                            |
                                 (Zero-Out Disk Scrub)
                                            v
                                    [Disk Blocks Safe]
```

---

## 3. The 10-Step Secure Backup Pipeline

The system automates the backup process using the following chronological operations (`backupService.js`):

1.  **Secret Retrieval**: Connects to HashiCorp Vault via API using a secure credentials token to fetch the database URL, S3 credentials, and encryption properties.
2.  **Key Management**: Retrieves the symmetric **Fernet** key. If one does not exist, a new key is generated (`fernet.Secret()`) and committed back to Vault.
3.  **Database Dump**: Runs `pg_dump` (for PostgreSQL) or performs a raw copy (for SQLite) to write the database content into a temporary SQL file under `/backups_tmp`.
4.  **Integrity Validation (Pre-Encryption)**: Computes a SHA-256 checksum of the plain SQL file. This forms the "source-of-truth" plaintext signature.
5.  **Symmetric Encryption**: Encrypts the SQL data using the Fernet symmetric key. Fernet combines AES-128-CBC encryption with a SHA-256 HMAC signature to verify both data secrecy and authenticity.
6.  **Integrity Validation (Post-Encryption)**: Computes a SHA-256 checksum of the resulting `.enc` binary to detect transfer corruption later.
7.  **Metadata Generation**: Constructs a JSON file detailing the timestamp, sizes, pre/post hashes, active table row counts, and algorithms used.
8.  **S3 Sync Upload**: Transmits both the `.enc` and `.json` metadata file to the private, versioned S3 bucket.
9.  **Zero-Out Disk Scrubbing**: Overwrites the temporary local plaintext SQL file with cryptographically secure random bytes (`crypto.randomBytes(fileSize)`) before unlinking it. This ensures that even raw disk scans cannot recover the deleted plaintext SQL data.
10. **Sanitization**: Deletes the local `.enc` and `.json` temp files.

---

## 4. The 3-Stage Restore Pipeline

Restores execute strict verification checks. If a verification check fails at any stage, the process halts immediately to prevent database corruption.

### Stage 1: Transport Integrity Check
- Downloader fetches the `.enc` and `.json` files from S3.
- Computes the SHA-256 hash of the downloaded `.enc` file.
- Compares it to `hash_apres_chiffrement` in the metadata. If it differs, **rejects the restore** (detects storage tampering or network download corruption).

### Stage 2: Decryption Integrity Check
- Fetches the Fernet key from Vault and decrypts the `.enc` file.
- Computes the SHA-256 hash of the decrypted plain SQL file.
- Compares it to `hash_avant_chiffrement` in the metadata. If it differs, **rejects the restore** (detects decryption key mismatch or payload corruption).

### Stage 3: Data Completeness Check
- Pipes the plaintext SQL dump into the active database (Postgres client / SQLite engine).
- Counts the live rows in the restored `leads` table and verifies that it matches the row count recorded in the metadata `total_rows`. If they do not match, it logs a warning.

---

## 5. Decision Rationale: Pros & Cons

### Cryptographic Method: Fernet (AES-128-CBC + HMAC) vs. Standard AES-256-GCM

| Cryptographic Method | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **Fernet (AES-128 + HMAC-SHA-256)** | **Authenticated Encryption**: Guarantees that ciphertext cannot be altered or read without the key. Has excellent Node.js support. | Slightly shorter key length compared to AES-256. | **Selected** (provides optimal performance and robust authenticity). |
| **Vanilla AES-256-GCM** | Standard 256-bit encryption key size. | More complex initialization vector (IV) and tag management; prone to coding implementation errors. | **Rejected** due to higher risk of implementation vulnerabilities. |

### Sanitization Strategy: Zero-Out Scrubbing vs. Simple file deletion (`fs.unlink`)
- **Zero-Out Scrubbing (Selected)**: Overwriting files with random bytes prevents disk recovery tools from salvaging raw database tables from deleted sectors.
- **Simple deletion**: Leaves plaintext database information intact on physical SSD/HDD blocks until the OS eventually overwrites it.

---

## 6. Security Analysis

*   **Key Separation**: S3 buckets hold only encrypted files. The key engine (Vault) is hosted in a completely different network. Compromising S3 alone yields zero readable information.
*   **Replay & Tampering Prevention**: The HMAC signature inside Fernet tokens prevents attackers from altering database records inside the backup files. Any modification will cause decryption to fail immediately.

---

## 7. Client-Facing Talking Points (How to explain to a client)
> "We treat your database backups with the highest level of security:
> - **Military-Grade Encryption**: All backups are encrypted using Fernet keys before leaving our server. Even if an attacker gains access to our storage buckets, they only see gibberish.
> - **Automatic Integrity Signatures**: The system signs backups with unique cryptographic hashes at each stage. We verify these signatures before restoring to guarantee the data hasn't been modified.
> - **Secure Deletion**: We overwrite temporary local files with random bytes before deleting them. This ensures no data remnants are left on the server's hard drive."
