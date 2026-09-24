import test from 'node:test';
import assert from 'node:assert/strict';
import { runEnrichmentBackground } from '../src/services/enrichmentService.js';

/**
 * Deux imports coup sur coup, c'est le comportement NORMAL : le programme de
 * prospection demande explicitement de tirer un metier puis un second pour
 * atteindre le volume voulu.
 *
 * Le verrou « un parcours a la fois » faisait un `return` muet sur le second.
 * Mesure sur le compte 7 : imports a 22h34, 22h36 et 22h38, et 106 prospects
 * des deux derniers lots jamais traites — bloques en 'To Enrich', sans site ni
 * adresse, pendant que l'application affichait « enrichissement lance ».
 */

function fakeDb(traites) {
  return {
    get: async (sql, id) => ({ id, name: `E${id}`, city: 'Annecy', website: 'x.fr', category: '25.62A' }),
    run: async (sql, ...p) => { if (/UPDATE leads/.test(sql)) traites.push(p[p.length - 2]); return {}; },
    all: async () => []
  };
}

const RESOLU = {
  resolved: true, website: 'https://x.fr', email: 'c@x.fr', resolved_by: 'generation',
  email_source: 'site_propre', site_state: 'A_JOUR', site_signals: '{}', suggested_template: 'T_X'
};

test('un import arrive pendant un parcours est traite, pas abandonne', async () => {
  const traites = [];
  const db = fakeDb(traites);
  // Enrichissement lent : le second appel tombe pendant le premier lot.
  const lent = async () => { await new Promise((r) => setTimeout(r, 30)); return RESOLU; };

  const premier = runEnrichmentBackground(9, [1, 2, 3], { db, enrichLead: lent });
  await new Promise((r) => setTimeout(r, 20));
  const second = await runEnrichmentBackground(9, [4, 5], { db, enrichLead: lent });

  // Le second appel rend la main tout de suite, en disant qu'il a differe.
  assert.equal(second.deferred, true);
  assert.equal(second.queued, 2);

  const bilan = await premier;
  // Les cinq sont traites par le parcours en cours, aucun laisse de cote.
  assert.deepEqual(traites.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.equal(bilan.total, 5);
});

test('sans concurrence, le comportement ne change pas', async () => {
  const traites = [];
  const db = fakeDb(traites);
  const bilan = await runEnrichmentBackground(10, [7, 8], { db, enrichLead: async () => RESOLU });
  assert.deepEqual(traites.sort((a, b) => a - b), [7, 8]);
  assert.equal(bilan.total, 2);
  assert.equal(bilan.resolved, 2);
  assert.equal(bilan.deferred, undefined);
});

test('le verrou est relache a la fin : un import suivant repart', async () => {
  const traites = [];
  const db = fakeDb(traites);
  await runEnrichmentBackground(11, [1], { db, enrichLead: async () => RESOLU });
  const apres = await runEnrichmentBackground(11, [2], { db, enrichLead: async () => RESOLU });
  // Sans liberation, ce second appel serait differe au lieu de s'executer.
  assert.equal(apres.deferred, undefined);
  assert.deepEqual(traites.sort((a, b) => a - b), [1, 2]);
});
