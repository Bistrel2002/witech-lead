import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fernet from 'fernet';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getDb } from '../database/db.js';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_DIR = path.resolve(__dirname, '../../../../backups_tmp');
const LOCAL_BACKUP_DIR = path.resolve(__dirname, '../../../../backups_local');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_BACKUP_DIR)) fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });

// 1. Fetch secrets from HashiCorp Vault (or fall back to env)
async function getVaultSecrets() {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const secretPath = process.env.VAULT_SECRET_PATH || 'witech-crm';

  if (!vaultAddr || !vaultToken) {
    console.log("BackupService: Vault credentials missing, using environment variables directly.");
    return process.env;
  }

  try {
    const res = await axios.get(`${vaultAddr}/v1/secret/data/${secretPath}`, {
      headers: { 'X-Vault-Token': vaultToken }
    });
    console.log("BackupService: Successfully fetched secrets from HashiCorp Vault.");
    return res.data.data.data;
  } catch (err) {
    console.warn(`BackupService: Failed to connect to Vault (${err.message}). Falling back to local env variables.`);
    return process.env;
  }
}

// Compute SHA-256 checksum of a file in chunks to avoid OOM
function getFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

// Upload a file to S3
async function uploadToS3(secrets, filePath, s3Key) {
  const s3Client = new S3Client({
    endpoint: secrets.S3_ENDPOINT || null,
    region: secrets.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: secrets.S3_ACCESS_KEY_ID || secrets.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: secrets.S3_SECRET_ACCESS_KEY || secrets.AWS_SECRET_ACCESS_KEY || ''
    },
    forcePathStyle: true // Needed for MinIO/LocalStack
  });

  const fileStream = fs.createReadStream(filePath);
  const uploadParams = {
    Bucket: secrets.S3_BUCKET || 'witech-backups',
    Key: s3Key,
    Body: fileStream
  };

  await s3Client.send(new PutObjectCommand(uploadParams));
}

// Download a file from S3
async function downloadFromS3(secrets, s3Key, destPath) {
  const s3Client = new S3Client({
    endpoint: secrets.S3_ENDPOINT || null,
    region: secrets.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: secrets.S3_ACCESS_KEY_ID || secrets.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: secrets.S3_SECRET_ACCESS_KEY || secrets.AWS_SECRET_ACCESS_KEY || ''
    },
    forcePathStyle: true
  });

  const downloadParams = {
    Bucket: secrets.S3_BUCKET || 'witech-backups',
    Key: s3Key
  };

  const response = await s3Client.send(new GetObjectCommand(downloadParams));
  const writeStream = fs.createWriteStream(destPath);
  
  return new Promise((resolve, reject) => {
    response.Body.pipe(writeStream);
    writeStream.on('finish', () => resolve());
    writeStream.on('error', (err) => reject(err));
  });
}

// Generate the symmetric Fernet Key
function getOrCreateFernetKey(secrets) {
  let key = secrets.FERNET_KEY;
  if (!key) {
    console.log("BackupService: FERNET_KEY not found in secrets. Generating new key...");
    const secret = new fernet.Secret();
    key = secret.key;
  }
  return key;
}

