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
