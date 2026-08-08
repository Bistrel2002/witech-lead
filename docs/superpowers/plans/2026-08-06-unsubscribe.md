# Email Unsubscribe / Opt-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every campaign email a working unsubscribe path, so the platform can honestly answer the AWS SES production-access form's mandatory opt-out question and satisfy the CNIL requirement for an opt-out in every B2B prospecting message.

**Architecture:** A new `unsubscribes` table holds suppressions — scoped to one tenant for voluntary opt-outs, global (`user_id IS NULL`) for spam complaints. Unsubscribe links carry a stateless HMAC token encoding the tenant and recipient, so no token table is needed and a link never expires. Two public unauthenticated routes render and process the opt-out, served as self-contained HTML by the backend. Campaign sends gain `List-Unsubscribe` headers via the SES `Simple.Headers` field, a `{{unsubscribe_link}}` merge tag that is auto-appended when a template omits it, and a suppression check that marks skipped prospects `Skipped` rather than `Failed`.

**Tech Stack:** Node 20 (ESM), Express 4, PostgreSQL via the project's `DatabaseAdapter`, `@aws-sdk/client-sesv2@3.1103.0`, Node's built-in `node:crypto` and `node:test`.

## Global Constraints

- **All user-facing copy is French.** This includes the unsubscribe HTML pages, which recipients (not customers) will read.
- **All backend files are ESM** (`import`/`export`); `backend/package.json` has `"type": "module"`.
- **All SQL goes through the `DatabaseAdapter`** (`db.get` / `db.all` / `db.run` / `db.exec`) using `?` placeholders — the adapter rewrites them to `$1, $2, …`. Never write `$1` directly.
- **Email addresses are normalised** (trimmed, lowercased) everywhere they are stored or compared. A suppression that can be defeated by capitalisation is not a suppression.
- **The unsubscribe routes are unauthenticated** and must be mounted **before** `app.use('/api', authenticateUser, apiRouter)` in `backend/src/index.js`. A recipient has no session.
- **Suppression scope:** voluntary unsubscribe → row with the sending tenant's `user_id`; spam complaint → row with `user_id = NULL`, meaning global.
- **Email bodies stay plain text.** No HTML email.
- **SMS and WhatsApp are out of scope.** Do not add opt-out handling for them.
- **Tests run with:** `npm test --prefix backend`. The suite is at 97/97 passing before this plan; it must be green and larger after every task.

---

### Task 1: Suppression store, HMAC tokens, and config

Everything later tasks build on: the table, the token primitives, and the two new platform config values.

**Files:**
- Create: `backend/src/services/unsubscribeService.js`
- Create: `backend/tests/unsubscribeService.test.js`
- Modify: `backend/src/config/platformConfig.js`
- Modify: `backend/tests/platformConfig.test.js`
- Modify: `backend/src/database/db.js` (new table + indexes)
- Modify: `.env.example`, `render.yaml`

**Interfaces:**
- Consumes: `getPlatformConfig()` from `backend/src/config/platformConfig.js`, which returns a frozen object; this task adds `unsubscribe.secret` and `publicApiUrl` to it.
- Produces:
  - `normaliseEmail(email)` → lowercased, trimmed string (`''` for null/undefined)
  - `buildUnsubscribeToken(userId, email)` → `string` of the form `<payloadB64url>.<sigB64url>`
  - `verifyUnsubscribeToken(token)` → `{ userId: number, email: string } | null` (null when malformed, tampered, or signature mismatch)
  - `buildUnsubscribeUrl(userId, email)` → `${publicApiUrl}/unsubscribe/${token}`
  - `async isSuppressed(db, userId, email)` → `boolean`
  - `async recordUnsubscribe(db, userId, email, source)` → `void`; `userId` may be `null` for a global suppression; `source` is `'manual'` or `'complaint'`; idempotent.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unsubscribeService.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import {
  normaliseEmail,
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  isSuppressed,
  recordUnsubscribe
} from '../src/services/unsubscribeService.js';

const ENV = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  TWILIO_ACCOUNT_SID: 'AC',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_SENDER_ID: 'WITECH',
  SES_WEBHOOK_TOKEN: 'webhook-token',
  UNSUBSCRIBE_SECRET: 'unsub-secret-for-tests',
  PUBLIC_API_URL: 'https://api.witechagency.com'
};

test.beforeEach(() => {
  Object.assign(process.env, ENV);
  resetPlatformConfigCache();
});