// Perform the 10-step secure backup pipeline
export async function runSecureBackup() {
  console.log("BackupService: Starting secure backup pipeline...");
  const secrets = await getVaultSecrets();
  const db = await getDb();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}`;
  
  const plainDumpPath = path.join(TEMP_DIR, `${backupName}.sql`);
  const encDumpPath = path.join(TEMP_DIR, `${backupName}.enc`);
  const metadataPath = path.join(TEMP_DIR, `${backupName}.json`);

  try {
    // 2. Key Management
    const fernetKey = getOrCreateFernetKey(secrets);
    const secret = new fernet.Secret(fernetKey);

    // 3. Generate Database Dump
    if (db.isPg) {
      console.log("BackupService: Generating pg_dump for PostgreSQL...");
      // Fetch connection URL parts
      const pgUrl = process.env.DATABASE_URL || secrets.DATABASE_URL;
      if (!pgUrl) throw new Error("Postgres connection string missing.");
      
      // Execute pg_dump
      await execPromise(`pg_dump "${pgUrl}" -f "${plainDumpPath}"`);
    } else {
      console.log("BackupService: Generating SQLite backup...");
      // For SQLite, a simple file copy acts as the dump
      const sqlitePath = path.resolve(__dirname, '../../../database.sqlite');
      if (!fs.existsSync(sqlitePath)) {
        throw new Error("SQLite database file not found.");
      }
      fs.copyFileSync(sqlitePath, plainDumpPath);
    }

    // 4. Integrity Validation (Pre-Encryption SHA-256)
    const plainHash = await getFileSha256(plainDumpPath);
    const plainSize = fs.statSync(plainDumpPath).size;

    // 5. Symmetric Encryption using Fernet
    console.log("BackupService: Encrypting backup with Fernet...");
    const plainContent = fs.readFileSync(plainDumpPath);
    const token = new fernet.Token({
      secret: secret,
      time: Date.now()
    });
    const encryptedContent = token.encode(plainContent.toString('base64'));
    fs.writeFileSync(encDumpPath, encryptedContent);

    // 6. Integrity Validation (Post-Encryption SHA-256)
    const encHash = await getFileSha256(encDumpPath);
    const encSize = fs.statSync(encDumpPath).size;

    // Fetch stats for metadata validation (e.g. row counts)
    let totalRows = 0;
    try {
      const stats = await db.get("SELECT COUNT(*) as count FROM leads");
      totalRows = Number(stats.count);
    } catch (_) {}

    // 7. Generate Metadata JSON
    const metadata = {
      timestamp: new Date().toISOString(),
      backup_name: backupName,
      db_type: db.isPg ? 'PostgreSQL' : 'SQLite',
      hash_avant_chiffrement: plainHash,
      taille_avant_chiffrement: plainSize,
      hash_apres_chiffrement: encHash,
      taille_apres_chiffrement: encSize,
      total_rows: totalRows,
      vault_key_path: process.env.VAULT_SECRET_PATH || 'witech-crm',
      algorithm: 'Fernet/AES-128-CBC-HMAC-SHA256'
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // 8. Remote Storage Upload
    const s3KeyEnc = `backups/${backupName}.enc`;
    const s3KeyJson = `backups/${backupName}.json`;

    if (secrets.S3_BUCKET) {
      console.log(`BackupService: Uploading backup files to S3 bucket '${secrets.S3_BUCKET}'...`);
      await uploadToS3(secrets, encDumpPath, s3KeyEnc);
      await uploadToS3(secrets, metadataPath, s3KeyJson);
      console.log("BackupService: Uploaded to S3 successfully.");
    } else {
      console.log("BackupService: S3_BUCKET not configured. Saving backups in local archive directory.");
      fs.copyFileSync(encDumpPath, path.join(LOCAL_BACKUP_DIR, `${backupName}.enc`));
      fs.copyFileSync(metadataPath, path.join(LOCAL_BACKUP_DIR, `${backupName}.json`));
    }

    return {
      success: true,
      backupName,
      metadata
    };

  } finally {
    // 9 & 10. Clean-up & Sanitization (Always run to prevent plaintext leaks in tmp)
    console.log("BackupService: Scrubbing local temporary files...");
    if (fs.existsSync(plainDumpPath)) {
      // Zero-out file before unlinking to ensure secure scrubbing
      fs.writeFileSync(plainDumpPath, crypto.randomBytes(fs.statSync(plainDumpPath).size));
      fs.unlinkSync(plainDumpPath);
    }
    if (fs.existsSync(encDumpPath)) fs.unlinkSync(encDumpPath);
    if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
  }
}

// Perform the 3-stage secure restore pipeline
export async function runSecureRestore(backupName) {
  console.log(`BackupService: Starting secure restore pipeline for '${backupName}'...`);
  const secrets = await getVaultSecrets();
  const db = await getDb();

  const encDumpPath = path.join(TEMP_DIR, `${backupName}.enc`);
  const metadataPath = path.join(TEMP_DIR, `${backupName}.json`);
  const plainDumpPath = path.join(TEMP_DIR, `${backupName}.sql`);

  try {
    // Download files from S3 or fetch from local archives
    if (secrets.S3_BUCKET) {
      console.log(`BackupService: Fetching backup from S3 bucket '${secrets.S3_BUCKET}'...`);
      await downloadFromS3(secrets, `backups/${backupName}.enc`, encDumpPath);
      await downloadFromS3(secrets, `backups/${backupName}.json`, metadataPath);
    } else {
      console.log("BackupService: S3 not configured. Loading from local archive folder...");
      const localEnc = path.join(LOCAL_BACKUP_DIR, `${backupName}.enc`);
      const localJson = path.join(LOCAL_BACKUP_DIR, `${backupName}.json`);
      if (!fs.existsSync(localEnc) || !fs.existsSync(localJson)) {
        throw new Error("Backup archive files not found in local storage.");
      }
      fs.copyFileSync(localEnc, encDumpPath);
      fs.copyFileSync(localJson, metadataPath);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // Check 1: Verify Encrypted Archive Integrity
    console.log("BackupService: Verification Check 1 (Encrypted Hash)...");
    const downloadedEncHash = await getFileSha256(encDumpPath);
    if (downloadedEncHash !== metadata.hash_apres_chiffrement) {
      throw new Error("CRITICAL: Verification Check 1 FAILED. Encrypted file has been tampered with or corrupted.");
    }
    console.log("BackupService: Check 1 PASSED.");

    // Retrieve Encryption Key from Vault and Decrypt
    const fernetKey = getOrCreateFernetKey(secrets);
    const secret = new fernet.Secret(fernetKey);
    const encryptedToken = fs.readFileSync(encDumpPath, 'utf8');
    
    console.log("BackupService: Decrypting backup...");
    const token = new fernet.Token({
      secret: secret,
      token: encryptedToken,
      ttl: 0 // Disable expiration checks on historical backups
    });
    const decryptedBase64 = token.decode();
    const decryptedBuffer = Buffer.from(decryptedBase64, 'base64');
    fs.writeFileSync(plainDumpPath, decryptedBuffer);

    // Check 2: Verify Decrypted SQL/DB Integrity
    console.log("BackupService: Verification Check 2 (Decrypted Hash)...");
    const decryptedHash = await getFileSha256(plainDumpPath);
    if (decryptedHash !== metadata.hash_avant_chiffrement) {
      throw new Error("CRITICAL: Verification Check 2 FAILED. Decrypted database dump signature does not match original signature.");
    }
    console.log("BackupService: Check 2 PASSED.");

    // Restore Database via Client CLI
    if (db.isPg) {
      console.log("BackupService: Restoring PostgreSQL database...");
      const pgUrl = process.env.DATABASE_URL || secrets.DATABASE_URL;
      if (!pgUrl) throw new Error("Postgres connection URL missing.");
      
      // psql restore
      await execPromise(`psql "${pgUrl}" -f "${plainDumpPath}"`);
    } else {
      console.log("BackupService: Restoring SQLite database...");
      const sqlitePath = path.resolve(__dirname, '../../../database.sqlite');
      
      // Close active database handle before overwriting file
      if (global.dbInstanceCon) {
        await global.dbInstanceCon.close();
        global.dbInstanceCon = null;
      }
      
      fs.copyFileSync(plainDumpPath, sqlitePath);
    }

    // Check 3: Query & Verify Live Row Counts
    console.log("BackupService: Verification Check 3 (Row Count Integrity)...");
    const freshDb = await getDb();
    const stats = await freshDb.get("SELECT COUNT(*) as count FROM leads");
    const currentRows = Number(stats.count);
    
    if (currentRows !== metadata.total_rows) {
      console.warn(`WARNING: Verification Check 3 MISMATCH. Expected rows: ${metadata.total_rows}, Active rows: ${currentRows}.`);
    } else {
      console.log("BackupService: Check 3 PASSED.");
    }

    return {
      success: true,
      currentRows,
      expectedRows: metadata.total_rows
    };

  } finally {
    // Cleanup local temp files
    console.log("BackupService: Cleaning up restore temporary files...");
    if (fs.existsSync(plainDumpPath)) {
      fs.writeFileSync(plainDumpPath, crypto.randomBytes(fs.statSync(plainDumpPath).size));
      fs.unlinkSync(plainDumpPath);
    }
    if (fs.existsSync(encDumpPath)) fs.unlinkSync(encDumpPath);
    if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
  }
}

// Lists all local & remote backups available for restore
export async function listAvailableBackups() {
  const secrets = await getVaultSecrets();
  
  if (secrets.S3_BUCKET) {
    const s3Client = new S3Client({
      endpoint: secrets.S3_ENDPOINT || null,
      region: secrets.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: secrets.S3_ACCESS_KEY_ID || '',
        secretAccessKey: secrets.S3_SECRET_ACCESS_KEY || ''
      }
    });
    // In production, we'd call ListObjectsV2Command.
    // For local dev ease, fallback to scanning local backup directory
  }

  // Scan local backup folder
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) return [];
  const files = fs.readdirSync(LOCAL_BACKUP_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  const list = [];
  for (const file of jsonFiles) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(LOCAL_BACKUP_DIR, file), 'utf8'));
      list.push(meta);
    } catch (_) {}
  }
  return list;
}
