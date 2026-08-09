import { Mail, ArrowRight } from 'lucide-react';
import { Button, ThemeToggle } from '../components/ui';
import Pricing from './Pricing.jsx';
import ProspectConsole from './ProspectConsole.jsx';
import Reveal from './Reveal.jsx';
import {
  CampaignPanel,
  SendingPanel,
  PipelinePanel,
  DashboardPanel
} from './FeaturePanels.jsx';
import { useReveal } from './useReveal.js';
import './landing.css';

const APP_URL = '/';
const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

/* Numbered because this genuinely is a sequence: a prospect cannot be
 * written to before it is found, or followed before it is contacted. The
 * connector line fills in the same order. */
const STEPS = [
  {
    n: '01',
    title: 'Trouver',
    text: 'Un métier, une ville. Les entreprises correspondantes entrent dans votre fichier avec leur adresse et leur contact.'
  },
  {
    n: '02',
    title: 'Écrire',
    text: 'Un modèle rédigé une fois, personnalisé pour chaque entreprise. Vous relisez au lieu d’écrire deux cents fois.'
  },
  {
    n: '03',
    title: 'Envoyer',
    text: 'Les envois partent d’un domaine qui vous est réservé, espacés pour protéger votre réputation d’expéditeur.'
  },
  {
    n: '04',
    title: 'Suivre',
    text: 'Chaque prospect porte un statut. Vous voyez qui a été contacté, qui a répondu, et où en est chaque campagne.'
  }
];

/* A spec sheet rather than headline statistics: the product has no usage
 * numbers worth quoting yet, and inventing them would break the rule that
 * nothing on this page may be fictional. These four rows are all verifiable
 * in the product today. */
const SPEC = [
  ['Sources', 'Google Maps + base des entreprises françaises'],
  ['Ciblage', 'Par métier et par ville'],
  ['Envoi', 'Sous-domaine d’expédition dédié à votre compte'],
  ['Conformité', 'Lien de désinscription dans chaque message']
];

/* One section per screen the customer actually works in. Full-width blocks
 * at the hero console's scale, not thumbnails — a product demo the reader
 * cannot read is decoration. */
const FEATURES = [
  {
    id: 'campagne',
    eyebrow: 'Création de campagne',
    title: 'Un modèle, écrit une fois',
    body: 'Vous choisissez une catégorie et une ville, vous rédigez un message, et vous y placez des variables. Chaque entreprise reçoit sa propre version — vous relisez au lieu d’écrire deux cents fois.',
    note: 'Le lien de désinscription est ajouté à chaque message, que vous pensiez à la variable ou non.',
    Panel: CampaignPanel
  },
  {
    id: 'envoi',
    eyebrow: 'Envoi',
    title: 'Vous lancez, le produit espace',
    body: 'Les messages partent depuis un sous-domaine réservé à votre compte, étalés dans le temps pour protéger votre réputation d’expéditeur. Vous suivez la progression en direct.',
    note: 'Les adresses désinscrites sont ignorées automatiquement, jamais recontactées.',
    Panel: SendingPanel,
    flip: true
  },
  {
    id: 'suivi',
    eyebrow: 'Suivi des prospects',
    title: 'Chaque prospect avance, et vous le voyez',
    body: 'Un statut par prospect, du premier contact à l’affaire signée. Vous ouvrez la liste et vous savez qui relancer aujourd’hui, sans tenir de tableur à côté.',
    note: 'C’est ce qui en fait un CRM et non un simple outil d’envoi.',
    Panel: PipelinePanel
  },
  {
    id: 'tableau-de-bord',
    eyebrow: 'Tableau de bord',
    title: 'Vos chiffres, sans les compter',
    body: 'La répartition de vos prospects par statut et le volume par métier, tenus à jour à mesure que vos campagnes tournent. Vous voyez d’un coup d’œil ce qui remplit votre pipeline et ce qui reste à traiter.',
    note: 'Les chiffres affichés ici sont un exemple : le tableau de bord se remplit avec vos propres données.',
    Panel: DashboardPanel,
    flip: true
  }
];

