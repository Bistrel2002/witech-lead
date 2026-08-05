# Multi-Tenant Outreach Infra (Email + SMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-tenant SMTP/Twilio configuration with platform-managed sending (AWS SES with a per-tenant sending subdomain, plus a shared Twilio alphanumeric Sender ID) so a paying customer can send campaigns with zero configuration, and close the multi-tenancy hole where any logged-in user can read/overwrite every other tenant's credentials.

**Architecture:** Sending credentials move out of the shared `settings` table and become platform-level secrets read from environment variables via a single config module. Each tenant gets an SES domain identity at `{userId}.mail.witechagency.com`, provisioned automatically at signup by writing DKIM CNAME records into a Route53 zone that has been delegated from Vercel. Campaign email sends go through the SES v2 API with `From:` on the tenant's subdomain and `Reply-To:` set to the tenant's real account email. SMS goes through one shared Twilio account using an alphanumeric Sender ID. Per-tenant branding (signature, company name) moves from the global `settings` table onto the `users` row.

**Tech Stack:** Node 20 (ESM), Express 4, PostgreSQL via a custom `DatabaseAdapter`, `@aws-sdk/client-sesv2`, `@aws-sdk/client-route-53`, `twilio`, React 19 + Vite + Tailwind v4 on the frontend. Tests use Node's built-in `node:test` runner and `node:assert/strict` — no new test dependency.

## Global Constraints

- **Root sending domain:** `mail.witechagency.com`. The apex `witechagency.com` and its Vercel-hosted marketing site are never touched.
- **Per-tenant subdomain format:** `{userId}.mail.witechagency.com` (exactly as approved in the spec).
- **From address format:** `"{user.name}" <no-reply@{send_subdomain}>`, with `Reply-To: {user.email}`.
- **No user-supplied SMTP or Twilio credentials anywhere.** No API may accept, return, or persist a key matching `smtp_*` or `twilio_*`.
- **All new backend files are ESM** (`import`/`export`), matching `"type": "module"` in `backend/package.json`.
- **All SQL goes through the `DatabaseAdapter`** (`db.get` / `db.all` / `db.run` / `db.exec`) using `?` placeholders — the adapter rewrites them to `$1, $2, …`. Never write `$1` directly.
- **All user-facing copy is French**, matching the existing UI.
- **WhatsApp is out of scope.** Do not build it. Existing WhatsApp code paths are removed, not migrated.
- **Tests run with:** `npm test --prefix backend`.

---

### Task 1: Test infrastructure + platform config module

Establishes the test runner (none exists in this repo today) and the single module every later task reads platform secrets from.

**Files:**
- Create: `backend/src/config/platformConfig.js`
- Create: `backend/tests/platformConfig.test.js`
- Modify: `backend/package.json` (add `test` script)
- Modify: `.env.example` (document new platform variables)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `getPlatformConfig()` → returns a frozen object:
    ```
    {
      aws: { region: string, sesConfigurationSet: string | null },
      mail: { rootDomain: string, fromLocalPart: string },
      twilio: { accountSid: string, authToken: string, senderId: string }
    }
    ```
    Throws `Error` with a French message listing every missing variable name when any required variable is absent.
  - `resetPlatformConfigCache()` → clears the memoized value. Test-only helper; safe in production.

- [ ] **Step 1: Add the test script**

In `backend/package.json`, add to `"scripts"`:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/platformConfig.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformConfig, resetPlatformConfigCache } from '../src/config/platformConfig.js';

const REQUIRED = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tokentest',
  TWILIO_SENDER_ID: 'WITECH'
};

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, REQUIRED, overrides);
  resetPlatformConfigCache();
  try {
    return fn();
  } finally {
    process.env = saved;
    resetPlatformConfigCache();
  }
}

test('returns the configured values', () => {
  withEnv({}, () => {
    const cfg = getPlatformConfig();
    assert.equal(cfg.aws.region, 'eu-west-3');
    assert.equal(cfg.mail.rootDomain, 'mail.witechagency.com');
    assert.equal(cfg.twilio.senderId, 'WITECH');
  });
});

test('defaults the From local part to no-reply', () => {
  withEnv({}, () => {
    assert.equal(getPlatformConfig().mail.fromLocalPart, 'no-reply');
  });
});

test('sesConfigurationSet is null when unset', () => {
  withEnv({ SES_CONFIGURATION_SET: undefined }, () => {
    assert.equal(getPlatformConfig().aws.sesConfigurationSet, null);
  });
});

test('throws and names every missing variable', () => {
  withEnv({ AWS_REGION: undefined, TWILIO_AUTH_TOKEN: undefined }, () => {
    assert.throws(() => getPlatformConfig(), (err) => {
      assert.match(err.message, /AWS_REGION/);
      assert.match(err.message, /TWILIO_AUTH_TOKEN/);
      assert.doesNotMatch(err.message, /MAIL_ROOT_DOMAIN/);
      return true;
    });
  });
});

