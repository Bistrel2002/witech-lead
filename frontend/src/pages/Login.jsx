import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, Globe, Smartphone } from 'lucide-react';

/* Marques officielles des fournisseurs, en SVG inline.
 *
 * Le « G » précédent n'était qu'un seul tracé rempli en #EA4335 : la forme du
 * logo Google peinte entièrement en rouge. La vraie marque est en quatre
 * couleurs, une par tracé, et c'est ce qui la rend reconnaissable.
 *
 * Google garde ses quatre couleurs dans les deux thèmes : un logo de
 * fournisseur ne se reteinte pas, c'est ce qui permet de l'identifier d'un
 * coup d'œil. Apple fait exception parce que sa propre charte le prévoit —
 * noir sur fond clair, blanc sur fond sombre — d'où currentColor plutôt
 * qu'un noir figé, qui disparaissait en thème sombre. */

function GoogleMark({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function AppleMark({ className = 'w-4 h-4 text-fg' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09v-.01z" />
      <path d="M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}


export default function Login({ apiHost, onLoginSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
    const payload = isSignup ? { email, password, name, phone } : { email, password };

    try {
      const res = await fetch(`${apiHost}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'Une erreur est survenue.');
      }
    } catch (err) {
      setError("Impossible de contacter le serveur d'authentification.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    if (provider === 'apple') {
      setError("La connexion avec Apple sera disponible dans la prochaine version.");
      return;
    }
    // origin + pathname, not origin alone: the app lives at /app.html and
    // the root now serves the vitrine, so sending the bare origin would
    // drop the user on the marketing page after a successful sign-in.
    // Using the current pathname keeps this correct wherever the app is
    // mounted, without hard-coding the filename.
    const redirectUri = encodeURIComponent(
      window.location.origin + window.location.pathname
    );
    window.location.href = `${apiHost}/api/auth/${provider}?redirect_uri=${redirectUri}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full space-y-8 bg-surface p-8 rounded-2xl shadow-xl border border-line transition-all">
        
        {/* Header Branding */}
        <div className="text-center">
          <div
            style={{ backgroundImage: 'var(--wt-gradient)' }}
            className="inline-flex w-12 h-12 rounded-2xl mb-4 shadow-[var(--wt-shadow)]"
          />
          <h2 className="text-3xl font-display font-extrabold text-fg tracking-tight">
            Wi'Tech <span className="text-accent">Lead</span>
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            {isSignup ? 'Créez votre compte CRM professionnel' : 'Connectez-vous à votre espace prospection'}
          </p>
        </div>

        {error && (
          <div className="bg-[var(--wt-danger-soft)] border-l-4 border-[var(--wt-danger)] text-[var(--wt-danger-fg)] p-4 rounded-r-lg text-sm" role="alert">
            <p className="font-semibold">Erreur</p>
            <p>{error}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md space-y-4">
            
            {isSignup && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1">Nom complet</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                      <User className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-surface-2 border border-line rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                      placeholder="Jean Dupont"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1">Téléphone (Optionnel)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                      <Smartphone className="w-5 h-5" />
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-surface-2 border border-line rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1">Adresse e-mail</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-surface-2 border border-line rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  placeholder="nom@entreprise.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1">Mot de passe</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-surface-2 border border-line rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-fg-subtle hover:text-fg-muted focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              style={{ backgroundImage: 'var(--wt-gradient)' }}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wt-fg)] shadow-[var(--wt-shadow-lg)] hover:brightness-110 active:scale-[.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Connexion en cours...' : isSignup ? "S'inscrire" : 'Se connecter'}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-3 text-fg-subtle font-medium">Ou continuer avec</span>
          </div>
        </div>

        {/* Social Mock OAuth */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleOAuth('google')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-line rounded-lg text-fg-muted text-sm font-medium hover:bg-surface-2 active:bg-surface-2 transition-all cursor-pointer shadow-sm"
          >
            <GoogleMark />
            Google
          </button>
          <button
            onClick={() => handleOAuth('apple')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-line rounded-lg text-fg-muted text-sm font-medium hover:bg-surface-2 active:bg-surface-2 transition-all cursor-pointer shadow-sm"
          >
            <AppleMark />
            Apple
          </button>
        </div>

        {/* Toggle link */}
        <div className="text-center mt-6">
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-sm font-medium text-accent hover:text-accent cursor-pointer"
          >
            {isSignup ? 'Déjà un compte ? Connectez-vous' : "Pas encore de compte ? S'inscrire"}
          </button>
        </div>

      </div>
    </div>
  );
}