function FeatureSection({ feature }) {
  const { ref, shown } = useReveal({ threshold: 0.15 });
  const { eyebrow, title, body, note, Panel, flip } = feature;

  return (
    <div ref={ref} className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
      <div className={flip ? 'lg:order-2' : undefined}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </span>
        <h3 className="font-display font-extrabold text-2xl lg:text-3xl text-fg tracking-[-0.02em] mt-3 mb-4">
          {title}
        </h3>
        <p className="text-fg-muted leading-relaxed">{body}</p>
        <p className="text-fg-subtle text-sm leading-relaxed mt-4 pl-4 border-l-2 border-line">
          {note}
        </p>
      </div>
      <div
        className="wt-reveal"
        data-shown={shown ? 'true' : 'false'}
        style={{ '--wt-delay': '80ms' }}
      >
        <Panel active={shown} />
      </div>
    </div>
  );
}

function Pipeline() {
  const { ref, shown } = useReveal({ threshold: 0.25 });

  return (
    <div ref={ref} className="relative">
      {/* Connector sits behind the numbers, desktop only — stacked cards on
          mobile have no line to draw. */}
      <div className="hidden lg:block wt-pipe" data-shown={shown ? 'true' : 'false'} />

      <ol className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className="wt-reveal relative"
            data-shown={shown ? 'true' : 'false'}
            style={{ '--wt-delay': `${i * 90}ms` }}
          >
            <span
              className="relative z-10 inline-flex items-center justify-center w-11 h-11 rounded-xl
                bg-surface border border-line font-display font-bold text-sm text-accent
                shadow-[var(--wt-shadow)]"
            >
              {s.n}
            </span>
            <h3 className="font-display font-bold text-lg text-fg mt-4 mb-2">{s.title}</h3>
            <p className="text-fg-muted text-sm leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg font-body">

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-bg/70 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href={APP_URL} className="flex items-center gap-2.5 no-underline">
            <span
              style={{ backgroundImage: 'var(--wt-gradient)' }}
              className="w-8 h-8 rounded-xl"
            />
            <span className="font-display font-extrabold text-lg text-fg tracking-tight">
              Wi’Tech <span className="text-accent">Lead</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <a
              href="#tarifs"
              className="hidden sm:block text-sm font-semibold text-fg-muted hover:text-accent transition-colors"
            >
              Tarifs
            </a>
            <ThemeToggle />
            <Button href={APP_URL} size="sm" variant="secondary">Se connecter</Button>
          </div>
        </div>
      </header>

      <main>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="wt-bloom" aria-hidden="true" />
          <div className="wt-grid-veil" aria-hidden="true" />

          <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
            <div className="grid lg:grid-cols-[1fr_1.08fr] gap-12 lg:gap-14 items-center">

              <div>
                <span
                  className="wt-rise inline-flex items-center gap-2 text-[11px] font-semibold
                    uppercase tracking-[0.16em] text-accent bg-accent-soft border border-line
                    rounded-full px-3 py-1.5"
                  style={{ '--wt-delay': '0ms' }}
                >
                  CRM de prospection B2B
                </span>

                <h1
                  className="wt-rise font-display font-extrabold text-fg mt-6
                    text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.1rem] tracking-[-0.03em]"
                  style={{ '--wt-delay': '80ms' }}
                >
                  Vos prochains clients sont{' '}
                  <span className="text-accent">déjà sur la carte</span>.
                </h1>

                <p
                  className="wt-rise text-fg-muted text-lg leading-relaxed mt-6 max-w-xl"
                  style={{ '--wt-delay': '160ms' }}
                >
                  Wi’Tech Lead trouve les entreprises françaises de votre secteur, écrit
                  à chacune, et suit qui répond. Vous n’apportez pas de liste — il la
                  construit.
                </p>

                <div
                  className="wt-rise flex flex-wrap items-center gap-3 mt-9"
                  style={{ '--wt-delay': '240ms' }}
                >
                  {/* grow so the two buttons fill the row once they wrap onto
                      separate lines on a phone; natural width from sm up. */}
                  <Button href={CONTACT} icon={Mail} className="grow sm:grow-0">
                    Demander un accès
                  </Button>
                  <Button href="#tarifs" variant="secondary" className="grow sm:grow-0">
                    Voir les tarifs
                  </Button>
                </div>

                <p
                  className="wt-rise text-fg-subtle text-xs mt-5"
                  style={{ '--wt-delay': '320ms' }}
                >
                  Essai 14 jours · 100 e-mails inclus · sans carte bancaire
                </p>
              </div>

              <div className="wt-rise lg:pl-4" style={{ '--wt-delay': '380ms' }}>
                <ProspectConsole />
              </div>

            </div>
          </div>
        </section>

        {/* ── The four stages ───────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-20 lg:py-24">
          <Reveal className="max-w-2xl mb-14">
            <h2 className="font-display font-extrabold text-3xl lg:text-4xl text-fg tracking-[-0.02em]">
              De la carte au premier rendez-vous
            </h2>
            <p className="text-fg-muted mt-4 leading-relaxed">
              Quatre temps, dans cet ordre. Le produit tient les quatre — c’est ce qui
              en fait un CRM et non un simple outil d’envoi.
            </p>
          </Reveal>

          <Pipeline />
        </section>

        {/* ── The three screens, at full scale ──────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 pb-4 space-y-20 lg:space-y-28">
          {FEATURES.map((f) => (
            <FeatureSection key={f.id} feature={f} />
          ))}
        </section>

        {/* ── The differentiator ────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 pb-20 lg:pb-24">
          <Reveal className="wt-console-frame overflow-hidden">
            <div className="grid lg:grid-cols-2">

              <div className="p-8 lg:p-12">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Ce que les autres ne font pas
                </span>
                <h2 className="font-display font-extrabold text-3xl text-fg mt-4 mb-5 tracking-[-0.02em]">
                  Vous ne cherchez plus. Vous choisissez.
                </h2>
                <p className="text-fg-muted leading-relaxed mb-4">
                  La plupart des outils de prospection supposent que vous arrivez avec
                  votre liste. Or la constituer, c’est précisément le travail que
                  personne ne veut faire — et celui qui vous prend vos matinées.
                </p>
                <p className="text-fg-muted leading-relaxed">
                  Wi’Tech Lead part de Google Maps et de la base des entreprises
                  françaises, et vous rend un fichier prêt à contacter.
                </p>
                <a
                  href="#tarifs"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent
                    hover:gap-2.5 transition-all mt-7 no-underline"
                >
                  Voir les volumes et les tarifs
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              {/* Spec sheet: mono labels, plain values, hairline rules. Reads
                  as a record rather than as marketing. */}
              <dl className="border-t lg:border-t-0 lg:border-l border-line bg-surface-2">
                {SPEC.map(([term, value], i) => (
                  <div
                    key={term}
                    className={`px-8 lg:px-10 py-6 grid grid-cols-[7.5rem_1fr] gap-4 items-baseline
                      ${i > 0 ? 'border-t border-line' : ''}`}
                  >
                    <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                      {term}
                    </dt>
                    <dd className="text-sm text-fg leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>

            </div>
          </Reveal>
        </section>

        <Pricing />

        {/* ── Close ─────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 py-20 lg:py-24 text-center">
          <Reveal>
            <h2 className="font-display font-extrabold text-3xl lg:text-4xl text-fg tracking-[-0.02em] mb-4">
              Dites-nous qui vous cherchez
            </h2>
            <p className="text-fg-muted mb-9 max-w-lg mx-auto leading-relaxed">
              Donnez-nous un métier et une zone. On vous montre ce que Wi’Tech Lead
              remonte, sur votre marché, avant que vous ne décidiez quoi que ce soit.
            </p>
            <Button href={CONTACT} icon={Mail}>contact@witechagency.com</Button>
          </Reveal>
        </section>

      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-fg-subtle text-xs">
            © {new Date().getFullYear()} Wi’Tech Agency — Tous droits réservés
          </span>
          <a
            href={APP_URL}
            className="text-fg-muted hover:text-accent text-xs font-semibold transition-colors"
          >
            Accéder à mon espace
          </a>
        </div>
      </footer>
    </div>
  );
}