test('the returned object is frozen', () => {
  withEnv({}, () => {
    const cfg = getPlatformConfig();
    assert.throws(() => { cfg.mail.rootDomain = 'evil.com'; }, TypeError);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `Cannot find module '../src/config/platformConfig.js'`

- [ ] **Step 4: Write the implementation**

Create `backend/src/config/platformConfig.js`:

```js
/**
 * Platform-level secrets and configuration for outreach sending.
 *
 * These are operator-owned values injected via environment (Vault-backed in
 * production). They are never exposed through any user-facing API and never
 * stored in the `settings` table.
 */

const REQUIRED_VARS = [
  'AWS_REGION',
  'MAIL_ROOT_DOMAIN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SENDER_ID'
];

let cached = null;

export function resetPlatformConfigCache() {
  cached = null;
}

export function getPlatformConfig() {
  if (cached) return cached;

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Configuration plateforme incomplète. Variables manquantes : ${missing.join(', ')}.`
    );
  }

  cached = Object.freeze({
    aws: Object.freeze({
      region: process.env.AWS_REGION,
      sesConfigurationSet: process.env.SES_CONFIGURATION_SET || null
    }),
    mail: Object.freeze({
      rootDomain: process.env.MAIL_ROOT_DOMAIN,
      fromLocalPart: process.env.MAIL_FROM_LOCAL_PART || 'no-reply'
    }),
    twilio: Object.freeze({
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      senderId: process.env.TWILIO_SENDER_ID
    })
  });

  return cached;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --prefix backend`
Expected: PASS — 5 tests passing.

- [ ] **Step 6: Document the new variables**

In `.env.example`, replace the SMTP and Twilio blocks (sections 4 and any `smtp_`/`twilio_` entries) with:

```bash
# 4. Platform Outreach Infrastructure (operator-owned, never per-customer)
AWS_REGION=eu-west-3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Root zone delegated to Route53. Per-tenant subdomains are created beneath it.
MAIL_ROOT_DOMAIN=mail.witechagency.com
# Route53 hosted zone ID for MAIL_ROOT_DOMAIN
ROUTE53_HOSTED_ZONE_ID=
# Optional: SES configuration set used to route bounce/complaint events to SNS
SES_CONFIGURATION_SET=witech-outreach
# Local part of the envelope sender: no-reply@{tenant}.mail.witechagency.com
MAIL_FROM_LOCAL_PART=no-reply

# 5. Shared Twilio account (one platform account, alphanumeric Sender ID)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SENDER_ID=WITECH
```

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/src/config/platformConfig.js backend/tests/platformConfig.test.js .env.example
git commit -m "feat(config): add platform outreach config module and test runner"
```

---

### Task 2: Close the settings multi-tenancy hole

Security fix, independently valuable. After this task no user can read or write another tenant's sending credentials, because those keys stop existing in the table entirely.

**Files:**
- Modify: `backend/src/database/db.js:200-222` (default settings seed)
- Modify: `backend/src/routes.js:1094-1135` (settings endpoints)
- Create: `backend/tests/settingsRoutes.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `ALLOWED_SETTING_KEYS` (exported `Set<string>` from `backend/src/routes.js`) — the only keys `POST /api/settings` accepts. Task 3 removes members from it; nothing else depends on it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/settingsRoutes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_SETTING_KEYS, filterSettingsPayload } from '../src/routes.js';

test('credential keys are not allowed', () => {
  for (const key of ['smtp_host', 'smtp_pass', 'twilio_account_sid', 'twilio_auth_token']) {
    assert.equal(ALLOWED_SETTING_KEYS.has(key), false, `${key} must not be writable`);
  }
});

test('filterSettingsPayload drops unknown and credential keys', () => {
  const { accepted, rejected } = filterSettingsPayload({
    company_name: 'Acme',
    smtp_pass: 'hunter2',
    twilio_auth_token: 'secret',
    not_a_real_key: 'x'
  });
  assert.deepEqual(Object.keys(accepted), ['company_name']);
  assert.deepEqual(rejected.sort(), ['not_a_real_key', 'smtp_pass', 'twilio_auth_token']);
});

test('filterSettingsPayload coerces values to strings', () => {
  const { accepted } = filterSettingsPayload({ company_name: 42 });
  assert.strictEqual(accepted.company_name, '42');
});

test('filterSettingsPayload on an empty payload yields nothing', () => {
  const { accepted, rejected } = filterSettingsPayload({});
  assert.deepEqual(accepted, {});
  assert.deepEqual(rejected, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `ALLOWED_SETTING_KEYS` / `filterSettingsPayload` are not exported.

- [ ] **Step 3: Add the allowlist and filter to routes.js**

In `backend/src/routes.js`, directly above the `// SETTINGS ENDPOINTS` banner (currently line ~1090), add:

```js
// ==========================================
// SETTINGS ENDPOINTS
// ==========================================

/**
 * Keys a client is permitted to write to the global settings table.
 * Sending credentials (smtp_*, twilio_*) are deliberately absent: they are
 * platform-owned and live in environment/Vault, never in this table.
 */
export const ALLOWED_SETTING_KEYS = new Set([
  'company_name',
  'company_website',
  'sender_signature'
]);

export function filterSettingsPayload(payload) {
  const accepted = {};
  const rejected = [];
  for (const [key, value] of Object.entries(payload || {})) {
    if (ALLOWED_SETTING_KEYS.has(key)) {
      accepted[key] = String(value);
    } else {
      rejected.push(key);
    }
  }
  return { accepted, rejected };
}
```

- [ ] **Step 4: Rewrite the settings write endpoint**

Replace the body of `router.post('/settings', ...)` (currently lines ~1110-1124) with:

```js
router.post('/settings', async (req, res) => {
  const { accepted, rejected } = filterSettingsPayload(req.body);
  if (rejected.length > 0) {
    return res.status(400).json({
      error: `Paramètres non modifiables refusés : ${rejected.join(', ')}.`
    });
  }
  try {
    const db = await getDb();
    for (const [key, value] of Object.entries(accepted)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        key, value
      );
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 5: Harden the settings read endpoint**

Replace the body of `router.get('/settings', ...)` (currently lines ~1095-1107) so it can never leak a credential row that predates this change:

```js
router.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const settings = await db.all('SELECT * FROM settings');
    const settingsMap = settings.reduce((acc, curr) => {
      if (ALLOWED_SETTING_KEYS.has(curr.key)) {
        acc[curr.key] = curr.value;
      }
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 6: Delete the SMTP test endpoint**

Delete the entire `router.post('/settings/test-smtp', ...)` handler (currently lines ~1127-1135). Then remove `testSmtpConnection` from the import on `backend/src/routes.js:4` so it reads:

```js
import { runCampaignBackground } from './services/emailService.js';
```

- [ ] **Step 7: Purge credential keys from the schema seed**

In `backend/src/database/db.js`, replace the `defaultSettings` array (lines ~201-215) with:

```js
  const defaultSettings = [
    { key: 'company_name', value: "Wi'Tech Agency" },
    { key: 'company_website', value: 'https://www.witechagency.com' },
    { key: 'sender_signature', value: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com" }
  ];
```

- [ ] **Step 8: Delete pre-existing credential rows on boot**

In `backend/src/database/db.js`, immediately after the `for (const setting of defaultSettings)` seeding loop (currently ends line ~222), add:

```js
  // One-time cleanup: sending credentials used to live here and were readable
  // by every authenticated tenant. They are now platform-owned.
  // Keys are enumerated rather than matched with LIKE: in PostgreSQL the `_`
  // in 'smtp_%' is a single-character wildcard, so a pattern match here would
  // be both wider than intended and easy to misread.
  await db.run(
    `DELETE FROM settings WHERE key IN (
       'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_name',
       'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number', 'twilio_whatsapp_number'
     )`
  );
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 4 new tests plus Task 1's 5.

- [ ] **Step 10: Verify the server still boots and purges**

Run: `npm run dev --prefix backend`
Expected: `Database initialized successfully!` then `🚀 Witech Lead backend running on port 3001`, no errors. Stop it with Ctrl-C.

Then confirm the rows are gone:

```bash
psql "$DATABASE_URL" -c "SELECT key FROM settings ORDER BY key;"
```

Expected: only `company_name`, `company_website`, `sender_signature`.

- [ ] **Step 11: Commit**

```bash
git add backend/src/routes.js backend/src/database/db.js backend/tests/settingsRoutes.test.js
git commit -m "fix(security): stop storing and exposing tenant sending credentials in shared settings"
```

---

### Task 3: Move branding and signature to per-tenant columns

`sender_signature` is injected into every outreach message by `compileTemplate`. While it lives in the global `settings` table, one tenant editing their signature rewrites it for every other tenant. This task makes it per-user.

**Files:**
- Modify: `backend/src/database/db.js` (users table + migration)
- Modify: `backend/src/routes/authRoutes.js:115-152` (`PUT /profile`)
- Modify: `backend/src/routes.js` (shrink `ALLOWED_SETTING_KEYS`)
- Create: `backend/tests/profileFields.test.js`

**Interfaces:**
- Consumes: `ALLOWED_SETTING_KEYS`, `filterSettingsPayload` (Task 2).
- Produces:
  - `users` columns: `company_name TEXT`, `company_website TEXT`, `sender_signature TEXT`.
  - `PROFILE_EDITABLE_FIELDS` (exported `string[]` from `backend/src/routes/authRoutes.js`) = `['name', 'email', 'phone', 'company_name', 'company_website', 'sender_signature']`.
  - `pickProfileFields(body)` (exported from the same file) → object containing only keys in `PROFILE_EDITABLE_FIELDS` that are present in `body`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/profileFields.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_EDITABLE_FIELDS, pickProfileFields } from '../src/routes/authRoutes.js';

test('signature and branding are editable per user', () => {
  for (const field of ['company_name', 'company_website', 'sender_signature']) {
    assert.ok(PROFILE_EDITABLE_FIELDS.includes(field), `${field} should be editable`);
  }
});

test('privileged columns are not editable', () => {
  for (const field of ['role', 'id', 'password_hash', 'send_subdomain', 'send_subdomain_status']) {
    assert.equal(PROFILE_EDITABLE_FIELDS.includes(field), false, `${field} must not be editable`);
  }
});

test('pickProfileFields keeps only present editable keys', () => {
  const picked = pickProfileFields({
    name: 'Alice',
    role: 'admin',
    sender_signature: 'Cordialement',
    unknown: 1
  });
  assert.deepEqual(picked, { name: 'Alice', sender_signature: 'Cordialement' });
});

test('pickProfileFields preserves an explicit empty string', () => {
  assert.deepEqual(pickProfileFields({ sender_signature: '' }), { sender_signature: '' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `PROFILE_EDITABLE_FIELDS` is not exported.

- [ ] **Step 3: Add the columns**

In `backend/src/database/db.js`, immediately after the `CREATE TABLE IF NOT EXISTS users (...)` block (ends line ~106), add:

```js
  // Per-tenant branding. These were global settings rows until 2026-08;
  // sharing them across tenants leaked one customer's signature into another's
  // outbound campaigns.
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sender_signature TEXT;
  `);
```

- [ ] **Step 4: Export the field list and picker**

In `backend/src/routes/authRoutes.js`, directly below the `generateToken` helper (after line 17), add:

```js
/** Columns on `users` a customer may edit through PUT /api/auth/profile. */
export const PROFILE_EDITABLE_FIELDS = [
  'name',
  'email',
  'phone',
  'company_name',
  'company_website',
  'sender_signature'
];

export function pickProfileFields(body) {
  const picked = {};
  for (const field of PROFILE_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) {
      picked[field] = body[field];
    }
  }
  return picked;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS.

- [ ] **Step 6: Use the picker in the profile endpoint**

Read the current `router.put('/profile', ...)` handler in `backend/src/routes/authRoutes.js` (starts line ~115). Rewrite it to build its `UPDATE` from `pickProfileFields` instead of a fixed column list, keeping its existing behavior of re-issuing the auth cookie:

```js
router.put('/profile', authenticateUser, async (req, res) => {
  const updates = pickProfileFields(req.body);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ modifiable fourni.' });
  }
  if (updates.email !== undefined && !updates.email) {
    return res.status(400).json({ error: "L'adresse e-mail ne peut pas être vide." });
  }
  if (updates.name !== undefined && !updates.name) {
    return res.status(400).json({ error: 'Le nom ne peut pas être vide.' });
  }

  try {
    const db = await getDb();

    if (updates.email) {
      const clash = await db.get(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        updates.email, req.user.id
      );
      if (clash) {
        return res.status(400).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
      }
    }

    const columns = Object.keys(updates);
    const assignments = columns.map((col) => `${col} = ?`).join(', ');
    await db.run(
      `UPDATE users SET ${assignments} WHERE id = ?`,
      ...columns.map((col) => updates[col]),
      req.user.id
    );

    const user = await db.get(
      `SELECT id, email, name, phone, role, company_name, company_website, sender_signature
       FROM users WHERE id = ?`,
      req.user.id
    );

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

Note: `columns` is built from `PROFILE_EDITABLE_FIELDS`, never from raw request keys, so the interpolation into `assignments` cannot be attacker-controlled. Values still go through `?` placeholders.

- [ ] **Step 7: Make /me return the full profile**

`GET /api/auth/me` currently returns `req.user`, which is the JWT payload — it carries only `id`, `email`, `name`, `role`, `phone`. The Settings form initialises from this object, so without this change the branding fields always render empty regardless of what is stored. Replace the handler at `backend/src/routes/authRoutes.js:109-111` with:

```js
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get(
      `SELECT id, email, name, phone, role, company_name, company_website, sender_signature
       FROM users WHERE id = ?`,
      req.user.id
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 8: Backfill existing users from the global settings rows**

In `backend/src/database/db.js`, after the credential-purge `DELETE` added in Task 2 Step 8, add:

```js
  // Backfill: give every existing user the previously-global branding values,
  // then retire those rows.
  const legacyBranding = await db.all(
    "SELECT key, value FROM settings WHERE key IN ('company_name', 'company_website', 'sender_signature')"
  );
  if (legacyBranding.length > 0) {
    const legacy = legacyBranding.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    await db.run(
      `UPDATE users
         SET company_name     = COALESCE(company_name, ?),
             company_website  = COALESCE(company_website, ?),
             sender_signature = COALESCE(sender_signature, ?)
       WHERE company_name IS NULL
          OR company_website IS NULL
          OR sender_signature IS NULL`,
      legacy.company_name || null,
      legacy.company_website || null,
      legacy.sender_signature || null
    );
  }
```

- [ ] **Step 9: Empty the settings allowlist**

Nothing may be written to the global `settings` table by a customer any more. In `backend/src/routes.js`, change `ALLOWED_SETTING_KEYS` to:

```js
export const ALLOWED_SETTING_KEYS = new Set([]);
```

- [ ] **Step 10: Update Task 2's test for the emptied allowlist**

In `backend/tests/settingsRoutes.test.js`, replace the `filterSettingsPayload drops unknown and credential keys` and `coerces values to strings` tests with:

```js
test('filterSettingsPayload now rejects everything, branding included', () => {
  const { accepted, rejected } = filterSettingsPayload({
    company_name: 'Acme',
    smtp_pass: 'hunter2'
  });
  assert.deepEqual(accepted, {});
  assert.deepEqual(rejected.sort(), ['company_name', 'smtp_pass']);
});
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS.

- [ ] **Step 12: Verify the migration end to end**

Run: `npm run dev --prefix backend`, wait for `Database initialized successfully!`, stop it, then:

```bash
psql "$DATABASE_URL" -c "SELECT id, email, company_name, sender_signature IS NOT NULL AS has_sig FROM users;"
```

Expected: every existing row has a non-null `company_name` and `has_sig = t`.

- [ ] **Step 13: Commit**

```bash
git add backend/src/database/db.js backend/src/routes/authRoutes.js backend/src/routes.js backend/tests/profileFields.test.js backend/tests/settingsRoutes.test.js
git commit -m "feat(tenancy): move branding and email signature to per-user columns"
```

---

### Task 4: SES sending-domain provisioning service

Pure service module with injected AWS clients so it is unit-testable without an AWS account.

**Files:**
- Create: `backend/src/services/sendingDomainService.js`
- Create: `backend/tests/sendingDomainService.test.js`
- Modify: `backend/package.json` (add AWS SDK deps)

**Interfaces:**
- Consumes: `getPlatformConfig()` (Task 1).
- Produces:
  - `buildSubdomain(userId)` → `` `${userId}.${cfg.mail.rootDomain}` ``
  - `buildFromAddress(subdomain)` → `` `${cfg.mail.fromLocalPart}@${subdomain}` ``
  - `dkimRecordsFor(subdomain, tokens)` → `Array<{ name, type: 'CNAME', value }>`
  - `mailFromRecordsFor(subdomain)` → `Array<{ name, type, value }>` (MX + SPF TXT for `bounce.{subdomain}`)
  - `async provisionSendingDomain(userId, { sesClient, route53Client })` → `{ subdomain, dkimTokens, recordsWritten }`
  - `async checkDomainVerification(subdomain, { sesClient })` → `'verified' | 'pending' | 'failed'`

- [ ] **Step 1: Install the AWS SDK clients**

```bash
npm install --prefix backend @aws-sdk/client-sesv2 @aws-sdk/client-route-53
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/sendingDomainService.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  buildSubdomain,
  buildFromAddress,
  dkimRecordsFor,
  mailFromRecordsFor,
  provisionSendingDomain,
  checkDomainVerification
} from '../src/services/sendingDomainService.js';

const ENV = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  ROUTE53_HOSTED_ZONE_ID: 'Z123',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_SENDER_ID: 'WITECH'
};

test.beforeEach(() => {
  Object.assign(process.env, ENV);
  resetPlatformConfigCache();
});

function fakeSes(responses) {
  const sent = [];
  return {
    sent,
    async send(command) {
      sent.push(command.constructor.name);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? {};
    }
  };
}

test('builds the tenant subdomain from the user id', () => {
  assert.equal(buildSubdomain(42), '42.mail.witechagency.com');
});

test('builds the no-reply From address', () => {
  assert.equal(buildFromAddress('42.mail.witechagency.com'), 'no-reply@42.mail.witechagency.com');
});

test('maps DKIM tokens to CNAME records', () => {
  const records = dkimRecordsFor('42.mail.witechagency.com', ['aaa', 'bbb']);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    name: 'aaa._domainkey.42.mail.witechagency.com',
    type: 'CNAME',
    value: 'aaa.dkim.amazonses.com'
  });
});

test('builds MX and SPF records for the custom MAIL FROM subdomain', () => {
  const records = mailFromRecordsFor('42.mail.witechagency.com');
  const mx = records.find((r) => r.type === 'MX');
  const txt = records.find((r) => r.type === 'TXT');
  assert.equal(mx.name, 'bounce.42.mail.witechagency.com');
  assert.match(mx.value, /feedback-smtp\.eu-west-3\.amazonses\.com$/);
  assert.equal(txt.name, 'bounce.42.mail.witechagency.com');
  assert.match(txt.value, /v=spf1 include:amazonses\.com ~all/);
});

test('provisioning creates the identity and writes every DNS record', async () => {
  const sesClient = fakeSes([
    { DkimAttributes: { Tokens: ['aaa', 'bbb', 'ccc'] } },
    {}
  ]);
  const changes = [];
  const route53Client = {
    async send(command) {
      changes.push(command.input.ChangeBatch.Changes);
      return {};
    }
  };

  const result = await provisionSendingDomain(7, { sesClient, route53Client });

  assert.equal(result.subdomain, '7.mail.witechagency.com');
  assert.deepEqual(result.dkimTokens, ['aaa', 'bbb', 'ccc']);
  // 3 DKIM CNAMEs + 1 MX + 1 SPF TXT
  assert.equal(result.recordsWritten, 5);
  assert.equal(changes[0].length, 5);
  assert.deepEqual(sesClient.sent, ['CreateEmailIdentityCommand', 'PutEmailIdentityMailFromAttributesCommand']);
});

test('provisioning tolerates an identity that already exists', async () => {
  const alreadyExists = new Error('Already exists');
  alreadyExists.name = 'AlreadyExistsException';
  const sesClient = fakeSes([
    alreadyExists,
    { DkimAttributes: { Tokens: ['aaa'] } },
    {}
  ]);
  const route53Client = { async send() { return {}; } };

  const result = await provisionSendingDomain(7, { sesClient, route53Client });

  assert.deepEqual(result.dkimTokens, ['aaa']);
  assert.equal(sesClient.sent[1], 'GetEmailIdentityCommand');
});

test('verification maps SES status to our own vocabulary', async () => {
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: true }])
    }),
    'verified'
  );
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: false, DkimAttributes: { Status: 'PENDING' } }])
    }),
    'pending'
  );
  assert.equal(
    await checkDomainVerification('7.mail.witechagency.com', {
      sesClient: fakeSes([{ VerifiedForSendingStatus: false, DkimAttributes: { Status: 'FAILED' } }])
    }),
    'failed'
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `Cannot find module '../src/services/sendingDomainService.js'`

- [ ] **Step 4: Write the implementation**

Create `backend/src/services/sendingDomainService.js`:

```js
import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand
} from '@aws-sdk/client-sesv2';
import { Route53Client, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { getPlatformConfig } from '../config/platformConfig.js';

/**
 * Each tenant sends from its own subdomain so that one customer's spam
 * complaints cannot damage another customer's deliverability.
 */

export function buildSubdomain(userId) {
  return `${userId}.${getPlatformConfig().mail.rootDomain}`;
}

export function buildFromAddress(subdomain) {
  return `${getPlatformConfig().mail.fromLocalPart}@${subdomain}`;
}

export function dkimRecordsFor(subdomain, tokens) {
  return tokens.map((token) => ({
    name: `${token}._domainkey.${subdomain}`,
    type: 'CNAME',
    value: `${token}.dkim.amazonses.com`
  }));
}

/**
 * A custom MAIL FROM subdomain gives us SPF alignment, which materially
 * improves inbox placement for cold outreach.
 */
export function mailFromRecordsFor(subdomain) {
  const { region } = getPlatformConfig().aws;
  const mailFrom = `bounce.${subdomain}`;
  return [
    { name: mailFrom, type: 'MX', value: `10 feedback-smtp.${region}.amazonses.com` },
    { name: mailFrom, type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' }
  ];
}

export function createSesClient() {
  return new SESv2Client({ region: getPlatformConfig().aws.region });
}

export function createRoute53Client() {
  return new Route53Client({ region: getPlatformConfig().aws.region });
}

async function fetchDkimTokens(sesClient, subdomain) {
  try {
    const created = await sesClient.send(new CreateEmailIdentityCommand({
      EmailIdentity: subdomain,
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' }
    }));
    return created?.DkimAttributes?.Tokens ?? [];
  } catch (error) {
    if (error.name !== 'AlreadyExistsException') throw error;
    const existing = await sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: subdomain }));
    return existing?.DkimAttributes?.Tokens ?? [];
  }
}

export async function provisionSendingDomain(userId, deps = {}) {
  const sesClient = deps.sesClient ?? createSesClient();
  const route53Client = deps.route53Client ?? createRoute53Client();
  const subdomain = buildSubdomain(userId);

  const dkimTokens = await fetchDkimTokens(sesClient, subdomain);

  await sesClient.send(new PutEmailIdentityMailFromAttributesCommand({
    EmailIdentity: subdomain,
    MailFromDomain: `bounce.${subdomain}`,
    BehaviorOnMxFailure: 'USE_DEFAULT_VALUE'
  }));

  const records = [
    ...dkimRecordsFor(subdomain, dkimTokens),
    ...mailFromRecordsFor(subdomain)
  ];

  await route53Client.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: process.env.ROUTE53_HOSTED_ZONE_ID,
    ChangeBatch: {
      Comment: `Witech Lead sending domain for user ${userId}`,
      Changes: records.map((record) => ({
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: record.name,
          Type: record.type,
          TTL: 1800,
          ResourceRecords: [{ Value: record.value }]
        }
      }))
    }
  }));

  return { subdomain, dkimTokens, recordsWritten: records.length };
}

