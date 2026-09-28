import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runEnrichmentBackground, enrichmentProgress, acknowledgeProgress
} from '../src/services/enrichmentService.js';

/**
 * Un enrichissement de 200 prospects dure environ une heure. Sans compteur,
 * l'ecran montre une colonne immobile, et rien ne distingue « ca travaille »
 * de « c'est casse » — la question posee apres deux heures d'attente.
 */

const db = {
  get: async (sql, id) => ({ id, name: `E${id}`, city: 'Annecy', website: 'x.fr', category: '25.62A' }),
  run: async () => ({}),
  all: async () => []
};
const RESOLU = {
  resolved: true, website: 'https://x.fr', email: 'c@x.fr', resolved_by: 'generation',
  email_source: 'site_propre', site_state: 'A_JOUR', site_signals: '{}', suggested_template: 'T_X'
};

test('la progression monte pendant le parcours, puis se fige a la fin', async () => {
  const vus = [];
  const lent = async () => {
    vus.push(enrichmentProgress(40)?.done ?? -1);
    await new Promise((r) => setTimeout(r, 15));
    return RESOLU;
  };
  await runEnrichmentBackground(40, [1, 2, 3, 4], { db, enrichLead: lent });

  // Observé AVANT chaque prospect : 0, 1, 2, 3 — donc le compteur avance bien
  // au fil de l'eau et ne saute pas de 0 a 4 a la fin.
  assert.deepEqual(vus, [0, 1, 2, 3]);

  const fin = enrichmentProgress(40);
  assert.equal(fin.done, 4);
  assert.equal(fin.total, 4);
  assert.equal(fin.resolved, 4);
  assert.ok(fin.finishedAt, 'la fin doit etre horodatee pour declencher la notification');
  acknowledgeProgress(40);
});

test('un lot mis en file augmente le total, pas seulement le restant', async () => {
  const lent = async () => { await new Promise((r) => setTimeout(r, 25)); return RESOLU; };
  const premier = runEnrichmentBackground(41, [1, 2, 3], { db, enrichLead: lent });
  await new Promise((r) => setTimeout(r, 20));
  await runEnrichmentBackground(41, [4, 5], { db, enrichLead: lent });

  // Sans cette mise a jour, la barre afficherait 100 % puis repartirait en
  // arriere quand la file est reprise.
  assert.equal(enrichmentProgress(41).total, 5);
  await premier;
  assert.equal(enrichmentProgress(41).done, 5);
  acknowledgeProgress(41);
});

test("l'acquittement efface un bilan termine, jamais un parcours en cours", async () => {
  await runEnrichmentBackground(42, [1], { db, enrichLead: async () => RESOLU });
  assert.ok(enrichmentProgress(42), 'le bilan survit au parcours pour etre annonce');
  assert.equal(acknowledgeProgress(42), true);
  // Sans effacement, la notification de fin reapparaitrait a chaque
  // rechargement de page.
  assert.equal(enrichmentProgress(42), null);
});

test('un compte sans parcours ne renvoie rien', () => {
  assert.equal(enrichmentProgress(9999), null);
  assert.equal(acknowledgeProgress(9999), false);
});

/* --- Le compte de « en attente » --------------------------------------- */

import { countPending } from '../src/services/segments.js';

test('un prospect deja analyse puis ecarte ne compte plus comme en attente', async () => {
  const lignes = [
    { id: 1, status: 'To Enrich',  resolved_by: null,         siren: '111' }, // en attente
    { id: 2, status: 'To Enrich',  resolved_by: null,         siren: '222' }, // en attente
    { id: 3, status: 'Unresolved', resolved_by: 'aucun',      siren: '333' }, // analyse, ecarte
    { id: 4, status: 'New',        resolved_by: 'generation', siren: '444' }  // analyse, resolu
  ];
  const faux = {
    get: async (sql, userId) => {
      assert.match(sql, /resolved_by IS NULL/,
        'le filtre doit porter sur « jamais analyse », pas sur l\'absence de signaux');
      return { n: lignes.filter((l) => l.resolved_by === null).length };
    }
  };
  // Mesure sur un compte reel : 106 reellement en attente, mais 166 comptes
  // tant que les 60 ecartes revenaient dans le lot. La banniere ne serait
  // jamais tombee a zero.
  assert.equal(await countPending(faux, 7), 2);
});
