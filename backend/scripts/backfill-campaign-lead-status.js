/* Repairs prospects the campaign runner failed to move.
 *
 * Until the fix in emailService.js, the success path ran
 *   UPDATE leads SET status = 'Contacted' WHERE id = prospect.lead_id
 * and the prospect row — "SELECT l.*, cl.id AS log_id" — has no lead_id
 * column. Every one of those updates matched zero rows, so delivered emails
 * left their prospect sitting on "New". The same run never routed the
 * unreachable ones either.
 *
 * This applies the corrected rules to history:
 *   a delivered send            -> Contacted
 *   no email but a phone number -> Call Only
 *   neither email nor phone     -> Closed Lost
 *
 * It only ever moves a prospect out of 'New' or 'Call Only'. A prospect the
 * salesperson has since advanced by hand is left exactly where it is —
 * their progress outranks a repair script.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node backend/scripts/backfill-campaign-lead-status.js
 *   node backend/scripts/backfill-campaign-lead-status.js --apply
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getDb } from '../src/database/db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '../../.env') });

const APPLY = process.argv.includes('--apply');
const MOVABLE = "('New', 'Call Only')";

const GROUPS = [
  {
    label: 'envoi réussi           -> Contacted',
    next: 'Contacted',
    where: `cl.status = 'Sent'`
  },
  {
    label: 'sans e-mail, avec tél. -> Call Only',
    next: 'Call Only',
    where: `cl.status = 'Failed' AND COALESCE(l.email, '') = '' AND COALESCE(l.phone, '') <> ''`
  },
  {
    label: 'ni e-mail ni téléphone -> Closed Lost',
    next: 'Closed Lost',
    where: `cl.status = 'Failed' AND COALESCE(l.email, '') = '' AND COALESCE(l.phone, '') = ''`
  }
];

async function main() {
  const db = await getDb();
  console.log(APPLY ? 'MODE ÉCRITURE\n' : 'SIMULATION — rien ne sera modifié. Ajoutez --apply pour écrire.\n');

  let total = 0;
  for (const g of GROUPS) {
    const rows = await db.all(
      `SELECT DISTINCT l.id
         FROM campaign_logs cl
         JOIN leads l ON l.id = cl.lead_id
        WHERE ${g.where}
          AND l.status IN ${MOVABLE}
          AND l.status <> '${g.next}'`
    );
    console.log(`${g.label} : ${rows.length} prospect(s)`);
    total += rows.length;

    if (APPLY && rows.length) {
      for (const { id } of rows) {
        await db.run('UPDATE leads SET status = ? WHERE id = ?', g.next, id);
      }
    }
  }

  console.log(`\n${total} prospect(s) ${APPLY ? 'corrigé(s)' : 'seraient corrigés'}.`);
  if (!APPLY && total) console.log('Relancez avec --apply pour appliquer.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Échec du backfill :', err.message);
  process.exit(1);
});