test('normaliseEmail trims and lowercases', () => {
  assert.equal(normaliseEmail('  Contact@Exemple.FR '), 'contact@exemple.fr');
  assert.equal(normaliseEmail(null), '');
  assert.equal(normaliseEmail(undefined), '');
});

test('a token round-trips back to its tenant and email', () => {
  const token = buildUnsubscribeToken(7, 'Contact@Exemple.FR');
  assert.deepEqual(verifyUnsubscribeToken(token), { userId: 7, email: 'contact@exemple.fr' });
});

test('a tampered payload is rejected', () => {
  const token = buildUnsubscribeToken(7, 'a@b.fr');
  const [, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 8, e: 'a@b.fr' })).toString('base64url');
  assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`), null);
});

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', 'nodot', 'a.b.c', '...', 'zzz.zzz', null, undefined]) {
    assert.equal(verifyUnsubscribeToken(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('the same tenant+email always yields the same token', () => {
  assert.equal(buildUnsubscribeToken(7, 'a@b.fr'), buildUnsubscribeToken(7, 'A@B.FR'));
});

test('different tenants get different tokens for the same email', () => {
  assert.notEqual(buildUnsubscribeToken(7, 'a@b.fr'), buildUnsubscribeToken(8, 'a@b.fr'));
});

test('buildUnsubscribeUrl uses the public API base', () => {
  const url = buildUnsubscribeUrl(7, 'a@b.fr');
  assert.ok(url.startsWith('https://api.witechagency.com/unsubscribe/'), url);
});

function fakeDb(rows = []) {
  const inserts = [];
  return {
    inserts,
    async get(sql, ...params) {
      if (!/FROM unsubscribes/i.test(sql)) throw new Error(`unexpected query: ${sql}`);
      const [email, userId] = params;
      const hit = rows.find((r) => r.email === email && (r.user_id === userId || r.user_id === null));
      return hit ? { id: 1 } : undefined;
    },
    async run(sql, ...params) {
      inserts.push({ sql, params });
      return { changes: 1 };
    }
  };
}

test('isSuppressed matches a row for this tenant', async () => {
  const db = fakeDb([{ user_id: 7, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'A@B.fr'), true);
});

test('isSuppressed ignores another tenant row', async () => {
  const db = fakeDb([{ user_id: 9, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'a@b.fr'), false);
});

test('isSuppressed matches a global row for every tenant', async () => {
  const db = fakeDb([{ user_id: null, email: 'a@b.fr' }]);
  assert.equal(await isSuppressed(db, 7, 'a@b.fr'), true);
  assert.equal(await isSuppressed(db, 99, 'a@b.fr'), true);
});

test('recordUnsubscribe normalises the email and passes the source', async () => {
  const db = fakeDb();
  await recordUnsubscribe(db, 7, ' A@B.FR ', 'manual');
  assert.equal(db.inserts.length, 1);
  assert.ok(db.inserts[0].params.includes('a@b.fr'));
  assert.ok(db.inserts[0].params.includes('manual'));
  assert.ok(db.inserts[0].params.includes(7));
});

test('recordUnsubscribe accepts a null tenant for a global suppression', async () => {
  const db = fakeDb();
  await recordUnsubscribe(db, null, 'a@b.fr', 'complaint');
  assert.ok(db.inserts[0].params.includes(null));
  assert.ok(db.inserts[0].params.includes('complaint'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `Cannot find module '../src/services/unsubscribeService.js'`

- [ ] **Step 3: Add the two config values**

In `backend/src/config/platformConfig.js`, add to `REQUIRED_VARS`:

```js
  'UNSUBSCRIBE_SECRET',
  'PUBLIC_API_URL'
```

and add to the frozen object returned by `getPlatformConfig()`:

```js
    // Public base URL of THIS backend. Unsubscribe links are served by the
    // backend, not the frontend, so FRONTEND_URL is the wrong value here.
    publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
    unsubscribe: Object.freeze({
      // Signs unsubscribe tokens. Rotating it invalidates every link already
      // sent, so treat it as permanent once the first campaign has gone out.
      secret: process.env.UNSUBSCRIBE_SECRET
    })
```

- [ ] **Step 4: Update the platformConfig test fixture**

`backend/tests/platformConfig.test.js` builds a full env fixture. Add both new variables to its `REQUIRED` object so the existing tests keep passing:

```js
  UNSUBSCRIBE_SECRET: 'unsub-secret',
  PUBLIC_API_URL: 'https://api.example.com',
