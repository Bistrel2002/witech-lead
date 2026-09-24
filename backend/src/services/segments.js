/* Les segments de prospection.
 *
 * Un segment = un signal détecté à l'enrichissement = un argumentaire = une
 * campagne. C'est la pièce qui manquait entre « le code calcule des signaux »
 * et « je lance une campagne ciblée » : sans elle, les signaux sont stockés et
 * inertes, et l'utilisateur n'a que le choix d'un envoi unique à toute la liste.
 *
 * Les signaux vivent dans `leads.site_signals`, du JSON stocké en TEXT. Le
 * filtrage se fait donc par LIKE sur une clé JSON exacte — `"clé"` avec ses
 * guillemets, pour qu'un signal ne matche jamais le préfixe d'un autre.
 *
 * La clé de segment N'EST JAMAIS interpolée dans le SQL : elle sert à choisir
 * une entrée de cette table, et seul le motif écrit ici part en paramètre.
 */

export const SEGMENTS = {
  // ── Sécurité : le plus urgent, la meilleure marge ────────────────────
  php_obsolete: {
    label: 'Serveur PHP hors support',
    pattern: '%"php_obsolete"%',
    priority: 1,
    template: 'T_SECURITE_PHP'
  },
  pas_de_https: {
    label: 'Site sans HTTPS',
    pattern: '%"pas_de_https"%',
    priority: 1,
    template: 'T_HTTPS'
  },

  // ── Perte de clients : gros tickets ──────────────────────────────────
  sans_site: {
    label: 'Aucun site trouvé',
    // Pas un signal : l'absence de site est un état du prospect lui-même.
    where: "(COALESCE(website, '') = '' OR status = 'Unresolved')",
    priority: 2,
    template: 'T_SANS_SITE'
  },
  mobile_absent: {
    label: 'Pas de version mobile',
    pattern: '%"pas_de_version_mobile"%',
    priority: 2,
    template: 'T_MOBILE'
  },

  // ── Vétusté : mène à la refonte complète ─────────────────────────────
  flash_present: {
    label: 'Flash encore présent',
    pattern: '%"flash_present"%',
    priority: 3,
    template: 'T_FLASH'
  },
  structure_ancienne: {
    label: 'Structure antérieure au mobile',
    pattern: '%"doctype_ancien"%',
    patternAlt: '%"layout_en_tableaux"%',
    priority: 3,
    template: 'T_STRUCTURE'
  },

  // ── Demandes perdues : mène au récurrent ─────────────────────────────
  sans_formulaire: {
    label: 'Aucun formulaire de devis',
    pattern: '%"form":false%',
    priority: 4,
    template: 'T_FORMULAIRE'
  },

  // ── Portes d'entrée : petits tickets, oui faciles ────────────────────
  lorem_ipsum: {
    label: 'Texte de gabarit en ligne',
    pattern: '%"lorem_ipsum_en_ligne"%',
    patternAlt: '%"microsite_loue"%',
    priority: 5,
    template: 'T_LOREM'
  },
  analytics_mort: {
    label: 'Mesure d\'audience à l\'arrêt',
    pattern: '%"analytics_mort_depuis_2023"%',
    patternAlt: '%"copyright_perime"%',
    priority: 5,
    template: 'T_ANALYTICS'
  },
  sans_certifications: {
    label: 'Aucune certification affichée',
    pattern: '%"certifications":false%',
    priority: 6,
    template: 'T_CERTIFICATIONS'
  }
};

export const SEGMENT_KEYS = Object.keys(SEGMENTS);

/**
 * Traduit une clé de segment en fragment SQL + paramètres.
 *
 * Renvoie `null` pour une clé inconnue — l'appelant doit alors refuser la
 * requête plutôt que l'ignorer silencieusement, sinon un segment mal orthographié
 * enverrait une campagne à toute la base.
 */
export function segmentClause(key) {
  const seg = SEGMENTS[key];
  if (!seg) return null;

  if (seg.where) return { sql: seg.where, params: [] };

  if (seg.patternAlt) {
    return {
      sql: '(site_signals LIKE ? OR site_signals LIKE ?)',
      params: [seg.pattern, seg.patternAlt]
    };
  }
  return { sql: 'site_signals LIKE ?', params: [seg.pattern] };
}

/**
 * Compte les prospects de chaque segment, pour un tenant.
 *
 * C'est ce que l'interface affiche : « 30 prospects sans version mobile,
 * lancer une campagne ». Un segment vide est renvoyé avec 0 plutôt qu'omis,
 * pour que la liste reste stable d'un tirage à l'autre.
 */
/**
 * Les prospects qui attendent encore d'etre analyses.
 *
 * C'est le chiffre qui manquait a l'ecran : un prospect importe mais jamais
 * enrichi n'a ni site, ni adresse, ni signal — il n'apparait donc dans AUCUN
 * segment, et rien ne dit qu'il existe. Mesure sur un compte reel : 173
 * prospects immobiles en 'To Enrich', invisibles, pendant que l'interface
 * affichait quatre segments bien remplis.
 */
export async function countPending(db, userId) {
  const row = await db.get(
    `SELECT COUNT(*) AS n FROM leads
      WHERE user_id = ?
        AND COALESCE(site_signals, '') = ''
        AND (status = 'To Enrich' OR siren IS NOT NULL OR COALESCE(website, '') <> '')`,
    userId
  );
  return Number(row?.n || 0);
}

export async function countSegments(db, userId) {
  const out = [];
  for (const key of SEGMENT_KEYS) {
    const clause = segmentClause(key);
    const row = await db.get(
      `SELECT COUNT(*) AS n FROM leads
        WHERE user_id = ? AND ${clause.sql}
          AND COALESCE(email, '') <> ''
          AND status = 'New'`,
      userId, ...clause.params
    );
    out.push({
      key,
      label: SEGMENTS[key].label,
      template: SEGMENTS[key].template,
      priority: SEGMENTS[key].priority,
      count: Number(row?.n || 0)
    });
  }
  // L'ordre d'envoi recommandé : sécurité d'abord, portes d'entrée en dernier.
  return out.sort((a, b) => a.priority - b.priority || b.count - a.count);
}