export async function checkDomainVerification(subdomain, deps = {}) {
  const sesClient = deps.sesClient ?? createSesClient();
  const identity = await sesClient.send(new GetEmailIdentityCommand({ EmailIdentity: subdomain }));
  if (identity?.VerifiedForSendingStatus) return 'verified';
  if (identity?.DkimAttributes?.Status === 'FAILED') return 'failed';
  return 'pending';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 8 new tests.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/sendingDomainService.js backend/tests/sendingDomainService.test.js
git commit -m "feat(email): add per-tenant SES sending domain provisioning service"
```

---

### Task 5: Provision at signup and expose sending status

**Files:**
- Modify: `backend/src/database/db.js` (users columns)
- Modify: `backend/src/routes/authRoutes.js` (signup + Google/Apple callbacks)
- Modify: `backend/src/routes.js` (status endpoint)
- Create: `backend/src/services/tenantProvisioning.js`
- Create: `backend/tests/tenantProvisioning.test.js`

**Interfaces:**
- Consumes: `provisionSendingDomain`, `checkDomainVerification`, `buildSubdomain` (Task 4).
- Produces:
  - `users` columns: `send_subdomain TEXT`, `send_subdomain_status TEXT DEFAULT 'pending'`, `sending_paused_at TIMESTAMP`.
  - `async ensureTenantSendingDomain(userId, db, deps)` → `void`. Never throws; logs and leaves status `'failed'` on error so signup is never blocked.
  - `async refreshTenantSendingStatus(userId, db, deps)` → `'verified' | 'pending' | 'failed'`.
  - `GET /api/sending-status` → `{ status, subdomain, replyTo, pausedAt }`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/tenantProvisioning.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { ensureTenantSendingDomain, refreshTenantSendingStatus } from '../src/services/tenantProvisioning.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH'
  });
  resetPlatformConfigCache();
});

function fakeDb({ subdomain = '9.mail.witechagency.com' } = {}) {
  const calls = [];
  return {
    calls,
    async run(sql, ...params) { calls.push({ sql, params }); return { changes: 1 }; },
    async get() { return { send_subdomain: subdomain }; }
  };
}

test('stores the subdomain and pending status on success', async () => {
  const db = fakeDb();
  await ensureTenantSendingDomain(9, db, {
    provision: async () => ({ subdomain: '9.mail.witechagency.com', dkimTokens: ['a'], recordsWritten: 3 })
  });
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update, 'should update the user row');
  assert.ok(update.params.includes('9.mail.witechagency.com'));
  assert.ok(update.params.includes('pending'));
});

test('marks failed and does not throw when AWS errors', async () => {
  const db = fakeDb();
  await assert.doesNotReject(() => ensureTenantSendingDomain(9, db, {
    provision: async () => { throw new Error('AWS down'); }
  }));
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update.params.includes('failed'));
});

test('refresh persists the verified status', async () => {
  const db = fakeDb();
  const status = await refreshTenantSendingStatus(9, db, { check: async () => 'verified' });
  assert.equal(status, 'verified');
  const update = db.calls.find((c) => /UPDATE users/.test(c.sql));
  assert.ok(update.params.includes('verified'));
});

test('refresh returns pending when the user has no subdomain yet', async () => {
  const db = fakeDb({ subdomain: null });
  const status = await refreshTenantSendingStatus(9, db, { check: async () => 'verified' });
  assert.equal(status, 'pending');
  assert.equal(db.calls.length, 0, 'must not write a status it never checked');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the users columns**

In `backend/src/database/db.js`, extend the `ALTER TABLE users` block added in Task 3 Step 3 to:

```js
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sender_signature TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS send_subdomain TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS send_subdomain_status VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sending_paused_at TIMESTAMP;
  `);
```

- [ ] **Step 4: Write the provisioning wrapper**

Create `backend/src/services/tenantProvisioning.js`:

```js
import { provisionSendingDomain, checkDomainVerification } from './sendingDomainService.js';

/**
 * Provisioning is fire-and-forget: a transient AWS failure must never block a
 * signup. A tenant left in 'failed' is retried by refreshTenantSendingStatus.
 */
export async function ensureTenantSendingDomain(userId, db, deps = {}) {
  const provision = deps.provision ?? provisionSendingDomain;
  try {
    const { subdomain } = await provision(userId);
    await db.run(
      'UPDATE users SET send_subdomain = ?, send_subdomain_status = ? WHERE id = ?',
      subdomain, 'pending', userId
    );
  } catch (error) {
    console.error(`Provisioning: failed for user ${userId}:`, error.message);
    await db.run(
      'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
      'failed', userId
    );
  }
}

export async function refreshTenantSendingStatus(userId, db, deps = {}) {
  const check = deps.check ?? checkDomainVerification;
  const user = await db.get('SELECT send_subdomain FROM users WHERE id = ?', userId);
  if (!user?.send_subdomain) return 'pending';

  try {
    const status = await check(user.send_subdomain);
    await db.run(
      'UPDATE users SET send_subdomain_status = ? WHERE id = ?',
      status, userId
    );
    return status;
  } catch (error) {
    console.error(`Provisioning: status check failed for user ${userId}:`, error.message);
    return 'pending';
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS.

- [ ] **Step 6: Trigger provisioning on signup**

In `backend/src/routes/authRoutes.js`, add the import at the top:

```js
import { ensureTenantSendingDomain } from '../services/tenantProvisioning.js';
```

Then in `router.post('/signup', ...)`, immediately after `const user = { id: result.lastID, ... };` (line ~45), add:

```js
    // Fire-and-forget: the customer should not wait on AWS to finish signing up.
    ensureTenantSendingDomain(user.id, db);
```

Apply the identical two lines after each `INSERT INTO users` in the Google callback (line ~344) and the Google mock callback (line ~274), using whatever variable that block already holds the new user id in. Do **not** add it to the Apple paths — Apple sign-in is a "coming soon" stub.

- [ ] **Step 7: Add the status endpoint**

In `backend/src/routes.js`, add the import:

```js
import { refreshTenantSendingStatus } from './services/tenantProvisioning.js';
```

Then add, next to the settings endpoints:

```js
// Sending infrastructure status for the logged-in tenant.
router.get('/sending-status', async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get(
      'SELECT email, send_subdomain, send_subdomain_status, sending_paused_at FROM users WHERE id = ?',
      req.user.id
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    let status = user.send_subdomain_status || 'pending';
    if (status !== 'verified') {
      status = await refreshTenantSendingStatus(req.user.id, db);
    }

    res.json({
      status,
      subdomain: user.send_subdomain,
      replyTo: user.email,
      pausedAt: user.sending_paused_at || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 8: Verify the endpoint responds**

Start the backend (`npm run dev --prefix backend`) with `VITE_MOCK_AUTH=true` so the dev bypass user is used, then:

```bash
curl -s http://localhost:3001/api/sending-status
```

Expected: JSON containing `status`, `subdomain`, `replyTo`. With no real AWS credentials configured, `status` is `"pending"` and `subdomain` is `null` — that is the correct un-provisioned state, not a failure.

- [ ] **Step 9: Commit**

```bash
git add backend/src/database/db.js backend/src/routes/authRoutes.js backend/src/routes.js backend/src/services/tenantProvisioning.js backend/tests/tenantProvisioning.test.js
git commit -m "feat(email): provision tenant sending domain at signup and expose its status"
```

---

### Task 6: Send campaign email through SES

**Files:**
- Modify: `backend/src/services/emailService.js` (whole send path)
- Create: `backend/tests/emailService.test.js`

**Interfaces:**
- Consumes: `buildFromAddress` (Task 4), `getPlatformConfig` (Task 1), users columns (Tasks 3, 5).
- Produces:
  - `buildEmailPayload({ user, prospect, subject, body })` → the SES `SendEmailCommand` input object.
  - `assertChannelSendable(campaign, channel)` → `void`; throws a French `Error` when the tenant is paused, unverified, or on an unsupported channel.
  - `compileTemplate(text, data)` — unchanged signature, still exported.
  - `runCampaignBackground(campaignId)` — unchanged signature.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/emailService.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildEmailPayload, compileTemplate } from '../src/services/emailService.js';

test.beforeEach(() => {
  Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
    ROUTE53_HOSTED_ZONE_ID: 'Z1',
    TWILIO_ACCOUNT_SID: 'AC',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_SENDER_ID: 'WITECH'
  });
  resetPlatformConfigCache();
});

const user = {
  name: 'Alice Martin',
  email: 'alice@agence-alice.fr',
  send_subdomain: '7.mail.witechagency.com'
};

test('From uses the tenant subdomain, Reply-To the real inbox', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'prospect@exemple.fr' },
    subject: 'Bonjour',
    body: 'Texte'
  });
  assert.equal(payload.FromEmailAddress, '"Alice Martin" <no-reply@7.mail.witechagency.com>');
  assert.deepEqual(payload.ReplyToAddresses, ['alice@agence-alice.fr']);
  assert.deepEqual(payload.Destination.ToAddresses, ['prospect@exemple.fr']);
});

