import { Check, Mail } from 'lucide-react';
import { Button, Badge } from '../components/ui';

const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

const PLANS = [
  {
    name: 'Starter',
    price: '49',
    pitch: 'Pour démarrer sa prospection',
    emails: '1 500 e-mails / mois',
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
    emails: '5 000 e-mails / mois',
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
    emails: '15 000 e-mails / mois',
    features: [
      'Prospects illimités',
      'Campagnes illimitées',
      'Campagnes actives illimitées',
      'Ciblage avancé sur la base entreprises France',
      'Domaine d’envoi dédié',
      'Désinscription automatique',
      'Interlocuteur dédié'
    ]
  }
];

export default function Pricing() {
  return (
    <section id="tarifs" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-4">
        <Badge tone="accent">Essai 14 jours · 100 e-mails · sans carte bancaire</Badge>
      </div>
      <h2 className="font-display font-extrabold text-3xl md:text-4xl text-fg text-center">
        Des tarifs simples
      </h2>
      <p className="text-fg-muted text-center mt-3 mb-12 max-w-xl mx-auto">
        Prospects illimités sur tous les plans. Vous ne payez que le volume d&apos;e-mails.
      </p>

      <div className="grid md:grid-cols-3 gap-6 items-start">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-surface rounded-2xl p-7 border transition-shadow ${
              plan.highlighted
                ? 'border-accent shadow-[var(--wt-shadow-lg)] md:-mt-3'
                : 'border-line shadow-[var(--wt-shadow)]'
            }`}
          >
            {plan.highlighted && (
              <span
                style={{ backgroundImage: 'var(--wt-gradient)' }}
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px]
                  font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              >
                Le plus choisi
              </span>
            )}
            <div className="text-[11px] font-bold uppercase tracking-widest text-accent mb-3">
              {plan.name}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-4xl text-fg">{plan.price}</span>
              <span className="text-fg-muted font-semibold">€ /mois</span>
            </div>
            <p className="text-fg-subtle text-xs mt-2 mb-5">{plan.pitch}</p>
            <div className="h-px bg-line mb-5" />
            <div className="font-display font-bold text-fg mb-5">{plan.emails}</div>
            <ul className="space-y-2.5 mb-7">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
                  <Check className="w-4 h-4 text-[var(--wt-success)] shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={CONTACT} className="block">
              <Button
                variant={plan.highlighted ? 'primary' : 'secondary'}
                icon={Mail}
                className="w-full"
              >
                Nous contacter
              </Button>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
