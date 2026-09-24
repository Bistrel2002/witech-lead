import axios from 'axios';
import https from 'node:https';
import dns from 'node:dns/promises';
import { getDb } from '../database/db.js';
import { tradeByNaf } from './sireneService.js';

/* Turns a register row — legal name, commune, no contact at all — into a
 * prospect a campaign can mail. Fully automatic: what does not resolve is
 * dropped, never queued as a form for someone to fill in.
 *
 * Every rule in this file comes from a measurement on 20 real Arve-valley
 * machining companies, not from a guess. The numbers are quoted where they
 * decided the rule.
 */

const UA = 'WitechLead/1.0 (prospection B2B)';
const FETCH_TIMEOUT = 9000;
const POLITE_DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LEGAL_FORMS = /\b(SARL|SASU|SAS|SA|EURL|SCI|SNC|SCOP|ETS|ETABLISSEMENTS?|SOCIETE|STE|GROUPE)\b/g;
const WEAK_WORDS = new Set(['DES', 'DE', 'DU', 'LA', 'LE', 'LES', 'ET', 'FILS', 'AND']);

export function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function words(raison) {
  return stripAccents(raison).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/* Distinctive tokens of a company name, used by the verification rule.
 *
 * Legal forms and articles are dropped because they match every site in
 * France. Initials are re-joined (M.D.G. -> MDG) because that is how such a
 * company writes itself on its own site — without it, mdg-sarl.com was
 * rejected as "commune only". */
export function nameTokens(raison) {
  const all = words(raison).filter((w) => !WEAK_WORDS.has(w) && !/^(SARL|SAS|SA|ETS|ETABLISSEMENTS?|SOCIETE|STE|EURL|GROUPE)$/.test(w));
  const long = all.filter((w) => w.length >= 4);
  const short = all.filter((w) => w.length < 4);
  if (short.length >= 2) long.push(short.join(''));
  return long;
}

/**
 * Candidate domains derived from the legal name.
 *
 * Measured 14/20 on real companies. The five shapes below are each there
 * because one of the six misses needed it: the LAST word (DUBOSSON in
 * "ETABLISSEMENTS RAYMOND DUBOSSON"), the parenthetical acronym (STAB), the
 * `-france` suffix (bedouet-france.com), joined initials (mdg-sarl.com), and
 * the trade keyword (guillermindecolletage.com).
 */
export function candidateDomains(raison, naf) {
  const upper = stripAccents(raison).toUpperCase();
  const acronyms = [...upper.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].replace(/[^A-Z0-9]/g, ''));
  const cleanedAll = words(upper.replace(/\([^)]*\)/g, ' '));
  const cleaned = words(upper.replace(/\([^)]*\)/g, ' ').replace(LEGAL_FORMS, ' '))
    .filter((w) => w.length > 1 && !WEAK_WORDS.has(w));

  const bases = new Set();
  for (const group of [cleaned, cleanedAll]) {
    if (!group.length) continue;
    bases.add(group.join(''));
    bases.add(group.join('-'));
    bases.add(group[0]);
    bases.add(group[group.length - 1]);      // DUBOSSON
    if (group.length > 1) {
      bases.add(group.slice(0, 2).join(''));
      bases.add(group.slice(0, 2).join('-'));
    }
  }
  for (const a of acronyms) if (a.length >= 2) bases.add(a);   // STAB
  const shorts = cleanedAll.filter((w) => w.length <= 2);
  if (shorts.length >= 2) bases.add(shorts.join(''));          // M D G -> MDG

  /* "ET FILS" fait partie du nom d'usage, pas du bruit juridique.
   *
   * Mesuré : SOCIETE HENRI BOURGEAUX ET FILS a pour domaine bourgeauxfils.com.
   * WEAK_WORDS supprimait FILS, donc cette base n'était jamais générée et
   * l'entreprise partait en "non résolu". On garde donc les variantes qui
   * recollent le dernier mot significatif avec FILS. */
  const withFils = cleanedAll.filter((w) => !/^(SARL|SAS|SA|ETS|ETABLISSEMENTS?|SOCIETE|STE|EURL|DE|DU|DES|LA|LE|ET)$/.test(w));
  if (withFils.length >= 2) {
    bases.add(withFils.join(''));
    bases.add(withFils.join('-'));
    bases.add(withFils.slice(-2).join(''));                    // BOURGEAUX + FILS
    bases.add(withFils.slice(-2).join('-'));
  }

  /* The trade word. The NAF code is always known — it is what pulled the list
   * — so "GUILLERMIN" can become "guillermindecolletage". */
  const trade = tradeByNaf(naf);
  if (trade && cleaned.length) {
    for (const kw of trade.keywords) {
      bases.add(cleaned[0].toLowerCase() + kw);
      bases.add(cleaned[0].toLowerCase() + '-' + kw);
    }
  }

  const out = [];
  for (const raw of bases) {
    const b = String(raw).toLowerCase().replace(/^-+|-+$/g, '');
    if (b.length < 3) continue;
    for (const tld of ['.fr', '.com']) {
      out.push(b + tld);
      out.push(b + '-sarl' + tld);
      out.push(b + '-france' + tld);
    }
  }
  return [...new Set(out)];
}