test('subject and body land in the SES simple content shape', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'p@e.fr' },
    subject: 'Sujet',
    body: 'Corps'
  });
  assert.equal(payload.Content.Simple.Subject.Data, 'Sujet');
  assert.equal(payload.Content.Simple.Body.Text.Data, 'Corps');
});

test('a double quote in the display name cannot break the From header', () => {
  const payload = buildEmailPayload({
    user: { ...user, name: 'Ali"ce' },
    prospect: { email: 'p@e.fr' },
    subject: 's',
    body: 'b'
  });
  assert.equal(payload.FromEmailAddress, '"Alice" <no-reply@7.mail.witechagency.com>');
});

test('compileTemplate substitutes the sender signature', () => {
  const out = compileTemplate('Bonjour {{company_name}}\n{{sender_signature}}', {
    company_name: 'Plomberie Dupont',
    sender_signature: 'Cordialement, Alice'
  });
  assert.equal(out, 'Bonjour Plomberie Dupont\nCordialement, Alice');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `buildEmailPayload` is not exported.

- [ ] **Step 3: Replace the Nodemailer transport with SES**

In `backend/src/services/emailService.js`, replace the imports and the `createTransport` / `testSmtpConnection` functions (lines 1-38) with:

```js
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import twilio from 'twilio';
import { getDb } from '../database/db.js';
import { getPlatformConfig } from '../config/platformConfig.js';
import { buildFromAddress } from './sendingDomainService.js';

let sesClientInstance = null;

function getSesClient() {
  if (!sesClientInstance) {
    sesClientInstance = new SESv2Client({ region: getPlatformConfig().aws.region });
  }
  return sesClientInstance;
}

/**
 * Quotes are stripped rather than escaped: a display name is cosmetic, and
 * stripping is the one transformation that cannot produce a malformed header.
 */
function sanitizeDisplayName(name) {
  return String(name || "Wi'Tech Agency").replace(/["\\\r\n]/g, '');
}

export function buildEmailPayload({ user, prospect, subject, body }) {
  const cfg = getPlatformConfig();
  const payload = {
    FromEmailAddress: `"${sanitizeDisplayName(user.name)}" <${buildFromAddress(user.send_subdomain)}>`,
    ReplyToAddresses: [user.email],
    Destination: { ToAddresses: [prospect.email] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } }
      }
    }
  };
  if (cfg.aws.sesConfigurationSet) {
    payload.ConfigurationSetName = cfg.aws.sesConfigurationSet;
  }
  return payload;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 4 new tests.

- [ ] **Step 5: Load tenant sending fields in the campaign query**

In `runCampaignBackground`, extend the campaign SELECT (currently line ~78) to pull the tenant's sending state:

```js
    const campaign = await db.get(
      `SELECT c.*, t.subject, t.body,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              u.sender_signature AS user_signature,
              u.send_subdomain, u.send_subdomain_status, u.sending_paused_at
       FROM campaigns c
       JOIN templates t ON c.template_id = t.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      campaignId
    );
```

- [ ] **Step 6: Extract the send guard as a pure function**

The guard is extracted rather than inlined so it can be tested without a database. Add to `backend/src/services/emailService.js`, below `buildEmailPayload`:

```js
/**
 * Throws with a customer-readable French message when this campaign must not
 * send. Pure: takes the joined campaign+user row, touches nothing else.
 */
export function assertChannelSendable(campaign, channel) {
  if (campaign.sending_paused_at) {
    throw new Error(
      "Envoi suspendu pour ce compte suite à un taux de plainte trop élevé. Contactez le support."
    );
  }
  if (channel === 'email') {
    if (!campaign.send_subdomain || campaign.send_subdomain_status !== 'verified') {
      throw new Error(
        "Votre domaine d'envoi n'est pas encore vérifié. Réessayez dans quelques minutes."
      );
    }
    return;
  }
  if (channel !== 'sms') {
    throw new Error(`Canal non supporté : ${channel}.`);
  }
}
```

Then replace the whole `if (channel === 'email') { ... } else { ... }` validation block (currently lines ~96-112) with a single call:

```js
    assertChannelSendable(campaign, channel);
```

- [ ] **Step 6b: Test the guard**

Append to `backend/tests/emailService.test.js`:

```js
import { assertChannelSendable } from '../src/services/emailService.js';

const verified = { send_subdomain: '7.mail.witechagency.com', send_subdomain_status: 'verified', sending_paused_at: null };

test('a verified tenant may send email', () => {
  assert.doesNotThrow(() => assertChannelSendable(verified, 'email'));
});

test('an unverified tenant is blocked with a readable message', () => {
  assert.throws(
    () => assertChannelSendable({ ...verified, send_subdomain_status: 'pending' }, 'email'),
    /pas encore vérifié/
  );
});

test('a tenant with no subdomain at all is blocked', () => {
  assert.throws(
    () => assertChannelSendable({ ...verified, send_subdomain: null }, 'email'),
    /pas encore vérifié/
  );
});

test('a paused tenant is blocked on every channel', () => {
  const paused = { ...verified, sending_paused_at: '2026-08-05T10:00:00Z' };
  assert.throws(() => assertChannelSendable(paused, 'email'), /suspendu/);
  assert.throws(() => assertChannelSendable(paused, 'sms'), /suspendu/);
});

test('sms does not require a verified email domain', () => {
  assert.doesNotThrow(() => assertChannelSendable({ sending_paused_at: null }, 'sms'));
});

test('whatsapp is rejected as unsupported', () => {
  assert.throws(() => assertChannelSendable({ sending_paused_at: null }, 'whatsapp'), /non supporté/);
});
```

Run: `npm test --prefix backend`
Expected: PASS — 6 new tests.

- [ ] **Step 7: Replace client initialisation**

Replace the `let transporter = null; ... twilioClient = twilio(...)` block (currently lines ~132-140) with:

```js
    const cfg = getPlatformConfig();
    const twilioClient = channel === 'sms'
      ? twilio(cfg.twilio.accountSid, cfg.twilio.authToken)
      : null;
```

Then delete the two lines that follow it:

```js
    const fromAddress = settings.smtp_from || settings.smtp_user;
    const fromName = settings.smtp_name || "Wi'Tech Agency";
```

- [ ] **Step 8: Remove the settings lookup**

Delete the `const settingsList = await db.all('SELECT key, value FROM settings');` block and the `settings` reduce that follows it (currently lines ~91-95). Nothing reads `settings` in this file any more.

- [ ] **Step 9: Point templateData at the tenant's own fields**

Replace the `templateData` object (currently lines ~178-186) with:

```js
        const templateData = {
          company_name: prospect.name,
          website: prospect.website,
          phone: prospect.phone,
          city: prospect.city,
          sender_name: campaign.user_name || "Wi'Tech Agency",
          sender_phone: campaign.user_phone || '',
          sender_signature: campaign.user_signature || ''
        };
```

- [ ] **Step 10: Replace the send calls**

Replace the `if (channel === 'email') { await transporter.sendMail(...) } else if ... whatsapp ...` chain (currently lines ~191-215) with:

```js
        if (channel === 'email') {
          await getSesClient().send(new SendEmailCommand(buildEmailPayload({
            user: {
              name: campaign.user_name,
              email: campaign.user_email,
              send_subdomain: campaign.send_subdomain
            },
            prospect,
            subject,
            body
          })));
        } else {
          await twilioClient.messages.create({
            body,
            from: cfg.twilio.senderId,
            to: prospect.phone
          });
        }
```

- [ ] **Step 11: Drop the WhatsApp lead validation branch**

In the per-prospect validation, change the phone check (currently line ~163) from `(channel === 'sms' || channel === 'whatsapp')` to just `channel === 'sms'`.

- [ ] **Step 12: Remove the dead dependency**

```bash
npm uninstall --prefix backend nodemailer
```

Then confirm nothing still imports it:

```bash
grep -rn "nodemailer" backend/src/
```

Expected: no output.

- [ ] **Step 13: Run the full suite**

Run: `npm test --prefix backend`
Expected: PASS — all tests from Tasks 1-6.

- [ ] **Step 14: Commit**

```bash
git add backend/src/services/emailService.js backend/tests/emailService.test.js backend/package.json backend/package-lock.json
git commit -m "feat(email): send campaigns through SES with per-tenant identity"
```

---

### Task 7: SES bounce and complaint webhook

Protects every other tenant from one tenant's bad sending, per the spec.

**Files:**
- Create: `backend/src/routes/sesWebhookRoutes.js`
- Create: `backend/tests/sesWebhook.test.js`
- Modify: `backend/src/database/db.js` (event table)
- Modify: `backend/src/index.js` (mount, unauthenticated)

**Interfaces:**
- Consumes: users columns (Task 5).
- Produces:
  - `parseSnsNotification(rawBody)` → `{ type, subscribeUrl, message }`
  - `extractDeliveryEvent(message)` → `{ eventType, recipient, sendingDomain } | null`
  - `POST /api/ses/events` — mounted **before** `authenticateUser`; AWS cannot present a session cookie.
  - `sending_events` table.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/sesWebhook.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnsNotification, extractDeliveryEvent } from '../src/routes/sesWebhookRoutes.js';

test('recognises a subscription confirmation', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'SubscriptionConfirmation',
    SubscribeURL: 'https://sns.example/confirm'
  }));
  assert.equal(parsed.type, 'SubscriptionConfirmation');
  assert.equal(parsed.subscribeUrl, 'https://sns.example/confirm');
});

