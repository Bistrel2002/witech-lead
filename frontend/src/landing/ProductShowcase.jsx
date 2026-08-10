import { Users, Send, Megaphone, LayoutDashboard } from 'lucide-react';
import { useReveal } from './useReveal.js';
import {
  CampaignPanel,
  SendingPanel,
  PipelinePanel,
  DashboardPanel
} from './FeaturePanels.jsx';

/* All four screens at once, in an asymmetric grid.
 *
 * Three arrangements were tried before this one, and each failed for its own
 * reason. Four alternating text/panel rows was the zig-zag every SaaS page
 * uses. Small squares inside the step cards were unreadable. A single
 * application window with a navigation rail read well but showed one screen
 * at a time, which hid three quarters of the product behind a timer.
 *
 * A pinwheel fixes all three: everything is visible together, the two wide
 * cells go to the screens that genuinely need width (the charts, and the
 * send log), and the alternation is diagonal rather than a column of rows.
 *
 * Every panel animates off one shared reveal, so the grid comes alive as a
 * whole when it scrolls in rather than in four separate bursts.
 */

const SCREENS = [
  {
    id: 'tableau-de-bord',
    icon: LayoutDashboard,
    title: 'Tableau de bord',
    caption: 'La répartition par statut et le volume par métier, à jour en permanence.',
    Body: DashboardPanel,
    span: 'lg:col-span-8'
  },
  {
    id: 'prospects',
    icon: Users,
    title: 'Fiche prospect',
    caption: 'Un statut et tout l’historique, du premier contact à l’affaire signée.',
    Body: PipelinePanel,
    span: 'lg:col-span-4'
  },
  {
    id: 'campagnes',
    icon: Megaphone,
    title: 'Nouvelle campagne',
    caption: 'Un message écrit une fois, personnalisé pour chaque entreprise.',
    Body: CampaignPanel,
    span: 'lg:col-span-4'
  },
  {
    id: 'envoi',
    icon: Send,
    title: 'Campagne en cours',
    caption: 'Envois espacés depuis votre sous-domaine, désinscrits ignorés.',
    Body: SendingPanel,
    span: 'lg:col-span-8'
  }
];

function Cell({ screen, active, delay }) {
  const { icon: Icon, title, caption, Body, span } = screen;

  return (
    <div
      className={`wt-reveal wt-console-frame overflow-hidden flex flex-col ${span}`}
      data-shown={active ? 'true' : 'false'}
      style={{ '--wt-delay': `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3.5 border-b border-line">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="mt-0.5 w-6 h-6 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-accent" />
          </span>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-fg truncate">{title}</div>
            <p className="text-[11px] text-fg-muted leading-snug mt-0.5">{caption}</p>
          </div>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle shrink-0">
          Démo
        </span>
      </div>

      <div className="p-4 sm:p-5 grow">
        <Body active={active} />
      </div>
    </div>
  );
}

export default function ProductShowcase() {
  const { ref, shown } = useReveal({ threshold: 0.1 });

  return (
    <div
      ref={ref}
      className="grid gap-5 lg:gap-6 lg:grid-cols-12 items-stretch"
    >
      {SCREENS.map((s, i) => (
        <Cell key={s.id} screen={s} active={shown} delay={i * 110} />
      ))}
    </div>
  );
}
