import { Check, Mail } from 'lucide-react';
import { Button } from '../components/ui';
import Reveal from './Reveal.jsx';

const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

/* U+00A0 inside each figure: with an ordinary space a narrow card can wrap
 * "1 500" as "1" / "500 e-mails". */
const PLANS = [
  {
    name: 'Starter',
    price: '49',
    pitch: 'Pour démarrer sa prospection',
    emails: '1 500',
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      '1 campagne active à la fois',
      'Recherche dans la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Tableau de bord de suivi'
    ]
  },
  {
    name: 'Pro',
    price: '99',
    pitch: 'Pour une prospection régulière',
    emails: '5 000',
    highlighted: true,
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      '3 campagnes actives en parallèle',
      'Ciblage avancé sur la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Tableau de bord de suivi'
    ]
  },
  {
    name: 'Agence',
    price: '249',
    pitch: 'Pour les gros volumes',
    emails: '15 000',
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      'Campagnes actives illimitées',
      'Ciblage avancé sur la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Tableau de bord de suivi',
      'Interlocuteur dédié'
    ]
  }
];

export default function Pricing() {
  return (
    <section id="tarifs" className="relative max-w-6xl mx-auto px-6 py-20 lg:py-24 scroll-mt-16">
      <Reveal className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Tarifs
        </span>
        <h2 className="font-display font-extrabold text-3xl lg:text-4xl text-fg tracking-[-0.02em] mt-4">
          Vous payez le volume, pas le nombre de prospects
        </h2>
        <p className="text-fg-muted mt-4 leading-relaxed">
          Prospects illimités sur les trois plans. Essai 14 jours, 100 e-mails inclus,
          sans carte bancaire.
        </p>
      </Reveal>

      {/* Cards stretch to a common height and the CTA is pushed down with
          mt-auto, so the three buttons align despite uneven feature counts. */}
      <div className="grid md:grid-cols-3 gap-6 lg:gap-7">
        {PLANS.map((plan, i) => (
          <Reveal
            key={plan.name}
            delay={i * 90}
            className={`relative flex flex-col rounded-2xl p-7 lg:p-8 ${
              plan.highlighted
                ? 'wt-plan-featured md:-mt-4 md:mb-4'
                : 'bg-surface border border-line shadow-[var(--wt-shadow)]'
            }`}
          >
            {plan.highlighted && (
              <span
                style={{ backgroundImage: 'var(--wt-gradient)' }}
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px]
                  font-bold uppercase tracking-[0.12em] px-3 py-1 rounded-full whitespace-nowrap"
              >
                Le plus choisi
              </span>
            )}

            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent mb-4">
              {plan.name}
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-5xl text-fg tracking-[-0.03em] tabular-nums">
                {plan.price}
              </span>
              <span className="text-fg-muted font-semibold text-sm">€ TTC /mois</span>
            </div>
            <p className="text-fg-subtle text-xs mt-2">{plan.pitch}</p>

            <div className="h-px bg-line my-6" />

            <div className="mb-6">
              <span className="font-display font-extrabold text-2xl text-fg tabular-nums">
                {plan.emails}
              </span>
              <span className="text-fg-muted text-sm font-medium"> e-mails / mois</span>
            </div>

            <ul className="space-y-3 mb-8 grow">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted leading-snug">
                  <Check className="w-4 h-4 text-[var(--wt-success)] shrink-0 mt-px" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              href={CONTACT}
              variant={plan.highlighted ? 'primary' : 'secondary'}
              icon={Mail}
              className="w-full"
              aria-label={`Nous contacter au sujet du plan ${plan.name}`}
            >
              Nous contacter
            </Button>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
