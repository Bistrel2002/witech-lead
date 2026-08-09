import { Search, PenLine, Send, LineChart, Database, ShieldCheck, Mail } from 'lucide-react';
import { Button, ThemeToggle } from '../components/ui';
import Pricing from './Pricing.jsx';

const APP_URL = '/';
const CONTACT = 'mailto:contact@witechagency.com?subject=Demande%20d%27information%20Wi%27Tech%20Lead';

const STEPS = [
  { icon: Search, title: 'Trouver', text: 'Ciblez un métier et une ville. Wi’Tech Lead extrait les entreprises depuis Google Maps et la base des sociétés françaises.' },
  { icon: PenLine, title: 'Écrire', text: 'Rédigez un modèle une fois, personnalisé automatiquement pour chaque entreprise contactée.' },
  { icon: Send, title: 'Envoyer', text: 'Vos e-mails partent depuis votre propre domaine d’envoi. Aucune configuration technique de votre part.' },
  { icon: LineChart, title: 'Suivre', text: 'Chaque prospect a un statut, chaque campagne son rapport. Vous savez où vous en êtes, en permanence.' }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg font-body">

      <header className="sticky top-0 z-20 backdrop-blur bg-bg/80 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div style={{ backgroundImage: 'var(--wt-gradient)' }} className="w-8 h-8 rounded-xl" />
            <span className="font-display font-extrabold text-lg text-fg">
              Wi&apos;Tech <span className="text-accent">Lead</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#tarifs" className="hidden sm:block text-sm font-semibold text-fg-muted hover:text-accent transition-colors">
              Tarifs
            </a>
            <ThemeToggle />
            <a href={APP_URL}><Button size="sm" variant="secondary">Se connecter</Button></a>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="font-display font-extrabold text-4xl md:text-6xl text-fg leading-[1.08] max-w-4xl mx-auto">
          Le CRM de prospection qui <span className="text-accent">trouve</span> vos clients,
          puis les contacte pour vous
        </h1>
        <p className="text-fg-muted text-lg mt-6 max-w-2xl mx-auto">
          Trouvez des entreprises françaises ciblées, envoyez vos e-mails de prospection
          automatiquement, et suivez chaque réponse — dans un seul outil.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
          <a href={CONTACT}><Button icon={Mail}>Demander un accès</Button></a>
          <a href="#tarifs"><Button variant="secondary">Voir les tarifs</Button></a>
        </div>
        <p className="text-fg-subtle text-xs mt-4">
          Essai 14 jours · 100 e-mails inclus · sans carte bancaire
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="bg-surface border border-line rounded-2xl p-6 shadow-[var(--wt-shadow)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center">
                  <s.icon className="w-4.5 h-4.5 text-accent" />
                </div>
                <span className="text-[11px] font-bold text-fg-subtle">0{i + 1}</span>
              </div>
              <h3 className="font-display font-bold text-fg mb-2">{s.title}</h3>
              <p className="text-fg-muted text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="bg-surface border border-line rounded-3xl p-8 md:p-12 shadow-[var(--wt-shadow)]">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent mb-4">
                <Database className="w-3.5 h-3.5" /> Ce qui nous distingue
              </div>
              <h2 className="font-display font-extrabold text-3xl text-fg mb-4">
                La base des entreprises françaises, directement dans votre CRM
              </h2>
              <p className="text-fg-muted leading-relaxed mb-4">
                Les autres outils vous font envoyer des e-mails à une liste que vous devez
                constituer vous-même. Wi&apos;Tech Lead trouve les entreprises pour vous —
                par métier, par ville — et les fait entrer directement dans vos campagnes.
              </p>
              <p className="text-fg-muted leading-relaxed">
                Vous ne passez plus vos matinées à chercher des contacts. Vous prospectez.
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: ShieldCheck, t: 'Un domaine d’envoi rien qu’à vous', d: 'Votre réputation d’expéditeur ne dépend d’aucun autre client.' },
                { icon: ShieldCheck, t: 'Conforme dès le premier envoi', d: 'Lien de désinscription automatique dans chaque message.' },
                { icon: ShieldCheck, t: 'Zéro configuration technique', d: 'Aucun serveur d’e-mail à paramétrer. Vous créez votre compte et vous envoyez.' }
              ].map((b) => (
                <div key={b.t} className="flex gap-3 p-4 rounded-xl bg-surface-2 border border-line">
                  <b.icon className="w-4.5 h-4.5 text-[var(--wt-success)] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-fg text-sm">{b.t}</div>
                    <div className="text-fg-muted text-xs mt-1">{b.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Pricing />

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="font-display font-extrabold text-3xl text-fg mb-3">
          Parlons de votre prospection
        </h2>
        <p className="text-fg-muted mb-8">
          Dites-nous quel métier et quelle zone vous ciblez, nous vous montrons ce que
          Wi&apos;Tech Lead trouve pour vous.
        </p>
        <a href={CONTACT}><Button icon={Mail}>contact@witechagency.com</Button></a>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-fg-subtle text-xs">
            © {new Date().getFullYear()} Wi&apos;Tech Agency — Tous droits réservés
          </span>
          <a href={APP_URL} className="text-fg-muted hover:text-accent text-xs font-semibold transition-colors">
            Accéder à mon espace
          </a>
        </div>
      </footer>
    </div>
  );
}