```

Then add a test asserting the trailing slash is stripped:

```js
test('publicApiUrl has any trailing slash removed', () => {
  withEnv({ PUBLIC_API_URL: 'https://api.example.com/' }, () => {
    assert.equal(getPlatformConfig().publicApiUrl, 'https://api.example.com');
  });
});
```

- [ ] **Step 5: Create the table**

In `backend/src/database/db.js`, after the `sending_events` table block, add:

```js
  // Opt-out suppressions. user_id NULL means global — set when a recipient
  // files a spam complaint, since an address that complains endangers the
  // reputation of the whole shared sending infrastructure.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS unsubscribes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      source VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Two partial indexes rather than one composite: in PostgreSQL NULL is not
  // equal to NULL, so a plain UNIQUE(user_id, email) would happily accept
  // unlimited duplicate global rows.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_tenant
      ON unsubscribes(user_id, email) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_global
      ON unsubscribes(email) WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);
  `);
```

- [ ] **Step 6: Write the service**

Create `backend/src/services/unsubscribeService.js`:

```js
import crypto from 'node:crypto';
import { getPlatformConfig } from '../config/platformConfig.js';

/**
 * Unsubscribe links carry a stateless HMAC token instead of a stored id.
 * No token table, nothing to migrate, and a link stays valid forever — a
 * recipient who finds a months-old email can still opt out, which is exactly
 * what the regulation intends.
 */

export function normaliseEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', getPlatformConfig().unsubscribe.secret)
    .update(payloadB64)
    .digest('base64url');
}

export function buildUnsubscribeToken(userId, email) {
  const payload = JSON.stringify({ u: userId, e: normaliseEmail(email) });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  // Length check first: timingSafeEqual throws on unequal lengths.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const { u, e } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof u !== 'number' || typeof e !== 'string' || !e) return null;
    return { userId: u, email: normaliseEmail(e) };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(userId, email) {
  const { publicApiUrl } = getPlatformConfig();
  return `${publicApiUrl}/unsubscribe/${buildUnsubscribeToken(userId, email)}`;
}

export async function isSuppressed(db, userId, email) {
  const row = await db.get(
    'SELECT id FROM unsubscribes WHERE email = ? AND (user_id = ? OR user_id IS NULL) LIMIT 1',
    normaliseEmail(email), userId
  );
  return Boolean(row);
}

export async function recordUnsubscribe(db, userId, email, source) {
  await db.run(
    `INSERT INTO unsubscribes (user_id, email, source) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING`,
    userId, normaliseEmail(email), source
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 13 new tests, plus the existing suite green.

- [ ] **Step 8: Document the new variables**

In `.env.example`, add to the platform section:

```bash
# Public base URL of the BACKEND itself (not the frontend). Unsubscribe links
# are served by the backend, so this must be the API host.
PUBLIC_API_URL=https://witech-lead-api.onrender.com
# Signs unsubscribe tokens. Long random string. Rotating it invalidates every
# unsubscribe link already sent — treat it as permanent after first send.
UNSUBSCRIBE_SECRET=
```

In `render.yaml`, add both keys to the backend service's `envVars` with `sync: false`, matching the style of the existing platform keys.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/unsubscribeService.js backend/tests/unsubscribeService.test.js backend/src/config/platformConfig.js backend/tests/platformConfig.test.js backend/src/database/db.js .env.example render.yaml
git commit -m "feat(unsubscribe): add suppression store, HMAC tokens and config"
```

---

### Task 2: Public unsubscribe routes

**Files:**
- Create: `backend/src/routes/unsubscribeRoutes.js`
- Create: `backend/tests/unsubscribeRoutes.test.js`
- Modify: `backend/src/index.js` (mount, before `authenticateUser`)

**Interfaces:**
- Consumes: `verifyUnsubscribeToken`, `recordUnsubscribe`, `isSuppressed` (Task 1).
- Produces:
  - `renderConfirmPage(email)` → HTML string with a POST form
  - `renderDonePage(email)` → HTML string confirming the opt-out
  - `renderErrorPage()` → HTML string for an invalid token
  - `GET /unsubscribe/:token` — renders, mutates nothing
  - `POST /unsubscribe/:token` — suppresses, then renders the done page
  - Default export: the Express router

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unsubscribeRoutes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPlatformConfigCache } from '../src/config/platformConfig.js';
import { buildUnsubscribeToken } from '../src/services/unsubscribeService.js';
import {
  renderConfirmPage,
  renderDonePage,
  renderErrorPage,
  handleUnsubscribeGet,
  handleUnsubscribePost
} from '../src/routes/unsubscribeRoutes.js';