export async function domainResolves(domain) {
  try {
    await dns.lookup(domain);
    return true;
  } catch {
    return false;
  }
}

const laxAgent = new https.Agent({ rejectUnauthorized: false });

/* Les deux seules erreurs TLS que l'on repasse en lecture permissive.
 *
 * ALTNAME : le certificat est valide et signé par une vraie autorite, mais
 * emis au nom du serveur mutualise. Mesure sur dubosson.com :
 *   ERR_TLS_CERT_ALTNAME_INVALID — cert's altnames: DNS:cluster120.hosting.ovh.net
 * C'est un detail d'hebergement OVH, pas une interception.
 *
 * EXPIRED : le certificat a bien ete emis pour CE domaine par une autorite,
 * il a seulement expire. Et un certificat perime est lui-meme un signal de
 * vente — un site laisse a l'abandon.
 *
 * Tout le reste (auto-signe, chaine invérifiable, autorite inconnue) est
 * REFUSE : ce sont exactement les signatures d'une interception. Un attaquant
 * sur le chemin injecterait une fausse adresse e-mail dans la page, et cette
 * adresse partirait ensuite en campagne au nom de Wi'Tech. Le prospect retombe
 * alors dans l'etat terminal « Unresolved », comme tout hote injoignable.
 */
const TLS_TOLERABLE = /ERR_TLS_CERT_ALTNAME_INVALID|altnames|CERT_HAS_EXPIRED/i;
const TLS_HOSTILE = /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|DEPTH_ZERO/i;

/**
 * Fetches a public page.
 *
 * Strict TLS first. Only a name-mismatch or an expired certificate falls back
 * to a permissive read, and the fallback says so in `tlsInvalid`. Everything
 * the fallback reads is treated as data, never as instruction, and nothing is
 * ever posted to these sites.
 */
export async function fetchPage(url) {
  const opts = {
    timeout: FETCH_TIMEOUT,
    maxRedirects: 4,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en' }
  };
  const shape = (res, tlsInvalid) => ({
    html: String(res.data || ''),
    finalUrl: res.request?.res?.responseUrl || url,
    /* Les en-têtes portent la version de PHP et du serveur. C'est le signal
     * d'ancienneté le plus vendable — un argument de sécurité daté, pas une
     * question de goût — et il arrive gratuitement avec la réponse. */
    headers: res.headers || {},
    tlsInvalid
  });
  try {
    return shape(await axios.get(url, opts), false);
  } catch (err) {
    const sig = `${err.code || ''} ${err.message || ''}`;
    if (TLS_HOSTILE.test(sig) || !TLS_TOLERABLE.test(sig)) return null;
    try {
      return shape(await axios.get(url, { ...opts, httpsAgent: laxAgent }), true);
    } catch {
      return null;
    }
  }
}

/**
 * Does this domain belong to this company?
 *
 * The rule is: the commune appears, OR at least two distinct name tokens do.
 * One token is never enough, and that is the whole safety of the pipeline.
 * Measured on the real sample: DNS alone gave 5 false positives, a single
 * token gave 5 more — societe.com accepted as SOCIETE HENRI BOURGEAUX ET FILS,
 * raymond.fr as ETABLISSEMENTS RAYMOND DUBOSSON, because "HENRI" and "RAYMOND"
 * are ordinary first names present on any site. Commune-or-two-tokens scored
 * 8 correct, 0 false positives, 0 missed.
 *
 * A wrongly accepted domain is worse than no domain: the pipeline would read a
 * stranger's contact page and store their address as the prospect's.
 */
export function pageBelongsTo(html, raison, city) {
  const hay = stripAccents(html || '').toUpperCase();
  const hits = nameTokens(raison).filter((t) => hay.includes(t));
  const cityHit = city ? hay.includes(stripAccents(city).toUpperCase()) : false;
  if (cityHit && hits.length >= 1) return { ok: true, hits: hits.length, why: `commune + ${hits.length} jeton(s)` };
  if (hits.length >= 2) return { ok: true, hits: hits.length, why: `${hits.length} jetons distincts` };
  if (hits.length === 1) return { ok: false, hits: 1, why: 'un seul jeton, pas de commune' };
  return { ok: false, hits: 0, why: 'aucun jeton du nom' };
}

