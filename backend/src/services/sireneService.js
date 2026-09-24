import axios from 'axios';

/* Client for the French government's open company register.
 *
 * Free, no API key, no account: it is the public front of INSEE's SIRENE
 * register. It answers "who is registered in this trade, at this size, in this
 * département" — the question Google Maps cannot answer, and the reason this
 * source exists alongside the scraper.
 *
 * What it never returns: email, phone, website. Not "sometimes missing" —
 * the fields do not exist in the register. Everything contact-shaped has to
 * come from the enrichment pass.
 */

const API = 'https://recherche-entreprises.api.gouv.fr/search';

/* The API caps every query at 10 000 results and stops paginating past roughly
 * page 400, without saying so: a broad query reports total_results: 10000 and
 * looks like a complete answer. Targeted queries (one NAF code, one
 * département) land in the hundreds, far below the ceiling — so the guard here
 * is only to stop a careless caller from believing a truncated count. */
const PER_PAGE = 25;
const MAX_PAGES = 40;
export const RESULT_CEILING = 10000;

/* INSEE employee bands. The register stores the code, not a headcount. */
export const TRANCHES = {
  NN: 'non renseigné', '00': '0 salarié', '01': '1-2', '02': '3-5', '03': '6-9',
  11: '10-19', 12: '20-49', 21: '50-99', 22: '100-199', 31: '200-249',
  32: '250-499', 41: '500-999', 42: '1000-1999', 51: '2000-4999',
  52: '5000-9999', 53: '10000+'
};

/* The size band that matters for this product: 10 to 199 employees.
 *
 * Below 10 the prospect behaves like the artisans that returned 0 replies on
 * 84 sends — no office, no budget line, mail read on a phone. Above 200 the
 * buying decision leaves the site and a website is already somebody's job. */
export const DEFAULT_TRANCHES = '11,12,21,22';

/* Trades worth prospecting, with the NAF code the register indexes them by.
 * Nobody knows NAF codes, so the UI shows the label and sends the code. This
 * is deliberately short: the full nomenclature has over 700 entries and would
 * turn a product feature back into an expert form. */
export const TRADES = [
  { label: 'Décolletage', naf: '25.62A', keywords: ['decolletage', 'usinage'] },
  { label: 'Mécanique industrielle / usinage', naf: '25.62B', keywords: ['usinage', 'mecanique'] },
  { label: 'Plasturgie (injection)', naf: '22.29A', keywords: ['plasturgie', 'plastique'] },
  { label: 'Plasturgie (autres pièces)', naf: '22.29B', keywords: ['plasturgie', 'plastique'] },
  { label: 'Métallurgie / tôlerie', naf: '25.11Z', keywords: ['metallerie', 'chaudronnerie'] },
  { label: 'Expertise comptable', naf: '69.20Z', keywords: ['comptable', 'expertise'] },
  { label: 'Avocats', naf: '69.10Z', keywords: ['avocat', 'avocats'] },
  { label: "Bureaux d'études techniques", naf: '71.12B', keywords: ['ingenierie', 'etudes'] },
  { label: 'Architectes', naf: '71.11Z', keywords: ['architecte', 'architecture'] }
];

export function tradeByNaf(naf) {
  return TRADES.find((t) => t.naf === naf) || null;
}

/* A director's name, when the register carries a natural person.
 *
 * Holdings appear here too — EUCRON, BLANC & NEVEUX — and those are the rows
 * that reveal a corporate group. Keeping the raw value rather than discarding
 * non-persons is what lets the group detection work at all. */
function principalDirigeant(dirigeants) {
  const list = Array.isArray(dirigeants) ? dirigeants : [];
  const person = list.find((d) => d.type_dirigeant === 'personne physique');
  if (person) {
    const name = [person.prenoms, person.nom].filter(Boolean).join(' ').trim();
    if (name) return { name, isCompany: false };
  }
  const company = list.find((d) => d.denomination);
  if (company) return { name: company.denomination, isCompany: true };
  return { name: '', isCompany: false };
}

/* Un code postal appartient-il au departement demande ?
 *
 * Trois cas, et les deux derniers cassent un `startsWith` naif :
 *   - metropole : '74' correspond au prefixe '74'
 *   - outre-mer : '974' tient sur trois chiffres, pas deux
 *   - Corse     : '2A' et '2B' partagent tous deux le prefixe postal '20',
 *                 donc le code postal ne permet PAS de les distinguer. On
 *                 accepte les deux plutot que de rejeter la Corse entiere :
 *                 l'etablissement local reste meilleur que le siege.
 */
export function inDepartement(codePostal, dep) {
  const cp = String(codePostal || '');
  const d = String(dep || '').toUpperCase();
  if (!cp || !d) return false;
  if (/^9[78]\d$/.test(d)) return cp.startsWith(d);
  if (d === '2A' || d === '2B') return cp.startsWith('20');
  return cp.startsWith(d.padStart(2, '0'));
}