test('unwraps the double-encoded SNS Message field', () => {
  const parsed = parseSnsNotification(JSON.stringify({
    Type: 'Notification',
    Message: JSON.stringify({ eventType: 'Complaint' })
  }));
  assert.equal(parsed.type, 'Notification');
  assert.equal(parsed.message.eventType, 'Complaint');
});

test('extracts a complaint with its recipient and sending domain', () => {
  const event = extractDeliveryEvent({
    eventType: 'Complaint',
    mail: { source: 'no-reply@7.mail.witechagency.com' },
    complaint: { complainedRecipients: [{ emailAddress: 'p@exemple.fr' }] }
  });
  assert.deepEqual(event, {
    eventType: 'Complaint',
    recipient: 'p@exemple.fr',
    sendingDomain: '7.mail.witechagency.com'
  });
});

test('extracts a bounce', () => {
  const event = extractDeliveryEvent({
    eventType: 'Bounce',
    mail: { source: 'no-reply@9.mail.witechagency.com' },
    bounce: { bouncedRecipients: [{ emailAddress: 'x@y.fr' }] }
  });
  assert.equal(event.eventType, 'Bounce');
  assert.equal(event.sendingDomain, '9.mail.witechagency.com');
});

test('ignores event types we do not act on', () => {
  assert.equal(extractDeliveryEvent({ eventType: 'Delivery', mail: { source: 'a@b.c' } }), null);
});