const ENV = {
  AWS_REGION: 'eu-west-3',
  MAIL_ROOT_DOMAIN: 'mail.witechagency.com',
  TWILIO_ACCOUNT_SID: 'AC',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_SENDER_ID: 'WITECH',
  SES_WEBHOOK_TOKEN: 'webhook-token',
  UNSUBSCRIBE_SECRET: 'unsub-secret-for-tests',
  PUBLIC_API_URL: 'https://api.witechagency.com'
};

test.beforeEach(() => {
  Object.assign(process.env, ENV);
  resetPlatformConfigCache();
});

function fakeRes() {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

function fakeDb() {
  const inserts = [];
  return {
    inserts,
    async get() { return undefined; },
    async run(sql, ...params) { inserts.push({ sql, params }); return { changes: 1 }; }
  };
}

test('pages are French and escape the email', () => {
  const html = renderConfirmPage('a<script>@b.fr');
  assert.ok(html.includes('Se désinscrire'), 'should carry the French action label');
  assert.ok(!html.includes('<script>'), 'must not inject raw HTML from the email');
  assert.ok(renderDonePage('a@b.fr').includes('désinscrit'));
  assert.ok(renderErrorPage().includes('invalide'));
});

test('GET renders the confirmation page and writes nothing', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('a@b.fr'));
  assert.equal(db.inserts.length, 0, 'GET must never mutate');
});

test('GET with an invalid token returns 400 and the error page', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribeGet({ params: { token: 'garbage' } }, res, { db });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('invalide'));
  assert.equal(db.inserts.length, 0);
});

test('POST records the suppression for that tenant', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribePost({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db });
  assert.equal(res.statusCode, 200);
  assert.equal(db.inserts.length, 1);
  assert.ok(db.inserts[0].params.includes(7));
  assert.ok(db.inserts[0].params.includes('a@b.fr'));
  assert.ok(db.inserts[0].params.includes('manual'));
});

test('POST is idempotent — replaying still succeeds', async () => {
  const db = fakeDb();
  const token = buildUnsubscribeToken(7, 'a@b.fr');
  const first = fakeRes();
  const second = fakeRes();
  await handleUnsubscribePost({ params: { token } }, first, { db });
  await handleUnsubscribePost({ params: { token } }, second, { db });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});

test('POST with an invalid token returns 400 and writes nothing', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await handleUnsubscribePost({ params: { token: 'garbage' } }, res, { db });
  assert.equal(res.statusCode, 400);
  assert.equal(db.inserts.length, 0);
});