/* L'etablissement a retenir pour ce prospect.
 *
 * Le filtre `departement` de l'API porte sur les ETABLISSEMENTS, pas sur le
 * siege : une recherche « experts-comptables de Haute-Savoie » remonte
 * IN EXTENSO DAUPHINE SAVOIE, dont le siege est a La Tronche (38) et dont
 * deux agences sont a Marnaz et Epagny. Prendre le siege donnerait « La
 * Tronche » — la mauvaise ville dans le mail, et la mauvaise commune pour la
 * verification de domaine de l'enrichissement, qui cherche precisement la
 * commune sur le site.
 *
 * Mesure sur 380 entreprises reelles : 0 % d'ecart sur le decolletage du 74
 * (PME mono-site), mais 29 % sur les experts-comptables du meme departement.
 * L'API expose deja l'adresse locale dans `matching_etablissements`.
 */
function etablissementRetenu(row, filtre = {}) {
  const siege = row.siege || {};
  const matches = Array.isArray(row.matching_etablissements) ? row.matching_etablissements : [];
  if (!matches.length) return siege;

  if (filtre.commune) {
    const exact = matches.find((e) => String(e.code_postal || '') === String(filtre.commune));
    if (exact) return exact;
  }
  if (filtre.departement) {
    // Le siege convient deja s'il est dans le departement vise.
    if (inDepartement(siege.code_postal, filtre.departement)) return siege;
    const local = matches.find((e) => inDepartement(e.code_postal, filtre.departement));
    if (local) return local;
  }
  return siege;
}

function normalise(row, filtre = {}) {
  const siege = row.siege || {};
  const lieu = etablissementRetenu(row, filtre);
  const boss = principalDirigeant(row.dirigeants);
  return {
    siren: row.siren,
    name: row.nom_complet || row.nom_raison_sociale || '',
    naf: row.activite_principale || siege.activite_principale || '',
    city: lieu.libelle_commune || '',
    postal_code: lieu.code_postal || '',
    address: lieu.adresse || '',
    /* Le nombre d'etablissements ouverts. Un reseau national a 12 agences
     * n'est pas le meme prospect qu'un atelier de 20 personnes, et rien
     * d'autre dans la fiche ne le dit. */
    etablissements: row.nombre_etablissements_ouverts || 1,
    /* Vrai quand l'adresse retenue n'est pas celle du siege : le prospect est
     * une agence locale d'une entreprise pilotee ailleurs. */
    site_local: lieu !== siege,
    effectif_code: row.tranche_effectif_salarie || 'NN',
    effectif: TRANCHES[row.tranche_effectif_salarie] || 'non renseigné',
    dirigeant: boss.name,
    /* The group key. Two prospects sharing it share a buying decision, so a
     * campaign must not mail both with the same pitch. */
    group_key: boss.isCompany ? boss.name : ''
  };
}

async function page(params, pageNo) {
  const { data } = await axios.get(API, {
    params: { ...params, page: pageNo, per_page: PER_PAGE },
    timeout: 20000,
    headers: { 'User-Agent': 'WitechLead/1.0 (prospection B2B)' }
  });
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Searches the register. Returns normalised, campaign-shaped rows.
 *
 * `etat_administratif: 'A'` is not optional: on the first real pull, 7 of 115
 * décolletage companies were already struck off. Mailing a dead company is a
 * bounce, and bounces are what pause the sending domain.
 */
export async function searchCompanies({
  naf, departement, commune, tranches = DEFAULT_TRANCHES, limit = 200
} = {}) {
  if (!naf) throw new Error('Un code NAF est requis.');
  if (!departement && !commune) {
    throw new Error('Un département ou une commune est requis : sans filtre géographique la requête est tronquée à 10 000 résultats sans le dire.');
  }

  const params = { activite_principale: naf, etat_administratif: 'A' };
  if (departement) params.departement = departement;
  if (commune) params.code_postal = commune;
  if (tranches) params.tranche_effectif_salarie = tranches;

  const first = await page(params, 1);
  const total = first.total_results ?? 0;
  const pages = Math.min(first.total_pages ?? 1, MAX_PAGES, Math.ceil(limit / PER_PAGE));

  const seen = new Set();
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const data = p === 1 ? first : await page(params, p);
    for (const row of data.results || []) {
      if (!row.siren || seen.has(row.siren)) continue;
      seen.add(row.siren);
      out.push(normalise(row, { departement, commune }));
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
    if (p < pages) await sleep(250); // the API is free; do not hammer it
  }

  return {
    total,
    truncated: total >= RESULT_CEILING,
    returned: out.length,
    companies: out
  };
}