test('returns null rather than throwing on a malformed event', () => {
  assert.equal(extractDeliveryEvent({}), null);
  assert.equal(extractDeliveryEvent({ eventType: 'Bounce' }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the events table**

In `backend/src/database/db.js`, after the `campaign_logs` table block (ends line ~168), add:

```js
  // Bounce/complaint feedback from SES, used to auto-pause abusive tenants.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sending_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL,
      recipient VARCHAR(255),
      sending_domain VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sending_events_user ON sending_events(user_id, event_type);
  `);
```

- [ ] **Step 4: Write the webhook**

Create `backend/src/routes/sesWebhookRoutes.js`:

```js
import express from 'express';
import axios from 'axios';
import { getDb } from '../database/db.js';

const router = express.Router();

/** Complaint rate above which a tenant is paused, once past the sample floor. */
const COMPLAINT_RATE_THRESHOLD = 0.05;
const COMPLAINT_SAMPLE_FLOOR = 20;

export function parseSnsNotification(rawBody) {
  const envelope = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  return {
    type: envelope.Type,
    subscribeUrl: envelope.SubscribeURL || null,
    message: envelope.Message ? JSON.parse(envelope.Message) : null
  };
}

export function extractDeliveryEvent(message) {
  if (!message || !message.eventType) return null;
  const source = message.mail?.source;
  if (!source) return null;

  const sendingDomain = source.split('@')[1] || null;
  if (!sendingDomain) return null;

  if (message.eventType === 'Complaint') {
    return {
      eventType: 'Complaint',
      recipient: message.complaint?.complainedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  if (message.eventType === 'Bounce') {
    return {
      eventType: 'Bounce',
      recipient: message.bounce?.bouncedRecipients?.[0]?.emailAddress ?? null,
      sendingDomain
    };
  }
  return null;
}

async function pauseIfComplaintRateExceeded(db, userId) {
  const counts = await db.get(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'Complaint') AS complaints,
       COUNT(*) AS total
     FROM sending_events WHERE user_id = ?`,
    userId
  );
  const total = Number(counts?.total || 0);
  const complaints = Number(counts?.complaints || 0);
  if (total < COMPLAINT_SAMPLE_FLOOR) return;
  if (complaints / total < COMPLAINT_RATE_THRESHOLD) return;

  await db.run(
    'UPDATE users SET sending_paused_at = CURRENT_TIMESTAMP WHERE id = ? AND sending_paused_at IS NULL',
    userId
  );
  await db.run(
    "UPDATE campaigns SET status = 'Paused' WHERE user_id = ? AND status = 'Active'",
    userId
  );
  console.warn(`Sending: paused user ${userId} (${complaints}/${total} complaints)`);
}

router.post('/events', async (req, res) => {
  try {
    const parsed = parseSnsNotification(req.body);

    if (parsed.type === 'SubscriptionConfirmation' && parsed.subscribeUrl) {
      await axios.get(parsed.subscribeUrl);
      return res.status(200).send('subscription confirmed');
    }

    const event = extractDeliveryEvent(parsed.message);
    if (!event) return res.status(200).send('ignored');

    const db = await getDb();
    const user = await db.get('SELECT id FROM users WHERE send_subdomain = ?', event.sendingDomain);
    if (!user) return res.status(200).send('unknown domain');

    await db.run(
      'INSERT INTO sending_events (user_id, event_type, recipient, sending_domain) VALUES (?, ?, ?, ?)',
      user.id, event.eventType, event.recipient, event.sendingDomain
    );

    if (event.eventType === 'Complaint') {
      await pauseIfComplaintRateExceeded(db, user.id);
    }

    res.status(200).send('recorded');
  } catch (error) {
    console.error('SES webhook error:', error.message);
    // 200 regardless: SNS retries aggressively on non-2xx and we do not want a
    // poison message replayed forever.
    res.status(200).send('error logged');
  }
});

export default router;
```

- [ ] **Step 5: Mount it before authentication**

In `backend/src/index.js`, add the import next to the other route imports:

```js
import sesWebhookRouter from './routes/sesWebhookRoutes.js';
```

Then mount it **above** the `app.use('/api', authenticateUser, apiRouter);` line (currently line 52). SNS posts `text/plain`, so it needs its own body parser:

```js
// AWS SNS delivers SES events unauthenticated and as text/plain.
app.use('/api/ses', express.text({ type: '*/*' }), sesWebhookRouter);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 6 new tests.

- [ ] **Step 7: Verify the route is reachable without a session**

Start the backend, then:

```bash
curl -s -X POST http://localhost:3001/api/ses/events -H 'Content-Type: text/plain' -d '{"Type":"Notification","Message":"{\"eventType\":\"Delivery\"}"}'
```

Expected: `ignored` — and specifically **not** a 401, which would mean it landed behind `authenticateUser`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/sesWebhookRoutes.js backend/tests/sesWebhook.test.js backend/src/database/db.js backend/src/index.js
git commit -m "feat(email): record SES bounces and auto-pause tenants over the complaint threshold"
```

---

### Task 8: Rebuild the Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `GET /api/sending-status` (Task 5), `PUT /api/auth/profile` with the new fields (Task 3).
- Produces: no exports beyond the default component.

- [ ] **Step 1: Delete the credential state**

In `frontend/src/pages/Settings.jsx`, replace the `settings` useState initialiser (lines 18-32) with:

```jsx
  const [sending, setSending] = useState({ status: 'pending', subdomain: null, replyTo: null, pausedAt: null });
```

and extend `profileForm` (lines 35-39) to carry the branding fields:

```jsx
  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    company_name: currentUser?.company_name || '',
    company_website: currentUser?.company_website || '',
    sender_signature: currentUser?.sender_signature || ''
  });
```

Update the `useEffect` that syncs `profileForm` (lines 44-52) to copy the same six fields.

- [ ] **Step 2: Replace the settings loader**

Replace `loadSettings` (lines 65-75) and its `useEffect` with:

```jsx
  useEffect(() => {
    loadSendingStatus();
  }, []);

  const loadSendingStatus = async () => {
    try {
      const res = await fetch(`${apiHost}/api/sending-status`, { credentials: 'include' });
      if (res.ok) setSending(await res.json());
    } catch (err) {
      console.error('Failed to load sending status', err);
    }
  };
```

- [ ] **Step 3: Delete the dead handlers and state**

Remove `handleInputChange`, `handleSaveSettings`, `handleTestSmtp`, and the `saving`, `testing`, `testResult` state declarations (lines 55-57). They have no remaining callers.

- [ ] **Step 4: Replace the SMTP and Twilio panels**

Replace everything from the `{/* SMTP Parameters */}` comment through the closing of the test-result panel (lines 234-396) with a status card:

```jsx
        {/* Sending infrastructure — managed by the platform, nothing to configure */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-full">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-600" />
              Votre infrastructure d'envoi
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Aucune configuration requise. Wi'Tech Lead envoie vos campagnes depuis une
              infrastructure dédiée à votre compte.
            </p>

            {sending.pausedAt ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-red-50 border-red-200 text-red-800">
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Envoi suspendu.</strong> Le taux de plaintes de vos destinataires a dépassé
                  le seuil autorisé. Contactez le support pour rétablir l'envoi.
                </span>
              </div>
            ) : sending.status === 'verified' ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-emerald-50 border-emerald-200 text-emerald-800">
                <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Prêt à l'envoi.</strong> Vos e-mails partent au nom de{' '}
                  <strong>{profileForm.name}</strong>. Les réponses de vos prospects arrivent
                  directement dans <strong>{sending.replyTo}</strong>.
                </span>
              </div>
            ) : sending.status === 'failed' ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-amber-50 border-amber-200 text-amber-800">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  La préparation de votre infrastructure a échoué. Cliquez sur Actualiser, et
                  contactez le support si le problème persiste.
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-slate-50 border-slate-200 text-slate-700">
                <RefreshCw className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5 animate-spin" />
                <span>
                  <strong>Préparation en cours.</strong> Votre infrastructure d'envoi est en cours
                  de configuration — cela prend généralement quelques minutes.
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-6 mt-6 border-t border-slate-100">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all duration-150"
                onClick={loadSendingStatus}
              >
                <RefreshCw className="w-4 h-4 text-teal-600" />
                Actualiser
              </button>
            </div>
          </div>
        </div>
```

- [ ] **Step 5: Move branding into the profile card**

In the "Profil Wi'Tech Agency" card (lines 450-490), change the three inputs to read from `profileForm` and write via `setProfileForm`, and change its button to call `handleSaveProfile`:

- `settings.company_name` → `profileForm.company_name`, `onChange` → `setProfileForm({ ...profileForm, company_name: e.target.value })`
- `settings.company_website` → `profileForm.company_website`, likewise
- `settings.sender_signature` → `profileForm.sender_signature`, likewise
- `onClick={handleSaveSettings}` → `onClick={handleSaveProfile}`

- [ ] **Step 6: Fix the page subtitle**

Replace the subtitle on line 229:

```jsx
          Gérez votre profil, votre signature de prospection et les exports de votre base de données.
```

- [ ] **Step 7: Drop the now-unused icon imports**

`Lock` (SMTP header), `Phone` (Twilio header), and `Save` (SMTP submit button) no longer have any usage. Remove them from the `lucide-react` import at the top of the file, leaving:

```jsx
import {
  Mail,
  Settings as SettingsIcon,
  User,
  Check,
  X,
  Download,
  Upload,
  RefreshCw,
  Info
} from 'lucide-react';
```

- [ ] **Step 8: Confirm no dead references remain**

```bash
grep -n "smtp\|twilio\|handleSaveSettings\|handleTestSmtp\|handleInputChange\|testResult\|Lock\|Phone\|Save" frontend/src/pages/Settings.jsx
```

Expected: no output.

Then confirm the linter agrees:

```bash
npm run lint --prefix frontend
```

Expected: no errors for `Settings.jsx`.

- [ ] **Step 9: Verify the page renders**

Start both servers (`npm run dev --prefix frontend` and, in a separate shell with `PORT` unset, `npm run dev --prefix backend`), open `http://localhost:5173`, sign in, go to Configurations.

Expected: no SMTP or Twilio fields anywhere; the sending-status card shows "Préparation en cours"; the browser console has no errors.

> **Note on running the two servers:** do not use the root `npm run dev`. Its
> `concurrently` invocation lets the frontend's `PORT` leak into the backend
> process, which then tries to bind 5173 and dies with `EADDRINUSE`. Start each
> side in its own shell.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat(ui): replace SMTP and Twilio config with managed sending status"
```

---

### Task 9: Platform setup runbook

The code cannot provision the AWS account, the DNS delegation, or the Twilio Sender ID. This task writes down exactly what a human operator must do, once, before the product can send anything.

**Files:**
- Create: `docs/platform-setup.md`
- Modify: `README.md` (link to it)

**Interfaces:**
- Consumes: variable names from Task 1, record shapes from Task 4, webhook path from Task 7.
- Produces: documentation only.

- [ ] **Step 1: Write the runbook**

Create `docs/platform-setup.md` covering, in order, with the exact values this codebase expects:

1. **Route53 zone delegation.** Create a public hosted zone for `mail.witechagency.com` in Route53; copy its four NS records; add them as NS records on `mail` in the Vercel DNS panel for `witechagency.com`. Note explicitly that the apex domain and the marketing site are untouched. Record the hosted zone ID in `ROUTE53_HOSTED_ZONE_ID`.
2. **IAM.** Create a programmatic user limited to `ses:CreateEmailIdentity`, `ses:GetEmailIdentity`, `ses:PutEmailIdentityMailFromAttributes`, `ses:SendEmail` and `route53:ChangeResourceRecordSets` scoped to that hosted zone. Put the keys in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
3. **SES production access.** Explain that a new account is sandboxed (only verified recipients, 200 messages/day) and that the support request must describe the B2B outreach use case, the opt-out mechanism, and how bounces are handled. Flag that this review typically takes 24-48h and that nothing can be sent to real prospects until it clears.
4. **SES configuration set.** Create a set named to match `SES_CONFIGURATION_SET`, add an SNS event destination for `BOUNCE` and `COMPLAINT`, and point that SNS topic at `https://<api-host>/api/ses/events`.
5. **Twilio.** Register the `WITECH` alphanumeric Sender ID, note that FR/EU registration is reviewed and that alphanumeric senders are one-way only (no replies), and record `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_SENDER_ID`.
6. **Verification.** Sign up a fresh account, confirm a row appears in `users` with a `send_subdomain`, confirm the DKIM CNAMEs exist in Route53, and confirm `GET /api/sending-status` flips to `verified` within ~15 minutes.

- [ ] **Step 2: Link it from the README**

Add to `README.md`, under the deployment section:

```markdown
### Configuration de la plateforme (une seule fois)

L'envoi d'e-mails et de SMS repose sur une infrastructure gérée par l'opérateur
(AWS SES + Twilio). Voir [docs/platform-setup.md](docs/platform-setup.md) — cette
configuration est requise avant tout envoi réel.
```

- [ ] **Step 3: Commit**

```bash
git add docs/platform-setup.md README.md
git commit -m "docs: add one-time platform setup runbook for SES and Twilio"
```

---

## Verification

After every task, `npm test --prefix backend` passes.

End-to-end verification is **blocked on the Task 9 runbook being executed by a human with AWS and Twilio account access**. Until SES production access is granted, the honest state of the system is: unit tests pass, the server boots, provisioning is attempted and lands in `pending` or `failed`, and no real email can be sent. Do not report the feature as working before a real campaign has been sent to a real recipient and a reply has arrived in the tenant's inbox.
