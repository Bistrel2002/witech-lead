import test from 'node:test';
import assert from 'node:assert/strict';
import { runEnrichmentBackground } from '../src/services/enrichmentService.js';

/**
 * L'enrichissement tourne sur deux populations tres differentes : des
 * prospects fraichement importes, qui n'ont rien, et une base existante ou
 * l'utilisateur a deja travaille — appele, qualifie, gagne.
 *
 * Ecrire sans distinction ramenerait le second cas a zero. Ces tests tiennent
 * cette frontiere, parce qu'une perte de pipeline ne se voit qu'apres coup et
 * ne se rattrape pas.
 */

function fakeDb(lead) {
  const writes = [];
  return {
    writes,
    get: async () => lead,
    run: async (sql, ...params) => { writes.push({ sql, params }); return {}; },
    all: async () => []
  };
}

const RESOLU = {
  resolved: true,
  website: 'https://exemple.fr',
  email: 'contact@exemple.fr',
  resolved_by: 'generation',
  email_source: 'site_propre',
  site_state: 'ANCIEN',
  site_signals: '{"signals":["php_obsolete"]}',
  suggested_template: 'T_SECURITE_PHP'
};

test('un prospect deja dans le pipeline ne repasse jamais en New', async () => {
  const db = fakeDb({ id: 7, name: 'ACME', city: 'Annecy', website: 'acme.fr', category: '25.62A' });
  await runEnrichmentBackground(1, [7], { db, enrichLead: async () => RESOLU });

  const write = db.writes.find((w) => /UPDATE leads/.test(w.sql));
  assert.ok(write, 'un prospect resolu doit etre ecrit');

  // Le statut n'avance que depuis l'etat transitoire de l'import.
  assert.match(write.sql, /status = CASE WHEN status = 'To Enrich' THEN 'New' ELSE status END/);
  // Et surtout : aucune affectation inconditionnelle du statut.
  assert.doesNotMatch(write.sql, /SET[^]*\bstatus = 'New'(?!\s*ELSE)/);
});

test('une adresse et un site deja renseignes ne sont pas ecrases', async () => {
  const db = fakeDb({ id: 8, name: 'ACME', city: 'Annecy', website: 'acme.fr', category: '25.62A' });
  await runEnrichmentBackground(1, [8], { db, enrichLead: async () => RESOLU });

  const write = db.writes.find((w) => /UPDATE leads/.test(w.sql));
  assert.match(write.sql, /website = COALESCE\(NULLIF\(website, ''\), \?\)/);
  assert.match(write.sql, /email = COALESCE\(NULLIF\(email, ''\), \?\)/);
});

test('les signaux, eux, sont toujours rafraichis', async () => {
  const db = fakeDb({ id: 9, name: 'ACME', city: 'Annecy', website: 'acme.fr', category: '25.62A' });
  await runEnrichmentBackground(1, [9], { db, enrichLead: async () => RESOLU });

  const write = db.writes.find((w) => /UPDATE leads/.test(w.sql));
  // C'est le seul but du rattrapage : sans ecrasement des signaux, les
  // segments resteraient vides.
  assert.match(write.sql, /site_signals = \?/);
  assert.ok(write.params.includes(RESOLU.site_signals));
});

test('un prospect non resolu ne quitte que To Enrich', async () => {
  const db = fakeDb({ id: 10, name: 'ACME', city: 'Annecy', website: null, category: '25.62A' });
  await runEnrichmentBackground(1, [10], {
    db, enrichLead: async () => ({ resolved: false, resolved_by: 'aucun' })
  });

  const write = db.writes.find((w) => /UPDATE leads/.test(w.sql));
  // Sans cette clause, un prospect gagne dont le site tombe passerait
  // en 'Unresolved' et disparaitrait de l'ecran.
  assert.match(write.sql, /AND status = 'To Enrich'/);
});
