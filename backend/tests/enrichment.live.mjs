/* Test en conditions reelles (reseau) du pipeline d'enrichissement.
 *
 * Volontairement hors de `npm test` : il sort sur internet et prend des
 * minutes. A lancer a la main :  node tests/enrichment.live.mjs
 */
import { enrichLead, candidateDomains } from '../src/services/enrichmentService.js';

// verite terrain etablie a la main sur 20 entreprises reelles
const TRUTH = [
  { name: 'AMD DISTRIBUTION', city: 'AMANCY', naf: '25.62A', domain: 'amd-distribution.com', email: 'amdd@wanadoo.fr' },
  { name: 'DECOREC', city: 'AMANCY', naf: '25.62A', domain: 'decorec.com', email: 'decorec@decorec.com' },
  { name: 'DRAULT DECOLLETAGE', city: 'AYSE', naf: '25.62A', domain: 'drault-decolletage.com', email: 'contacts@drault-decolletage.com' },
  { name: 'ETS GUILLERMIN GEORGES', city: 'AYSE', naf: '25.62A', domain: 'guillermindecolletage.com', email: 'info@guillermindecolletage.com' },
  { name: 'SOCIETE DE TOURNAGE AUTOMATIQUE BONNEVILLOIS (STAB)', city: 'AYSE', naf: '25.62A', domain: 'stab.fr', email: 'n.giraud@stab.fr' },
  { name: 'SOCIETE HENRI BOURGEAUX ET FILS', city: 'AYSE', naf: '25.62A', domain: 'bourgeauxfils.com', email: 'info@bourgeauxfils.com' },
  { name: 'ETS BEROD-COLLET', city: 'BONNEVILLE', naf: '25.62A', domain: 'berod-collet.fr', email: 'contact@berod-collet.fr' },
  { name: 'SARL M.D.G.', city: 'BONNEVILLE', naf: '25.62A', domain: 'mdg-sarl.com', email: 'contact@mdg-sarl.com' },
  { name: 'SOCIETE DES ETABLISSEMENTS CHAMOT', city: 'BONNEVILLE', naf: '25.62A', domain: 'chamot.fr', email: 'info@chamot.fr' },
  { name: 'ETABLISSEMENTS RAYMOND DUBOSSON', city: 'CLUSES', naf: '25.62A', domain: 'dubosson.com', email: 'dubosson@dubosson.com' },
  { name: 'COMEHOR', city: 'CLUSES', naf: '25.62A', domain: 'comehor.com', email: 'info@comehor.com' },
  { name: 'IVALTECH', city: 'CLUSES', naf: '25.62A', domain: 'ivaltech.fr', email: 'info@ivaltech.fr' },
  { name: 'BA USINAGE', city: 'CLUSES', naf: '25.62A', domain: 'usinage.com', email: 'info@usinage.com' },
];

const pad = (s, n) => String(s).slice(0, n).padEnd(n);
let okDomain = 0, wrongDomain = 0, okEmail = 0, dropped = 0;

console.log(pad('ENTREPRISE', 34), pad('DOMAINE TROUVE', 28), pad('ATTENDU', 26), 'E-MAIL');
console.log('-'.repeat(120));

for (const t of TRUTH) {
  let r;
  try {
    r = await enrichLead({ name: t.name, city: t.city, naf: t.naf, website: null });
  } catch (e) {
    console.log(pad(t.name, 34), 'ERREUR:', e.message);
    continue;
  }
  const got = r.website ? r.website.replace(/^https?:\/\//, '') : '';
  const match = got === t.domain;
  if (!got) { dropped++; }
  else if (match) { okDomain++; }
  else { wrongDomain++; }
  if (r.email) okEmail++;
  const flag = !got ? 'ECARTE' : match ? 'ok' : 'FAUX <<<';
  console.log(pad(t.name, 34), pad(got || '—', 28), pad(t.domain, 26), pad(r.email || '—', 30), flag);
}

console.log('-'.repeat(120));
console.log(`domaines corrects : ${okDomain}/${TRUTH.length}`);
console.log(`domaines FAUX     : ${wrongDomain}   <-- doit rester a 0`);
console.log(`ecartes (propre)  : ${dropped}`);
console.log(`e-mails obtenus   : ${okEmail}/${TRUTH.length}`);
console.log(`\nRENDEMENT DE BOUT EN BOUT : ${Math.round((okEmail / TRUTH.length) * 100)}%`);