const CONTACT_PATHS = [
  '', '/contact', '/contact/', '/contact-2/', '/nous-contacter/', '/contact.php',
  '/contact.aspx', '/mentions-legales', '/mentions-legales/', '/mentions_legales.php',
  '/infos-legales', '/fr/contact-devis'
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i;
const ROLE_PREFIX = ['contact', 'info', 'commercial', 'accueil', 'commerce', 'devis'];

function registrable(host) {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.');
  return parts.slice(-2).join('.');
}

/**
 * Emails actually published on the company's own site.
 *
 * The domain filter is not tidiness. berod-collet.fr publishes
 * `bonjour@netdev.fr` in its legal notice — its web agency. Stored as the
 * prospect's address, that mails a fellow supplier while believing it is
 * prospecting. Anything whose domain differs from the site's is dropped.
 *
 * Nothing is ever constructed. decorec@decorec.com and
 * bedouet74@bedouet-france.com are real addresses that no contact@domain
 * pattern would have produced, and a batch of guessed addresses is the
 * shortest path to bouncing the sending domain into auto-pause.
 */
export function pickEmails(html, domain) {
  const site = registrable(domain);
  const found = new Set();
  for (const raw of String(html || '').match(EMAIL_RE) || []) {
    const email = raw.trim().toLowerCase();
    if (ASSET_EXT.test(email)) continue;
    if (registrable(email.split('@')[1]) !== site) continue;
    found.add(email);
  }
  return [...found].sort((a, b) => {
    const rank = (e) => (ROLE_PREFIX.some((p) => e.startsWith(p)) ? 0 : 1);
    return rank(a) - rank(b) || a.length - b.length;
  });
}

const CERTS = [/ISO\s*9001/i, /IATF\s*16949/i, /EN\s*9100/i, /AS\s*9100/i, /ISO\s*14001/i, /JIS\s*Q\s*9100/i];

/**
 * Staleness and content signals, read off HTML already fetched. No extra
 * request. Each signal below fired on a real company in the sample.
 */
export function siteSignals(html, finalUrl, headers = {}) {
  const h = String(html || '');
  const low = h.toLowerCase();
  const signals = [];

  /* ── Âge VISUEL : ce que voit le visiteur ─────────────────────────── */
  if (!/<meta[^>]+name=["']?viewport/i.test(h)) signals.push('pas_de_version_mobile');   // STAB
  if (/\b(ga\.js|analytics\.js)\b/.test(low)) signals.push('analytics_mort_depuis_2023'); // Dubosson
  if (low.includes('lorem ipsum')) signals.push('lorem_ipsum_en_ligne');                  // Bedouet
  if (/site-solocal\.com|wixsite\.com|pagesjaunes/.test(String(finalUrl || '') + low)) signals.push('microsite_loue');
  const years = [...low.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/g)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) < new Date().getFullYear() - 2) signals.push('copyright_perime');

  /* ── Âge TECHNIQUE : ce que coûte la maintenance ───────────────────
   *
   * Axe distinct du précédent, et gardé séparé exprès : chamot.fr tourne sur
   * PHP 8.5 à jour avec une mise en page de 2015, l'inverse existe aussi.
   * Les confondre dans un seul score ferait envoyer le mauvais argumentaire.
   *
   * Mesuré sur 12 sites réels (6 datés / 6 modernes) : php_obsolete s'allume
   * 3 fois sur 6 chez les datés et 0 fois chez les modernes — le seul marqueur
   * qui sépare parfaitement. jQuery et l'absence de favicon, eux, s'allument
   * des deux côtés : écartés comme bruit. */
  const powered = String(headers['x-powered-by'] || '');
  const server = String(headers['server'] || '');

  /* Versions supportées au 2026-09 : 8.2, 8.3, 8.4. Tout le reste est hors
   * support — PHP 5.4 depuis septembre 2015, 7.0 depuis janvier 2019,
   * 8.0 depuis novembre 2023, 8.1 depuis décembre 2025. */
  const php = powered.match(/PHP\/(\d+)\.(\d+)/i);
  if (php) {
    const [major, minor] = [Number(php[1]), Number(php[2])];
    if (major < 8 || (major === 8 && minor < 2)) signals.push('php_obsolete');
  }
  if (/Apache\/2\.[0-2]\b|IIS\/[4-7]\b/i.test(server)) signals.push('serveur_ancien');

  if (String(finalUrl || '').startsWith('http://')) signals.push('pas_de_https');
  if (/<!DOCTYPE\s+html\s+PUBLIC/i.test(h)) signals.push('doctype_ancien');
  if (/\.swf\b|application\/x-shockwave/i.test(low)) signals.push('flash_present');
  if (/<table[^>]*(width|border|cellpadding)=/i.test(low)) signals.push('layout_en_tableaux');

  const certifications = CERTS.filter((re) => re.test(h)).length > 0;
  const machinePark = /parc\s*machines?|nos\s*moyens|moyens\s*de\s*production|equipements/i.test(stripAccents(h));
  const form = /<form[\s>]/i.test(h) && /type=["']?email|name=["']?(message|mail|email)/i.test(h);

  /* Deux axes, jamais fusionnés en un seul score.
   *
   * chamot.fr : PHP 8.5 à jour, mise en page de 2015 → visuel daté, technique
   * sain. usiplus.com : site récent et propre, PHP 8.0 hors support depuis 2023
   * → l'inverse exact. Un score unique enverrait à chacun l'argumentaire de
   * l'autre. */
  const VISUELS = ['pas_de_version_mobile', 'analytics_mort_depuis_2023',
    'lorem_ipsum_en_ligne', 'microsite_loue', 'copyright_perime'];
  const visual = signals.filter((s) => VISUELS.includes(s));
  const tech = signals.filter((s) => !VISUELS.includes(s));

  return {
    state: visual.length ? 'DATE' : 'MODERNE',   // conservé : colonne site_state
    visual_state: visual.length ? 'DATE' : 'MODERNE',
    tech_state: tech.length ? 'ANCIEN' : 'A_JOUR',
    signals, certifications, machinePark, form
  };
}

/* Which template the signals argue for. The app proposes, a human confirms.
 *
 * Never auto-assign: on the sample, 10 of 20 companies warranted T1 and 9
 * warranted T2. Sending T1 to all of them would have told half the list their
 * site lacks a machine park and certifications — false, and checkable in three
 * seconds, on the best prospects in the list. */
export function suggestTemplate({ state, certifications, form }) {
  if (state === 'ABSENT' || state === 'DATE') return 'T1';
  if (!certifications) return 'T2_VARIANTE';
  if (!form) return 'T2';
  return 'T2';
}

/**
 * The whole pipeline for one prospect.
 *
 * Returns a patch to apply to the lead row, or `{ resolved: false }` when
 * nothing was found. There is deliberately no third outcome: no "needs your
 * input", no half-filled record waiting for a human.
 */
export async function enrichLead(lead, deps = {}) {
  const fetcher = deps.fetchPage ?? fetchPage;
  const resolver = deps.domainResolves ?? domainResolves;

  let domain = null;
  let resolvedBy = null;
  let page = null;

  /* 1. Whatever the Maps scraper already stored wins: it came from the
   *    listing itself, so it needs no guessing. */
  if (lead.website) {
    const host = String(lead.website).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const got = await fetcher(`https://${host}`) || await fetcher(`http://${host}`);
    if (got) { domain = host; resolvedBy = 'maps'; page = got; }
  }

  /* 2. Generate and verify. */
  if (!domain) {
    const candidates = await Promise.all(
      candidateDomains(lead.name, lead.naf).map(async (d) => ((await resolver(d)) ? d : null))
    );
    for (const cand of candidates.filter(Boolean)) {
      const got = await fetcher(`https://${cand}`) || await fetcher(`http://${cand}`);
      if (!got) continue;
      const verdict = pageBelongsTo(got.html, lead.name, lead.city);
      if (verdict.ok) { domain = cand; resolvedBy = 'generation'; page = got; break; }

      /* Un seul jeton sur l'accueil : on regarde la page contact avant de
       * renoncer, parce que c'est là qu'est l'adresse postale.
       *
       * Mesuré : SOCIETE DES ETABLISSEMENTS CHAMOT ne donne qu'un jeton
       * distinctif (CHAMOT), et chamot.fr ne cite pas Bonneville sur sa page
       * d'accueil — le bon domaine était rejeté par prudence. La règle
       * commune-ou-deux-jetons reste intacte : on lui donne juste une seconde
       * page pour se prononcer, jamais un seuil plus bas. */
      if (verdict.hits === 1) {
        for (const p of ['/contact', '/contact/', '/mentions-legales', '/nous-contacter/']) {
          await sleep(POLITE_DELAY_MS);
          const sub = await fetcher(`https://${cand}${p}`);
          if (!sub) continue;
          if (pageBelongsTo(sub.html, lead.name, lead.city).ok) {
            domain = cand; resolvedBy = 'generation'; page = got;
            break;
          }
        }
        if (domain) break;
      }
      await sleep(POLITE_DELAY_MS);
    }
  }

  /* 3. Nothing found. The prospect is dropped, not handed back as homework. */
  if (!domain || !page) return { resolved: false, resolved_by: 'aucun' };

  let emails = pickEmails(page.html, domain);
  let tlsInvalid = page.tlsInvalid;

  /* Le schéma vient de la page d'accueil, il n'est PAS forcé en https.
   *
   * Bug mesuré : stab.fr ne répond qu'en http, ses pages de contact étaient
   * donc demandées en https et échouaient toutes. Le domaine était trouvé,
   * l'adresse `n.giraud@stab.fr` visible sur /contact.aspx, et le prospect
   * écarté quand même. Un site sans HTTPS est justement un prospect à forte
   * valeur : c'est le segment qu'on veut le moins perdre. */
  const scheme = String(page.finalUrl || '').startsWith('http://') ? 'http' : 'https';
  for (const path of CONTACT_PATHS) {
    if (emails.length) break;
    if (!path) continue;
    await sleep(POLITE_DELAY_MS);
    const sub = await fetcher(`${scheme}://${domain}${path}`);
    if (!sub) continue;
    tlsInvalid = tlsInvalid || sub.tlsInvalid;
    emails = pickEmails(sub.html, domain);
  }

  const sig = siteSignals(page.html, page.finalUrl, page.headers);
  return {
    resolved: emails.length > 0,
    website: `https://${domain}`,
    email: emails[0] || null,
    all_emails: emails,
    resolved_by: resolvedBy,
    email_source: emails.length ? 'site_propre' : null,
    site_state: sig.state,
    site_signals: JSON.stringify({ ...sig, tlsInvalid }),
    suggested_template: suggestTemplate(sig)
  };
}

/* One enrichment run per user at a time. A second import while the first is
 * still fetching would double the outbound request rate on third-party sites
 * for no gain. */
const activeRuns = new Set();

/**
 * Enriches freshly imported prospects in the background.
 *
 * Deliberately fire-and-forget, like runCampaignBackground: a 100-prospect
 * import means hundreds of third-party fetches and minutes of wall clock. The
 * caller answers immediately and the rows fill in.
 *
 * Every prospect ends on one of two terminal states, never a third:
 *   resolved   -> 'New', with a website and an address, campaign-ready
 *   unresolved -> 'Unresolved', hidden, and nobody is asked to fix it
 */
export async function runEnrichmentBackground(userId, leadIds, deps = {}) {
  const key = `user:${userId}`;
  if (activeRuns.has(key)) return;
  activeRuns.add(key);

  const db = deps.db ?? await getDb();
  const enrich = deps.enrichLead ?? enrichLead;
  let resolved = 0;
  let dropped = 0;

  try {
    for (const id of leadIds) {
      const lead = await db.get(
        'SELECT id, name, city, website, siren, category FROM leads WHERE id = ? AND user_id = ?',
        id, userId
      );
      if (!lead) continue;

      let out;
      try {
        out = await enrich({ ...lead, naf: lead.category });
      } catch (err) {
        // One unreachable site must never stop the run.
        console.error(`Enrichment: lead ${id} failed:`, err.message);
        out = { resolved: false, resolved_by: 'aucun' };
      }

      if (out.resolved) {
        resolved++;
        await db.run(
          `UPDATE leads SET website = ?, email = ?, site_state = ?, site_signals = ?,
                  email_source = ?, suggested_template = ?, resolved_by = ?, status = 'New'
             WHERE id = ? AND user_id = ?`,
          out.website, out.email, out.site_state, out.site_signals,
          out.email_source, out.suggested_template, out.resolved_by, id, userId
        );
      } else {
        dropped++;
        await db.run(
          `UPDATE leads SET resolved_by = ?, status = 'Unresolved'
             WHERE id = ? AND user_id = ? AND status = 'To Enrich'`,
          out.resolved_by || 'aucun', id, userId
        );
      }
      await sleep(POLITE_DELAY_MS);
    }
    console.log(`Enrichment: user ${userId} — ${resolved} résolus, ${dropped} écartés sur ${leadIds.length}`);
  } finally {
    activeRuns.delete(key);
  }
  return { resolved, dropped, total: leadIds.length };
}
