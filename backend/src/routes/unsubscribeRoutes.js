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

/**
 * Names the sender, because suppression is deliberately per-tenant.
 *
 * The same scraped business address commonly sits in several tenants' lead
 * tables and receives mail from several of our customers, and every opt-out
 * page is byte-identical on the same host. "de cet expéditeur" alone lets a
 * recipient confirm once, believe they are done, and keep receiving mail from
 * the other tenants — the exact reading a CNIL complaint would attack.
 *
 * Falls back to the generic wording when the tenant cannot be resolved (row
 * deleted, lookup failed). A vaguer page is far better than a 500 on the only
 * route a recipient has to opt out.
 */
function senderPhrase(senderName) {
  return senderName ? `<strong>${escapeHtml(senderName)}</strong>` : 'cet expéditeur';
}

export function renderConfirmPage(email, senderName) {
  return page('Se désinscrire', `
    <h1>Se désinscrire</h1>
    <p>Vous ne recevrez plus de messages de prospection de ${senderPhrase(senderName)} à l'adresse
       <strong>${escapeHtml(email)}</strong>.</p>
    <p>Cette désinscription ne concerne que cet expéditeur. Si vous recevez des messages
       d'autres expéditeurs, vous devrez utiliser le lien de désinscription présent dans
       chacun de leurs e-mails.</p>
    <form method="POST">
      <button type="submit">Confirmer la désinscription</button>
    </form>
  `);
}

export function renderDonePage(email, senderName) {
  return page('Désinscription confirmée', `
    <h1>C'est fait</h1>
    <p>L'adresse <strong>${escapeHtml(email)}</strong> a été désinscrite. Vous ne recevrez
       plus de messages de ${senderPhrase(senderName)}.</p>
    <p>Cette désinscription ne concerne que cet expéditeur : les messages d'autres
       expéditeurs, s'il y en a, disposent chacun de leur propre lien de désinscription.</p>
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

function renderFailurePage() {
  return page('Erreur', `
    <h1>Une erreur est survenue</h1>
    <p>Votre désinscription n'a pas pu être enregistrée. Merci de réessayer dans quelques
       instants.</p>
  `);
}

/**
 * Best-effort display name for the tenant that sent the message.
 *
 * Never throws and never blocks the opt-out: a deleted tenant, a failed query
 * or a row with neither name simply yields null, and the page falls back to
 * the generic wording.
 */
async function resolveSenderName(deps, userId) {
  try {
    const db = deps.db ?? await getDb();
    const row = await db.get('SELECT company_name, name FROM users WHERE id = ?', userId);
    if (!row) return null;
    return row.company_name || row.name || null;
  } catch (error) {
    console.error('Unsubscribe: could not resolve sender name:', error.message);
    return null;
  }
}

export async function handleUnsubscribeGet(req, res, deps = {}) {
  // Everything, including token verification, sits inside the try. This route
  // is public and unauthenticated: verifyUnsubscribeToken reaches
  // getPlatformConfig, which throws outright on incomplete platform config,
  // and an escaping rejection takes the Node 20 process down.
  try {
    const claim = verifyUnsubscribeToken(req.params.token);
    if (!claim) return sendHtml(res, 400, renderErrorPage());
    const senderName = await resolveSenderName(deps, claim.userId);
    return sendHtml(res, 200, renderConfirmPage(claim.email, senderName));
  } catch (error) {
    console.error('Unsubscribe: GET failed:', error.message);
    return sendHtml(res, 500, renderFailurePage());
  }
}

export async function handleUnsubscribePost(req, res, deps = {}) {
  try {
    const claim = verifyUnsubscribeToken(req.params.token);
    if (!claim) return sendHtml(res, 400, renderErrorPage());

    const db = deps.db ?? await getDb();
    await recordUnsubscribe(db, claim.userId, claim.email, 'manual');
    // Resolved after the write: naming the sender is presentation, and it must
    // never be able to turn a recorded opt-out into an error page.
    const senderName = await resolveSenderName({ db }, claim.userId);
    return sendHtml(res, 200, renderDonePage(claim.email, senderName));
  } catch (error) {
    console.error('Unsubscribe: failed to record opt-out:', error.message);
    return sendHtml(res, 500, renderFailurePage());
  }
}

// The handlers above already swallow everything, but the express wrappers get
// a .catch too: express 4 does not await an async handler, so a rejection that
// somehow got past them would be unhandled rather than a 500.
function guard(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Unsubscribe: unhandled route error:', error?.message);
      if (!res.headersSent) sendHtml(res, 500, renderFailurePage());
    });
  };
}

router.get('/:token', guard((req, res) => handleUnsubscribeGet(req, res)));
router.post('/:token', guard((req, res) => handleUnsubscribePost(req, res)));

export default router;
