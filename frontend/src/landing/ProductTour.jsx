import { useCallback, useEffect, useRef, useState } from 'react';
import { Users, Send, Megaphone, LayoutDashboard } from 'lucide-react';
import { prefersReducedMotion } from './useReveal.js';
import {
  CampaignPanel,
  SendingPanel,
  PipelinePanel,
  DashboardPanel
} from './FeaturePanels.jsx';

/* One application window instead of four stacked feature rows.
 *
 * The alternating text-left / panel-right zig-zag is the layout every SaaS
 * page reaches for, and it made four related screens read as four unrelated
 * cards. Here they share one window with the product's own navigation rail,
 * so the reader sees an application being used rather than a list of
 * features — and the rail is drawn from --wt-rail-*, the same tokens the
 * real app's navigation uses, so the chrome is not invented either.
 *
 * The tour advances on its own and can be driven by hand. Auto-advance
 * pauses while the pointer or keyboard focus is inside the window, and
 * stops for good once a visitor picks a screen themselves — taking control
 * away from someone who has just taken it is the classic carousel sin.
 */

const SCREENS = [
  {
    id: 'campagnes',
    nav: 'Campagnes',
    icon: Megaphone,
    title: 'Nouvelle campagne',
    caption:
      'Vous choisissez une catégorie et une ville, vous rédigez un message une fois, et vous y placez des variables. Chaque entreprise reçoit sa propre version.',
    Body: CampaignPanel,
    hold: 9000
  },
  {
    id: 'envoi',
    nav: 'Envoi',
    icon: Send,
    title: 'Plombiers Lyon — Mars',
    caption:
      'Les messages partent d’un sous-domaine réservé à votre compte, étalés dans le temps pour protéger votre réputation. Les adresses désinscrites sont ignorées automatiquement.',
    Body: SendingPanel,
    hold: 9500
  },
  {
    id: 'prospects',
    nav: 'Prospects',
    icon: Users,
    title: 'Fiche prospect',
    caption:
      'Un statut par prospect et tout son historique, du premier contact à l’affaire signée. Vous savez qui relancer aujourd’hui sans tenir de tableur à côté.',
    Body: PipelinePanel,
    hold: 9500
  },
  {
    id: 'tableau-de-bord',
    nav: 'Tableau de bord',
    icon: LayoutDashboard,
    title: 'Tableau de bord',
    caption:
      'La répartition de vos prospects par statut et le volume par métier, tenus à jour à mesure que vos campagnes tournent.',
    Body: DashboardPanel,
    hold: 8000
  }
];

export default function ProductTour() {
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState(false); // visitor drove it themselves
  const [paused, setPaused] = useState(false);
  const hostRef = useRef(null);
  const [live, setLive] = useState(false);

  // Only run while the window is on screen — an unseen tour costs nothing.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver !== 'function') {
      setLive(true);
      return;
    }
    let answered = false;
    const io = new IntersectionObserver(
      ([e]) => {
        answered = true;
        setLive(e.isIntersecting);
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    // Same failsafe the reveals carry: never let a silent observer decide
    // the visitor sees a frozen window.
    const t = window.setTimeout(() => {
      if (!answered) setLive(true);
    }, 1500);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  const running = live && !paused && !taken && !prefersReducedMotion();

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % SCREENS.length),
      SCREENS[index].hold
    );
    return () => window.clearTimeout(id);
  }, [running, index]);

  const pick = useCallback((i) => {
    setIndex(i);
    setTaken(true);
  }, []);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      pick((index + step + SCREENS.length) % SCREENS.length);
    },
    [index, pick]
  );

  const screen = SCREENS[index];
  const Body = screen.Body;

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="wt-console-frame overflow-hidden shadow-[var(--wt-shadow-lg)]">
        <div className="grid sm:grid-cols-[minmax(150px,190px)_1fr]">

          {/* Navigation rail — the app's own chrome, dark in both themes. */}
          <div
            className="hidden sm:flex flex-col p-3 gap-1"
            style={{ background: 'var(--wt-rail-bg)' }}
            role="tablist"
            aria-label="Écrans du produit"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 px-2 pt-1 pb-3">
              <span
                style={{ backgroundImage: 'var(--wt-gradient)' }}
                className="w-5 h-5 rounded-md shrink-0"
              />
              <span className="font-display font-bold text-[12px] text-white truncate">
                Wi’Tech Lead
              </span>
            </div>

            {SCREENS.map((s, i) => {
              const on = i === index;
              return (
                <button
                  key={s.id}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pick(i)}
                  className="relative text-left rounded-lg px-2.5 py-2 flex items-center gap-2.5
                    cursor-pointer transition-colors focus-visible:outline-2
                    focus-visible:outline-offset-2 focus-visible:outline-white"
                  style={{
                    background: on ? 'rgba(255,255,255,.08)' : 'transparent',
                    color: on ? 'var(--wt-rail-fg-active)' : 'var(--wt-rail-fg)'
                  }}
                >
                  <s.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11.5px] font-medium truncate">{s.nav}</span>
                  {on && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                      style={{ backgroundImage: 'var(--wt-gradient)' }}
                    />
                  )}
                </button>
              );
            })}

            <div className="mt-auto px-2.5 pt-4">
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--wt-rail-fg)' }}
              >
                Démonstration
              </span>
            </div>
          </div>

          {/* Screen area. Fixed minimum so switching never jolts the page. */}
          <div className="bg-surface">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-line">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="wt-pulse w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: 'var(--wt-brand-500)' }}
                />
                <span className="text-[11px] font-semibold text-fg-muted truncate">
                  {screen.title}
                </span>
              </div>
              {/* Mobile has no rail, so the position indicator moves here. */}
              <span className="sm:hidden font-mono text-[10px] text-fg-subtle tabular-nums">
                {index + 1}/{SCREENS.length}
              </span>
            </div>

            <div key={screen.id} className="wt-screen-in p-4 sm:p-5 min-h-[26rem]">
              <Body active={live} />
            </div>
          </div>
        </div>
      </div>

      {/* Caption lives outside the aria-hidden panels, so the point of each
          screen is readable even though the demo itself is decorative. */}
      <p
        key={`${screen.id}-caption`}
        className="wt-screen-in text-fg-muted leading-relaxed mt-6 max-w-2xl mx-auto text-center"
      >
        <span className="text-fg font-semibold">{screen.nav} — </span>
        {screen.caption}
      </p>

      {/* Mobile control strip, since the rail is hidden there. */}
      <div className="sm:hidden flex items-center justify-center gap-2 mt-5">
        {SCREENS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => pick(i)}
            aria-label={s.nav}
            aria-current={i === index}
            className="h-1.5 rounded-full transition-all cursor-pointer"
            style={{
              width: i === index ? '1.75rem' : '0.375rem',
              backgroundImage: i === index ? 'var(--wt-gradient)' : 'none',
              background: i === index ? undefined : 'var(--wt-line)'
            }}
          />
        ))}
      </div>
    </div>
  );
}