test('a database failure yields 500, not an unhandled rejection', async () => {
  const db = { async get() { return undefined; }, async run() { throw new Error('db down'); } };
  const res = fakeRes();
  await assert.doesNotReject(() =>
    handleUnsubscribePost({ params: { token: buildUnsubscribeToken(7, 'a@b.fr') } }, res, { db })
  );
  assert.equal(res.statusCode, 500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `Cannot find module '../src/routes/unsubscribeRoutes.js'`

- [ ] **Step 3: Write the routes**

Create `backend/src/routes/unsubscribeRoutes.js`:

```js
import express from 'express';
import { getDb } from '../database/db.js';
import { verifyUnsubscribeToken, recordUnsubscribe } from '../services/unsubscribeService.js';

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Self-contained pages: no CSS file, no framework, no external asset. They must
 * render for a recipient who has no session and no relationship with us, even
 * if the customer-facing frontend is down.
 */
function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc;
         color: #0f172a; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 1.5rem; }
  main { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 2rem;
         max-width: 30rem; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
  p { color: #475569; line-height: 1.6; margin: 0 0 1rem; }
  strong { color: #0f172a; }
  button { background: #0f766e; color: #fff; border: 0; border-radius: 10px;
           padding: .75rem 1.25rem; font-size: .95rem; font-weight: 600; cursor: pointer; }
  button:hover { background: #115e59; }
</style>
</head>
<body><main>${bodyHtml}</main></body>
</html>`;
}

export function renderConfirmPage(email) {
  return page('Se désinscrire', `
    <h1>Se désinscrire</h1>
    <p>Vous ne recevrez plus de messages de prospection de cet expéditeur à l'adresse
       <strong>${escapeHtml(email)}</strong>.</p>
    <form method="POST">
      <button type="submit">Confirmer la désinscription</button>
    </form>
  `);
}

export function renderDonePage(email) {
  return page('Désinscription confirmée', `
    <h1>C'est fait</h1>
    <p>L'adresse <strong>${escapeHtml(email)}</strong> a été désinscrite. Vous ne recevrez
       plus de messages de cet expéditeur.</p>
    <p>Vous pouvez fermer cette page.</p>
  `);
}

export function renderErrorPage() {
  return page('Lien invalide', `
    <h1>Lien invalide</h1>
    <p>Ce lien de désinscription est invalide ou incomplet. Vérifiez que vous avez copié
       l'adresse en entier depuis l'e-mail reçu.</p>
  `);
}

function sendHtml(res, status, html) {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

export async function handleUnsubscribeGet(req, res, deps = {}) {
  const claim = verifyUnsubscribeToken(req.params.token);
  if (!claim) return sendHtml(res, 400, renderErrorPage());
  return sendHtml(res, 200, renderConfirmPage(claim.email));
}

export async function handleUnsubscribePost(req, res, deps = {}) {
  const claim = verifyUnsubscribeToken(req.params.token);
  if (!claim) return sendHtml(res, 400, renderErrorPage());

  try {
    const db = deps.db ?? await getDb();
    await recordUnsubscribe(db, claim.userId, claim.email, 'manual');
    return sendHtml(res, 200, renderDonePage(claim.email));
  } catch (error) {
    console.error('Unsubscribe: failed to record opt-out:', error.message);
    return sendHtml(res, 500, page('Erreur', `
      <h1>Une erreur est survenue</h1>
      <p>Votre désinscription n'a pas pu être enregistrée. Merci de réessayer dans quelques
         instants.</p>
    `));
  }
}

router.get('/:token', (req, res) => handleUnsubscribeGet(req, res));
router.post('/:token', (req, res) => handleUnsubscribePost(req, res));

export default router;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 7 new tests.

- [ ] **Step 5: Mount before authentication**

In `backend/src/index.js`, add the import beside the other route imports:

```js
import unsubscribeRouter from './routes/unsubscribeRoutes.js';
```

Then mount it **above** `app.use('/api', authenticateUser, apiRouter);`. It needs `express.urlencoded` because the confirmation page posts a plain HTML form:

```js
// Recipients have no session. Mounted before authenticateUser deliberately,
// and NOT under /api so the URL stays short enough to survive line-wrapping
// in plain-text email clients.
app.use('/unsubscribe', express.urlencoded({ extended: false }), unsubscribeRouter);
```

- [ ] **Step 6: Verify the route answers without a session**

Start the backend in its own shell (`npm run dev --prefix backend` — never the root `npm run dev`, whose `concurrently` setup leaks the frontend's `PORT` into the backend and kills it with EADDRINUSE), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/unsubscribe/garbage
```

Expected: `400` — and specifically not `401`, which would mean it landed behind `authenticateUser`.

Stop the server when done.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/unsubscribeRoutes.js backend/tests/unsubscribeRoutes.test.js backend/src/index.js
git commit -m "feat(unsubscribe): add public opt-out pages and routes"
```

---

### Task 3: Wire unsubscribe into the send path

**Files:**
- Modify: `backend/src/services/emailService.js`
- Modify: `backend/tests/emailService.test.js`
- Modify: `frontend/src/pages/Campaigns.jsx:990-1005` (render the new `Skipped` log status)

**Interfaces:**
- Consumes: `buildUnsubscribeUrl`, `isSuppressed` (Task 1).
- Produces:
  - `appendUnsubscribeNotice(body, unsubscribeUrl)` → body unchanged when it already contains the URL, otherwise body + a French notice + the URL
  - `buildEmailPayload({ user, prospect, subject, body, unsubscribeUrl })` — same shape as before plus `Content.Simple.Headers` when `unsubscribeUrl` is given
  - `compileTemplate` gains an `unsubscribe_link` replacement

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/emailService.test.js` (put the new imports on the existing import line from that module, not in a second statement mid-file):

```js
test('compileTemplate substitutes the unsubscribe link', () => {
  const out = compileTemplate('Bonjour\n{{unsubscribe_link}}', {
    unsubscribe_link: 'https://api.example.com/unsubscribe/abc'
  });
  assert.equal(out, 'Bonjour\nhttps://api.example.com/unsubscribe/abc');
});

test('appendUnsubscribeNotice adds the link when the template omits it', () => {
  const out = appendUnsubscribeNotice('Bonjour', 'https://api.example.com/unsubscribe/abc');
  assert.ok(out.startsWith('Bonjour'));
  assert.ok(out.includes('https://api.example.com/unsubscribe/abc'));
  assert.ok(/désinscrire/i.test(out), 'notice should be French');
});

test('appendUnsubscribeNotice does not double-append', () => {
  const url = 'https://api.example.com/unsubscribe/abc';
  const already = `Bonjour\n\nPour ne plus recevoir: ${url}`;
  assert.equal(appendUnsubscribeNotice(already, url), already);
});

test('buildEmailPayload sets both List-Unsubscribe headers', () => {
  const payload = buildEmailPayload({
    user,
    prospect: { email: 'p@e.fr' },
    subject: 's',
    body: 'b',
    unsubscribeUrl: 'https://api.example.com/unsubscribe/abc'
  });
  const headers = payload.Content.Simple.Headers;
  const byName = Object.fromEntries(headers.map((h) => [h.Name, h.Value]));
  assert.equal(byName['List-Unsubscribe'], '<https://api.example.com/unsubscribe/abc>');
  assert.equal(byName['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('buildEmailPayload omits Headers when no unsubscribe URL is supplied', () => {
  const payload = buildEmailPayload({ user, prospect: { email: 'p@e.fr' }, subject: 's', body: 'b' });
  assert.equal(payload.Content.Simple.Headers, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — `appendUnsubscribeNotice` is not exported.

- [ ] **Step 3: Add the merge tag**

In `compileTemplate` in `backend/src/services/emailService.js`, add to the `replacements` object:

```js
    unsubscribe_link: data.unsubscribe_link || ''
```

- [ ] **Step 4: Add the auto-append helper**

Add to `backend/src/services/emailService.js`, below `compileTemplate`:

```js
/**
 * The compliance backstop. A tenant editing a template — or writing one from
 * scratch — must not be able to send a message with no way out of the list, so
 * if the compiled body does not already carry the link we append it.
 */
export function appendUnsubscribeNotice(body, unsubscribeUrl) {
  if (!unsubscribeUrl) return body;
  if (body && body.includes(unsubscribeUrl)) return body;
  return `${body || ''}\n\n---\nPour ne plus recevoir de messages de notre part : ${unsubscribeUrl}`;
}
```

- [ ] **Step 5: Add the headers to the payload**

In `buildEmailPayload`, accept `unsubscribeUrl` and attach the headers:

```js
export function buildEmailPayload({ user, prospect, subject, body, unsubscribeUrl }) {
  const cfg = getPlatformConfig();
  const simple = {
    Subject: { Data: subject, Charset: 'UTF-8' },
    Body: { Text: { Data: body, Charset: 'UTF-8' } }
  };
  if (unsubscribeUrl) {
    // Gmail and Outlook require both of these from bulk senders; the SESv2
    // Simple content shape supports Headers directly, so no raw MIME needed.
    simple.Headers = [
      { Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }
    ];
  }
  const payload = {
    FromEmailAddress: `"${sanitizeDisplayName(user.name)}" <${buildFromAddress(user.send_subdomain)}>`,
    ReplyToAddresses: [user.email],
    Destination: { ToAddresses: [prospect.email] },
    Content: { Simple: simple }
  };
  if (cfg.aws.sesConfigurationSet) {
    payload.ConfigurationSetName = cfg.aws.sesConfigurationSet;
  }
  return payload;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS — 5 new tests, and the pre-existing `buildEmailPayload` From/Reply-To assertions still green.

- [ ] **Step 7: Use it in the campaign loop**

Add the import at the top of `backend/src/services/emailService.js`:

```js
import { buildUnsubscribeUrl, isSuppressed } from './unsubscribeService.js';
```

In `runCampaignBackground`, inside the per-prospect loop, immediately after the existing `channel === 'email' && !prospect.email` guard, add the suppression check:

```js
      if (channel === 'email' && await isSuppressed(db, campaign.user_id, prospect.email)) {
        // Skipped, not Failed: honouring an opt-out is a correct outcome, and
        // counting it as a failure would corrupt the campaign health metrics
        // the operator uses to spot genuinely broken tenants.
        await db.run(
          "UPDATE campaign_logs SET status = 'Skipped', error_message = 'Destinataire désinscrit' WHERE id = ?",
          prospect.log_id
        );
        continue;
      }
```

Then, in the `try` block that builds the message, compute the URL and thread it through:

```js
        const unsubscribeUrl = channel === 'email'
          ? buildUnsubscribeUrl(campaign.user_id, prospect.email)
          : null;

        const templateData = {
          company_name: prospect.name,
          website: prospect.website,
          phone: prospect.phone,
          city: prospect.city,
          sender_name: campaign.user_name || '',
          sender_phone: campaign.user_phone || '',
          sender_signature: campaign.user_signature || '',
          unsubscribe_link: unsubscribeUrl || ''
        };

        const subject = compileTemplate(campaign.subject, templateData);
        const compiledBody = compileTemplate(campaign.body, templateData);
        const body = channel === 'email'
          ? appendUnsubscribeNotice(compiledBody, unsubscribeUrl)
          : compiledBody;
```

and pass `unsubscribeUrl` into the `buildEmailPayload({ … })` call in the email branch.

- [ ] **Step 8: Render `Skipped` in the campaign log UI**

Found during plan review: `frontend/src/pages/Campaigns.jsx:990-1005` renders each log row as `Sent → Envoyé`, `Failed → Échec`, and **everything else → "En attente"** with a clock icon. A `Skipped` row would therefore display as pending forever, making a correctly-honoured opt-out look like a stuck campaign.

Add a branch before the final fallback:

```jsx
                        ) : log.status === 'Skipped' ? (
                          <span className="text-slate-500 flex items-center gap-1 font-semibold" title={log.error_message}>
                            <MinusCircle className="w-3.5 h-3.5" />
                            Ignoré
                          </span>
                        ) : (
```

Add `MinusCircle` to the existing `lucide-react` import at the top of the file.

Then confirm the linter is clean:

```bash
npm run lint --prefix frontend
```

Expected: no new errors for `Campaigns.jsx`.

- [ ] **Step 9: Run the full suite**

Run: `npm test --prefix backend`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/emailService.js backend/tests/emailService.test.js frontend/src/pages/Campaigns.jsx
git commit -m "feat(unsubscribe): add opt-out link, headers and suppression check to sends"
```

---

### Task 4: Spam complaints create a global suppression

**Files:**
- Modify: `backend/src/routes/sesWebhookRoutes.js`
- Modify: `backend/tests/sesWebhookSecurity.test.js`

**Interfaces:**
- Consumes: `recordUnsubscribe` (Task 1).
- Produces: no new exports; the existing `POST /api/ses/events` gains one side effect.

- [ ] **Step 1: Teach the existing fake DB about the new table**

⚠️ **Do this first or you will break passing tests.** `fakeDb.run` in `backend/tests/sesWebhookSecurity.test.js:69` ends with `throw new Error(\`fakeDb.run: unhandled query: ${sql}\`)`. The moment the complaint branch issues an `INSERT INTO unsubscribes`, every existing complaint test in that file throws, the handler swallows it into its `catch`, and the pause assertions fail for a reason that has nothing to do with pausing.

In `fakeDb`, add an `unsubscribes` collection alongside `events`, and a branch in `run` **before** the final `throw`:

```js
      if (/INSERT INTO unsubscribes/.test(sql)) {
        const [user_id, email, source] = params;
        unsubscribes.push({ user_id, email, source });
        return { lastID: unsubscribes.length, changes: 1 };
      }
```

Extend the factory signature to `function fakeDb({ users = [], events = [], unsubscribes = [] } = {})` and expose `unsubscribes` on the returned object next to `events` and `calls`.

- [ ] **Step 2: Write the failing test**

Append to `backend/tests/sesWebhookSecurity.test.js`, reusing the file's existing `TOKEN`, `fakeRes`, and notification-builder helpers. Build the complaint payload the same way the file's existing complaint tests do — read them rather than inventing a new shape:

```js
test('a complaint suppresses the recipient for every tenant', async () => {
  const db = fakeDb({ users: [{ id: 7, send_subdomain: '7.mail.witechagency.com' }] });
  const res = fakeRes();

  await handleSesEvent(
    { query: { token: TOKEN }, body: complaintNotification({ messageId: 'm-1', recipient: 'angry@exemple.fr' }) },
    res,
    { expectedToken: TOKEN, getDb: async () => db }
  );

  assert.equal(res.statusCode, 200);
  const row = db.unsubscribes.find((u) => u.email === 'angry@exemple.fr');
  assert.ok(row, 'complaint should create an unsubscribes row');
  assert.equal(row.user_id, null, 'suppression must be global, not scoped to the complaining tenant');
  assert.equal(row.source, 'complaint');
});
```

If the file has no `complaintNotification` helper, add one mirroring the existing `bounceNotification` but with `eventType: 'Complaint'` and a `complaint.complainedRecipients` array — check `extractDeliveryEvent` in `backend/src/routes/sesWebhookRoutes.js` for the exact field names it reads.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --prefix backend`
Expected: FAIL — no `INSERT INTO unsubscribes` is issued.

- [ ] **Step 4: Wire it in**

In `backend/src/routes/sesWebhookRoutes.js`, add the import:

```js
import { recordUnsubscribe } from '../services/unsubscribeService.js';
```

and extend the complaint branch:

```js
    if (event.eventType === 'Complaint') {
      // Global (user_id NULL): an address that files spam complaints threatens
      // the reputation of the shared sending infrastructure, so no tenant may
      // contact it again — not just the one that triggered this complaint.
      if (event.recipient) {
        await recordUnsubscribe(db, null, event.recipient, 'complaint');
      }
      await pauseIfComplaintRateExceeded(db, user.id);
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --prefix backend`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/sesWebhookRoutes.js backend/tests/sesWebhookSecurity.test.js
git commit -m "feat(unsubscribe): suppress complaining recipients platform-wide"
```

---

### Task 5: Runbook and the SES production-access answers

The point of the whole feature: the operator can now answer the AWS form truthfully. Write down what to say.

**Files:**
- Modify: `docs/platform-setup.md`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1-4. Every claim written here must be checked against the code, not against this plan.

- [ ] **Step 1: Document the new variables**

Add `PUBLIC_API_URL` and `UNSUBSCRIBE_SECRET` to the runbook's required-variables table, matching the format used for the existing entries. Note that `PUBLIC_API_URL` is the backend's own public URL (not the frontend's), and that rotating `UNSUBSCRIBE_SECRET` invalidates every unsubscribe link already sent.

- [ ] **Step 2: Write the SES production-access answer section**

Add a section (in French, matching the document) giving the operator ready-to-paste answers for the SES production access request, derived from what the code actually does. Read the code before writing each one:

- **How recipients opt out:** every message carries a `List-Unsubscribe` header, a `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header, and a visible unsubscribe URL in the plain-text body — appended automatically when a template omits it, so no message can go out without one. Opting out is immediate and permanent, and suppression is enforced before every send.
- **How bounces and complaints are handled:** SES event destination → SNS → the platform's authenticated webhook; every bounce and complaint is recorded per tenant; a complaining recipient is suppressed platform-wide; a tenant whose complaint rate exceeds the threshold over the rolling window is automatically paused. State the actual threshold, sample floor and window length by reading the constants in `backend/src/routes/sesWebhookRoutes.js` — do not copy numbers from memory.
- **How the list is built:** publicly listed business contact details collected from Google Maps and company websites, used for B2B prospecting under legitimate interest; no consumer addresses; no purchased lists.

Be accurate rather than flattering — if a claim is not true of the code, do not write it.

- [ ] **Step 3: Document the operator's view of suppressions**

Add a short subsection with the SQL an operator runs to inspect suppressions (per tenant and global), noting there is no UI for this yet.

- [ ] **Step 4: Verify the suite is untouched**

Run: `npm test --prefix backend`
Expected: PASS — this task changes only documentation.

- [ ] **Step 5: Commit**

```bash
git add docs/platform-setup.md
git commit -m "docs: document unsubscribe config and SES production-access answers"
```

---

## Verification

After every task, `npm test --prefix backend` passes and the test count has grown.

End-to-end verification of the unsubscribe link requires the backend deployed at a public `PUBLIC_API_URL`, since the link must be reachable from a recipient's mail client. Until then the routes are verifiable locally with `curl` against `localhost:3001`, and the link text is verifiable by inspecting a compiled body in a unit test. Do not report the feature as working end to end before a real campaign email has been received and its unsubscribe link followed successfully.
