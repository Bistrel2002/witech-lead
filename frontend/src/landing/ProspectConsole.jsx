import { useEffect, useState } from 'react';
import { Search, MapPin, Check, Send } from 'lucide-react';
import { prefersReducedMotion } from './useReveal.js';
import { RESULTS, CYCLE, T, frameAt, frameKey } from './consoleTimeline.js';

/* The hero's thesis, played out rather than described.
 *
 * Wi'Tech Lead's one real differentiator is that it FINDS the businesses —
 * every competitor makes you bring your own list. So the hero shows the
 * search happening: a trade and a city type themselves in, the count spins
 * up, and results land one at a time and flip to "envoyé".
 *
 * The timeline is derived from a single elapsed-time value rather than a
 * chain of setTimeouts: every visible value is a pure function of `t`, so
 * the loop cannot drift and resetting is just t = 0.
 *
 * That `t` comes from the wall clock, not from counting ticks. An earlier
 * version advanced `t` by a fixed step inside setInterval, which meant the
 * demo ran at whatever rate the browser chose to fire the callback —
 * measured at ~1.7Hz instead of 16.7Hz in a background tab, stretching a
 * 680ms word into 11 seconds. Reading elapsed time keeps the animation on
 * its real schedule however often the callback actually runs.
 *
 * requestAnimationFrame schedules it: the browser suspends rAF entirely
 * while the tab is hidden (no wasted work) and resumes at the correct
 * point, because the frame is computed from elapsed time. Everything that
 * needs to look smooth — fades, slides, the progress bar — is a CSS
 * transition rather than a per-frame render.
 */

/** The finished state, for reduced-motion visitors and the SSR-less first paint. */
const FINAL = frameAt(CYCLE - T.hold);

function Field({ icon: Icon, label, value, caret }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle mb-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div
        className="h-9 px-3 flex items-center rounded-lg bg-surface-2 border border-line
          font-mono text-[13px] text-fg tabular-nums"
      >
        <span className="truncate">{value}</span>
        {caret && <i className="wt-caret" aria-hidden="true" />}
      </div>
    </div>
  );
}

export default function ProspectConsole() {
  // Decided at first render, not in the effect: a visitor who animates
  // starts from an empty console so the first cycle plays in full, and one
  // who has asked for reduced motion gets the finished result and never a
  // blank panel. Doing this in the effect would cost a second render and
  // trip react-hooks/set-state-in-effect.
  const [frame, setFrame] = useState(() =>
    prefersReducedMotion() ? FINAL : frameAt(0)
  );

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let raf = 0;
    let key = '';
    let start = 0;

    const loop = (now) => {
      if (!start) start = now;
      const next = frameAt((now - start) % CYCLE);

      // rAF fires ~60×/s but the console only has ~20 distinct states per
      // cycle, so re-render on change rather than on every frame.
      const nextKey = frameKey(next);
      if (nextKey !== key) {
        key = nextKey;
        setFrame(next);
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);

    // Same failsafe the scroll reveals carry, for the same reason: the
    // console's first frame is an empty panel, and it only fills once rAF
    // runs. If rAF never runs, the hero of the sales page sits blank
    // forever.
    //
    // Scoped to a visible document on purpose. A tab that loads in the
    // background legitimately gets no frames — the browser suspends rAF —
    // and nobody is looking, so there is nothing to rescue; it will play
    // from the top when the visitor arrives. Only silence while someone is
    // actually watching means something is wrong, and then the finished
    // state beats an empty one.
    const failsafe = window.setTimeout(() => {
      if (!key && document.visibilityState === 'visible') setFrame(FINAL);
    }, 1500);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    /* Hidden from assistive tech on purpose. Everything in here is a
     * labelled demonstration with invented records, and it mutates roughly
     * every 260ms — a screen reader would get a stream of churn carrying no
     * information the visitor needs. The hero paragraph beside it already
     * states the same thing in prose: the product finds the businesses,
     * writes to each, and tracks who replies. */
    <div className="wt-console-frame shadow-[var(--wt-shadow-lg)]" aria-hidden="true">
      <div className="p-4 sm:p-5">

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="wt-pulse w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--wt-brand-500)' }}
            />
            <span className="text-[11px] font-semibold text-fg-muted">
              Recherche d’entreprises
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Démonstration
          </span>
        </div>

        <div className="flex gap-3">
          <Field
            icon={Search}
            label="Métier"
            value={frame.trade}
            caret={frame.typingTrade}
          />
          <Field
            icon={MapPin}
            label="Ville"
            value={frame.city}
            caret={frame.typingCity}
          />
        </div>

        <div className="flex items-center justify-between mt-4 mb-3">
          <div className="font-mono text-[13px] text-fg tabular-nums">
            {/* Blank until the first result actually lands. `started` alone
                was not enough: it turns true when the search fires, but no
                row exists for another 700ms, so the panel sat on "0
                entreprises trouvées" — which reads as a search that found
                nothing, the opposite of the point. */}
            <span className="text-accent font-semibold">
              {frame.visible > 0 ? frame.count : '—'}
            </span>
            <span className="text-fg-muted"> entreprises trouvées</span>
          </div>
          <div className="font-mono text-[11px] text-fg-subtle tabular-nums">
            {frame.sentCount}/{RESULTS.length} contactées
          </div>
        </div>

        <div className="h-0.5 rounded-full bg-surface-2 overflow-hidden relative">
          {frame.searching ? (
            <span className="wt-sweep absolute inset-0 block" />
          ) : (
            <span
              className="block h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${(frame.visible / RESULTS.length) * 100}%`,
                backgroundImage: 'var(--wt-gradient)'
              }}
            />
          )}
        </div>

        <ul className="mt-3 space-y-1.5">
          {RESULTS.map((r, i) => {
            const isOut = i < frame.visible;
            const isSent = i < frame.sentCount;
            if (!isOut) {
              // A waiting slot rather than empty space. The list holds its
              // full height from the first frame so the console never
              // resizes, and an empty panel for the ~3s before the first
              // result lands reads as broken rather than as searching.
              return (
                <li
                  key={r.name}
                  aria-hidden="true"
                  className="h-10 px-3 flex items-center rounded-lg border border-dashed border-line/70"
                >
                  <span
                    className="h-1.5 rounded-full bg-fg-subtle/25"
                    style={{ width: `${38 + ((i * 13) % 26)}%` }}
                  />
                </li>
              );
            }
            return (
              <li
                key={r.name}
                className="wt-row-in h-10 px-3 flex items-center justify-between gap-3
                  rounded-lg bg-surface-2 border border-line"
                style={{ animationDelay: '0ms' }}
              >
                <span className="min-w-0 flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">
                    {r.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                    {r.area}
                  </span>
                </span>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold
                    px-2 py-1 rounded-md transition-colors duration-300 ${
                      isSent
                        ? 'text-[var(--wt-success-fg)] bg-[var(--wt-success-soft)]'
                        : 'text-fg-muted bg-surface'
                    }`}
                >
                  {isSent ? <Check className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                  {isSent ? 'Envoyé' : 'Trouvé'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
