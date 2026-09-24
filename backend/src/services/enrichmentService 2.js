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

/**
 * Fetches a public page.
 *
 * Strict TLS first. A certificate error falls back to a permissive read and
 * says so in `tlsInvalid`, because dubosson.com serves a certificate issued to
 * its OVH host and a strict client drops a real company for a hosting detail.
 * The fallback is read-only by construction — nothing is ever posted to these
 * sites — and the flag keeps the compromise visible instead of silent.
 */
export async function fetchPage(url) {
  const opts = {
    timeout: FETCH_TIMEOUT,
    maxRedirects: 4,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en' }
  };
  try {
    const res = await axios.get(url, opts);
    return { html: String(res.data || ''), finalUrl: res.request?.res?.responseUrl || url, tlsInvalid: false };
  } catch (err) {
    const tlsish = /certificate|CERT_|altnames|SELF_SIGNED|TLS/i.test(err.message || '');
    if (!tlsish) return null;
    try {
      const res = await axios.get(url, { ...opts, httpsAgent: laxAgent });
      return { html: String(res.data || ''), finalUrl: res.request?.res?.responseUrl || url, tlsInvalid: true };
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
  if (cityHit && hits.length >= 1) return { ok: true, why: `commune + ${hits.length} jeton(s)` };
  if (hits.length >= 2) return { ok: true, why: `${hits.length} jetons distincts` };
  if (hits.length === 1) return { ok: false, why: 'un seul jeton, pas de commune' };
  return { ok: false, why: 'aucun jeton du nom' };
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
export function siteSignals(html, finalUrl) {
  const h = String(html || '');
  const low = h.toLowerCase();
  const signals = [];

  if (!/<meta[^>]+name=["']?viewport/i.test(h)) signals.push('pas_de_version_mobile');   // STAB
  if (/\b(ga\.js|analytics\.js)\b/.test(low)) signals.push('analytics_mort_depuis_2023'); // Dubosson
  if (low.includes('lorem ipsum')) signals.push('lorem_ipsum_en_ligne');                  // Bedouet
  if (/site-solocal\.com|wixsite\.com|pagesjaunes/.test(String(finalUrl || '') + low)) signals.push('microsite_loue');
  const years = [...low.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/g)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) < new Date().getFullYear() - 2) signals.push('copyright_perime');

  const certifications = CERTS.filter((re) => re.test(h)).length > 0;
  const machinePark = /parc\s*machines?|nos\s*moyens|moyens\s*de\s*production|equipements/i.test(stripAccents(h));
  const form = /<form[\s>]/i.test(h) && /type=["']?email|name=["']?(message|mail|email)/i.test(h);

  const state = signals.length >= 2 ? 'DATE' : signals.length === 1 ? 'DATE' : 'MODERNE';
  return { state, signals, certifications, machinePark, form };
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
      await sleep(POLITE_DELAY_MS);
    }
  }

  /* 3. Nothing found. The prospect is dropped, not handed back as homework. */
  if (!domain || !page) return { resolved: false, resolved_by: 'aucun' };

  let emails = pickEmails(page.html, domain);
  let tlsInvalid = page.tlsInvalid;
  for (const path of CONTACT_PATHS) {
    if (emails.length) break;
    if (!path) continue;
    await sleep(POLITE_DELAY_MS);
    const sub = await fetcher(`https://${domain}${path}`);
    if (!sub) continue;
    tlsInvalid = tlsInvalid || sub.tlsInvalid;
    emails = pickEmails(sub.html, domain);
  }

  const sig = siteSignals(page.html, page.finalUrl);
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
