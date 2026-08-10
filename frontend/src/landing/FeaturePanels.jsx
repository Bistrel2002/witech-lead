import { Check, SkipForward, Search, Mail, Phone, FileText } from 'lucide-react';
import { useCycleClock, easeOut, phase } from './useCycleClock.js';
import { RESULTS } from './consoleTimeline.js';

/* The screen bodies rendered inside ProductTour's window.
 *
 * They deliberately carry no chrome of their own — no frame, no header, no
 * "Démonstration" badge. The tour owns all of that, because the whole point
 * of the arrangement is that these read as four screens of one application
 * rather than four separate cards.
 *
 * Everything shown is taken from the app, not invented:
 *   - the campaign form's own fields and the {{company_name}} /
 *     {{unsubscribe_link}} merge tags (Campaigns.jsx)
 *   - the campaign history's counters: cibles, envoyés, échecs, ignorés
 *   - the lead pipeline stages (LeadsManager.jsx PIPELINE_STATUSES)
 *
 * Figures are illustrative, so every panel is hidden from assistive tech and
 * carries a "Démonstration" label; the surrounding prose makes the actual
 * claims. Panels only run once scrolled into view.
 */

function FieldBox({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle mb-1.5">
        {label}
      </div>
      <div className="min-h-9 px-3 py-2 rounded-lg bg-surface-2 border border-line text-[12.5px] text-fg">
        {children}
      </div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span className="font-mono text-[10.5px] text-accent bg-accent-soft rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

/* ── Création de campagne ───────────────────────────────────────────── */

const NAME = 'Plombiers Lyon — Mars';
const BUILD_CYCLE = 8400;
const NAME_START = 400;
const NAME_CHAR = 55;
const NAME_DONE = NAME_START + NAME.length * NAME_CHAR;
const RESOLVE_AT = NAME_DONE + 700;

export function CampaignPanel({ active }) {
  const t = useCycleClock({ cycle: BUILD_CYCLE, active });

  const typedName = t < NAME_START
    ? ''
    : NAME.slice(0, Math.min(NAME.length, Math.floor((t - NAME_START) / NAME_CHAR)));

  const resolved = t >= RESOLVE_AT;
  const slot = Math.floor((t - RESOLVE_AT) / 900);
  const company = resolved ? RESULTS[Math.max(0, slot) % RESULTS.length] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FieldBox label="Nom de la campagne">
          <span>{typedName}</span>
          {typedName.length < NAME.length && t >= NAME_START && (
            <i className="wt-caret" />
          )}
        </FieldBox>
        <FieldBox label="Canal">E-mail</FieldBox>
      </div>

      <FieldBox label="Catégorie cible" className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span>Plombiers · Lyon</span>
          <span className="font-mono text-[11px] text-fg-muted tabular-nums shrink-0">
            240 entreprises
          </span>
        </div>
      </FieldBox>

      <div className="h-px bg-line my-4" />

      <FieldBox label="Objet">
        Optimisation de la visibilité en ligne de{' '}
        {company ? (
          <span
            key={company.name}
            className="wt-row-in inline-block font-medium bg-accent-soft border border-line rounded px-1.5 py-0.5"
          >
            {company.name}
          </span>
        ) : (
          <Tag>{'{{company_name}}'}</Tag>
        )}
      </FieldBox>

      <FieldBox label="Corps du message" className="mt-3">
        <p className="leading-relaxed text-fg-muted">
          Bonjour, je vois que{' '}
          {company ? (
            <span className="font-medium text-fg">{company.name}</span>
          ) : (
            <Tag>{'{{company_name}}'}</Tag>
          )}{' '}
          intervient sur {company ? company.area : 'votre secteur'}. Je vous propose…
        </p>
      </FieldBox>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-[10px] text-fg-subtle">Variables :</span>
        <Tag>{'{{company_name}}'}</Tag>
        <Tag>{'{{unsubscribe_link}}'}</Tag>
      </div>
    </>
  );
}

/* ── Campagne en cours ──────────────────────────────────────────────── */

const SEND_CYCLE = 9000;
const TARGETS = 240;
const FAILED = 2;
const SKIPPED = 6;
const DELIVERED = TARGETS - FAILED - SKIPPED;
const LOG_START = 700;
const LOG_EVERY = 1250;

/* One row is "Ignoré" on purpose: the send path skips addresses that have
 * unsubscribed or been suppressed, and that is worth showing rather than
 * hiding behind a clean run. */
const LOG = [
  { ...RESULTS[0], state: 'sent' },
  { ...RESULTS[1], state: 'sent' },
  { ...RESULTS[2], state: 'skipped' },
  { ...RESULTS[3], state: 'sent' },
  { ...RESULTS[4], state: 'sent' }
];

export function SendingPanel({ active }) {
  const t = useCycleClock({ cycle: SEND_CYCLE, active });
  const p = easeOut(phase(t, 400, 6800));
  const done = p >= 1;
  const shown = Math.max(0, Math.min(LOG.length, Math.floor((t - LOG_START) / LOG_EVERY) + 1));

  /* All three outcome counters ramp on the same progress value. They used to
   * sit at zero until the very end, which put the panel in contradiction
   * with itself: the log showed an "Ignoré" row two seconds before the
   * Ignorés counter left 0. They now always sum to what has been attempted. */
  const counters = [
    ['Cibles', TARGETS],
    ['Envoyés', Math.round(DELIVERED * p)],
    ['Échecs', Math.round(FAILED * p)],
    ['Ignorés', Math.round(SKIPPED * p)]
  ];

  return (
    <>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-semibold text-fg">
          {done ? 'Campagne terminée' : 'Envoi en cours…'}
        </span>
        <span className="font-mono text-[12px] text-accent tabular-nums">
          {Math.round(p * 100)} %
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${p * 100}%`, backgroundImage: 'var(--wt-gradient)' }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 mt-4">
        {counters.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2 border border-line px-2.5 py-2">
            <div className="text-[9.5px] uppercase tracking-[0.1em] text-fg-subtle">{label}</div>
            <div className="font-mono text-[15px] text-fg tabular-nums mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="h-px bg-line my-4" />

      <ul className="space-y-1.5">
        {LOG.map((row, i) => {
          if (i >= shown) return <li key={row.name} className="h-9" />;
          const skipped = row.state === 'skipped';
          return (
            <li
              key={row.name}
              className="wt-row-in h-9 px-3 flex items-center justify-between gap-3 rounded-lg
                bg-surface-2 border border-line"
            >
              <span className="min-w-0 flex items-baseline gap-2">
                <span className="truncate text-[12px] text-fg">{row.name}</span>
                <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">{row.area}</span>
              </span>
              <span
                className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                  skipped
                    ? 'text-fg-muted bg-surface'
                    : 'text-[var(--wt-success-fg)] bg-[var(--wt-success-soft)]'
                }`}
              >
                {skipped ? <SkipForward className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                {skipped ? 'Ignoré' : 'Envoyé'}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-fg-subtle mt-3">
        « Ignoré » : adresse désinscrite ou en liste de suppression.
      </p>
    </>
  );
}

/* ── Suivi des prospects ────────────────────────────────────────────── */

/* The lead record as LeadsManager holds it: the Maps fields it scrapes
 * (category, city, rating, review count), its pipeline stage, and the
 * activity log whose types the app defines — Note, Email, Call, Meeting.
 *
 * Stage and history advance together, because that is the actual point of
 * the screen: the history is why the prospect is where it is. */

const BOARD_CYCLE = 9200;
const MOVE_START = 900;
const MOVE_EVERY = 1500;

const STAGES = ['Nouveau', 'Contacté', 'RDV fixé', 'Proposition', 'Gagné'];

const HISTORY = [
  { icon: Search, label: 'Importé depuis Google Maps', when: 'il y a 9 j' },
  { icon: Mail, label: 'E-mail de prospection envoyé', when: 'il y a 6 j' },
  { icon: Phone, label: 'Appel — rendez-vous fixé', when: 'il y a 3 j' },
  { icon: FileText, label: 'Proposition envoyée', when: 'il y a 1 j' },
  { icon: Check, label: 'Affaire signée', when: "aujourd’hui" }
];

export function PipelinePanel({ active }) {
  const t = useCycleClock({ cycle: BOARD_CYCLE, active });
  const at = Math.max(
    0,
    Math.min(STAGES.length - 1, Math.floor((t - MOVE_START) / MOVE_EVERY))
  );

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-fg truncate">
            {RESULTS[0].name}
          </div>
          <div className="text-[11px] text-fg-subtle mt-0.5">
            Plombier · {RESULTS[0].area}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[11px] text-fg tabular-nums">★ 4,6</div>
          <div className="text-[10px] text-fg-subtle">87 avis</div>
        </div>
      </div>

      <div className="h-px bg-line my-4" />

      {/* Pipeline strip: the stage the record sits at right now. */}
      <div className="flex items-start">
        {STAGES.map((label, i) => {
          const done = i < at;
          const here = i === at;
          return (
            <div key={label} className="flex-1 min-w-0">
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${here ? 'wt-pulse' : ''}`}
                  style={{
                    background: done || here ? 'var(--wt-brand-500)' : 'var(--wt-line)'
                  }}
                />
                {i < STAGES.length - 1 && (
                  <span
                    className="flex-1 h-px transition-colors duration-500"
                    style={{ background: done ? 'var(--wt-brand-500)' : 'var(--wt-line)' }}
                  />
                )}
              </div>
              <span
                className={`block mt-2 text-[9.5px] leading-tight pr-1 transition-colors duration-300 ${
                  here ? 'text-fg font-semibold' : done ? 'text-fg-muted' : 'text-fg-subtle'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-line my-4" />

      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle mb-2.5">
        Historique
      </div>

      <ul className="space-y-1.5">
        {HISTORY.map((h, i) => {
          if (i > at) return <li key={h.label} className="h-8" />;
          return (
            <li
              key={h.label}
              className="wt-row-in h-8 px-2.5 flex items-center gap-2.5 rounded-lg
                bg-surface-2 border border-line"
            >
              <h.icon className="w-3 h-3 text-accent shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[11px] text-fg-muted">
                {h.label}
              </span>
              <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">{h.when}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ── Tableau de bord ────────────────────────────────────────────────── */

/* Mirrors the two charts Dashboard.jsx actually renders with Recharts: a
 * vertical BarChart of prospects per trade, and a Pie/donut of the status
 * split. Same shape, same default figures.
 *
 * Series colours run down the brand ramp with the win in the success green.
 * The ramp steps differ in lightness, not only hue, and every series is
 * labelled with its own value beside it — colour is never the only way to
 * read this. */

const DASH_CYCLE = 7600;

const BARS = [
  { name: 'Restaurants', short: 'Rest.', count: 20 },
  { name: 'Coiffeurs', short: 'Coif.', count: 15 },
  { name: 'Plombiers', short: 'Plomb.', count: 12 },
  { name: 'Menuisiers', short: 'Menu.', count: 8 },
  { name: 'Solo-preneurs', short: 'Solo', count: 6 }
];
const BAR_MAX = 20;

const SPLIT = [
  { name: 'Nouveau', value: 25, color: 'var(--wt-brand-700)' },
  { name: 'Contacté', value: 18, color: 'var(--wt-brand-500)' },
  { name: 'Tiède', value: 8, color: 'var(--wt-brand-300)' },
  { name: 'Répondu', value: 10, color: 'var(--wt-success)' }
];
const SPLIT_TOTAL = SPLIT.reduce((n, s) => n + s.value, 0);

const R = 30;
const CIRC = 2 * Math.PI * R;

export function DashboardPanel({ active }) {
  const t = useCycleClock({ cycle: DASH_CYCLE, active });
  const ring = easeOut(phase(t, 900, 3800));

  // Arc offsets precomputed rather than accumulated inside the JSX: a
  // variable reassigned while rendering is a mutation React is entitled to
  // run twice, and the lint rule that catches it is right to.
  const arcs = SPLIT.map((s, i) => ({
    ...s,
    len: (s.value / SPLIT_TOTAL) * CIRC * ring,
    offset:
      (SPLIT.slice(0, i).reduce((n, prev) => n + prev.value, 0) / SPLIT_TOTAL) *
      CIRC *
      ring
  }));

  return (
    <>
      {/* Two columns on a wide canvas. Stacked, the histogram stretched to
          900px while staying 64px tall and the donut left a third of the
          window empty — these bodies now live in the tour's screen area, not
          in a narrow card. */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 lg:gap-8">

        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle mb-3">
            Prospects par catégorie
          </div>
          <div className="flex items-end justify-between gap-3 h-32">
            {BARS.map((b, i) => {
              const p = easeOut(phase(t, 300 + i * 140, 1800 + i * 140));
              return (
                <div key={b.name} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="font-mono text-[10px] text-fg tabular-nums">
                    {Math.round(b.count * p)}
                  </span>
                  <div
                    className="w-full max-w-[64px] rounded-t-md"
                    style={{
                      height: `${(b.count / BAR_MAX) * p * 92}px`,
                      backgroundImage: 'var(--wt-gradient)'
                    }}
                  />
                  <span className="text-[9px] text-fg-subtle truncate w-full text-center">
                    {b.short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:border-l lg:border-line lg:pl-8">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle mb-3">
            Répartition par statut
          </div>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
                <circle
                  cx="38" cy="38" r={R} fill="none"
                  stroke="var(--wt-surface-2)" strokeWidth="9"
                />
                {arcs.map((a) => (
                  <circle
                    key={a.name}
                    cx="38" cy="38" r={R} fill="none"
                    stroke={a.color} strokeWidth="9"
                    strokeDasharray={`${a.len} ${CIRC - a.len}`}
                    strokeDashoffset={-a.offset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[14px] font-semibold text-fg tabular-nums leading-none">
                  {Math.round(SPLIT_TOTAL * ring)}
                </span>
                <span className="text-[8px] text-fg-subtle mt-0.5">prospects</span>
              </div>
            </div>

            <ul className="flex-1 space-y-1.5 min-w-0">
              {SPLIT.map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className="text-[11px] text-fg-muted flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-[11px] text-fg tabular-nums">
                    {Math.round(s.value * ring)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </>
  );
}
