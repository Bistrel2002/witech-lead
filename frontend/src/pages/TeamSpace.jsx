import React, { useState, useEffect } from 'react';
import { Users, Lock, LogOut, CheckCircle, Mail, Phone, RefreshCw, AlertTriangle, TrendingUp, Target } from 'lucide-react';

export default function TeamSpace({ apiHost }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  // Stats states
  const [stats, setStats] = useState({
    totalLeads: 0,
    contactedLeads: 0,
    wonLeads: 0,
    emailCoverageRate: 0,
    phoneCoverageRate: 0
  });
  const [campaigns, setCampaigns] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_MOCK_AUTH === 'true') {
      setIsAuthenticated(true);
    } else if (localStorage.getItem('witech_team_portal_token')) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchCampaigns();
    }
  }, [isAuthenticated]);

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setVerifying(true);

    try {
      const res = await fetch(`${apiHost}/api/auth/verify-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal: 'team', password })
      });
      const data = await res.json();

      if (res.ok) {
        if (data.token) {
          localStorage.setItem('witech_team_portal_token', data.token);
        }
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || 'Mot de passe incorrect.');
      }
    } catch (err) {
      setAuthError('Erreur de communication avec le serveur.');
    } finally {
      setVerifying(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${apiHost}/api/portal/team/leads-stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      // Direct call since the endpoint is already open or authenticated under standard routes
      const res = await fetch(`${apiHost}/api/campaigns`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.slice(0, 5)); // Keep latest 5
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  };

  const handlePortalLogout = async () => {
    await fetch(`${apiHost}/api/auth/logout-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'team' })
    });
    localStorage.removeItem('witech_team_portal_token');
    setIsAuthenticated(false);
  };

  // PASSWORD GATE VIEW (Secure Slate Blue HUD)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--wt-rail-bg)] px-4 font-sans text-[var(--wt-rail-fg)]">
        <div className="max-w-md w-full space-y-6 bg-white/5 border border-[var(--wt-rail-line)] p-8 rounded-2xl shadow-2xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 text-accent mb-4 border border-accent/20">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Espace Collaborateurs</h2>
            <p className="mt-2 text-sm text-fg-subtle">
              Veuillez saisir le mot de passe d'équipe pour accéder à la console
            </p>
          </div>

          {authError && (
            <div className="bg-[var(--wt-danger-soft)]/40 border border-[var(--wt-danger)] text-[var(--wt-danger-fg)] p-3 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[var(--wt-danger)]" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-muted">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-[var(--wt-rail-bg)] border border-[var(--wt-rail-line)] rounded-lg text-[var(--wt-rail-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/80 transition-all placeholder:text-fg"
                placeholder="Mot de passe d'équipe"
              />
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-accent hover:bg-accent text-white font-semibold text-sm shadow-lg shadow-blue-900/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Vérification...' : 'Déverrouiller la Console'}
            </button>
          </form>

          <div className="text-center">
            <a href="/" className="text-xs text-fg-muted hover:text-fg-subtle transition-colors">Retour à l'accueil</a>
          </div>
        </div>
      </div>
    );
  }

  // MAIN TEAM VIEW
  return (
    <div className="min-h-screen bg-surface-2 text-fg font-sans p-6 lg:p-10">
      
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-fg-muted text-sm font-semibold uppercase tracking-wider">
            <Users className="w-4 h-4 text-accent" />
            Espace Collaborateurs
          </div>
          <h1 className="text-3xl font-display font-extrabold text-fg mt-1">
            Tableau de Bord Commercial
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchStats(); fetchCampaigns(); }}
            className="flex items-center gap-2 px-4 py-2 border border-line bg-surface hover:bg-surface-2 text-fg-muted text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button
            onClick={handlePortalLogout}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--wt-rail-bg)] hover:bg-white/5 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <LogOut className="w-4 h-4" />
            Quitter la Console
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Total Prospects */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-subtle font-bold uppercase tracking-wider">Prospects CRM</p>
            <p className="text-2xl font-bold text-fg mt-0.5">{stats.totalLeads}</p>
          </div>
        </div>

        {/* Contacted */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-subtle font-bold uppercase tracking-wider">Prospects Contactés</p>
            <p className="text-2xl font-bold text-fg mt-0.5">{stats.contactedLeads}</p>
          </div>
        </div>

        {/* Email Coverage Rate */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-subtle font-bold uppercase tracking-wider">Couverture Emails</p>
            <p className="text-2xl font-bold text-fg mt-0.5">{stats.emailCoverageRate}%</p>
          </div>
        </div>

        {/* Phone Coverage Rate */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-fg-subtle font-bold uppercase tracking-wider">Couverture Téléphones</p>
            <p className="text-2xl font-bold text-fg mt-0.5">{stats.phoneCoverageRate}%</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Campaigns progress */}
        <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 className="font-display font-extrabold text-lg text-fg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Campagnes Récentes d'Équipe
          </h3>
          
          {campaigns.length === 0 ? (
            <div className="py-8 text-center text-fg-subtle text-sm">Aucune campagne active détectée.</div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((c) => {
                const progress = c.total_leads > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_leads) * 100) : 0;
                return (
                  <div key={c.id} className="p-4 border border-line rounded-xl hover:border-line transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-fg text-sm">{c.name}</h4>
                        <p className="text-xs text-fg-subtle mt-0.5">Template : {c.template_name} | Canal : {c.channel}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === 'Completed' ? 'bg-[var(--wt-success-soft)] text-[var(--wt-success)] border border-line' :
                        c.status === 'Active' ? 'bg-accent-soft text-accent border border-line animate-pulse' :
                        'bg-surface-2 text-fg-muted'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-fg-muted mb-1">
                        <span>Progression</span>
                        <span className="font-bold">{progress}% ({c.sent_count} envoyés / {c.total_leads} cibles)</span>
                      </div>
                      <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full ${c.status === 'Completed' ? 'bg-[var(--wt-success)]' : 'bg-accent'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Tips / Tools */}
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 className="font-display font-extrabold text-lg text-fg mb-4">Wi'Tech Team Guide</h3>
          <ul className="space-y-4 text-sm text-fg-muted">
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-[var(--wt-success)] mt-0.5" />
              <span><strong>Dédoublonnage :</strong> Pensez à lancer le nettoyage périodique dans le gestionnaire principal pour garder la base CRM propre.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-[var(--wt-success)] mt-0.5" />
              <span><strong>Couverture de données :</strong> Utilisez de préférence la recherche hybride (Scrape Maps + Recherche Nationale) pour maximiser les emails détectés.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-[var(--wt-success)] mt-0.5" />
              <span><strong>Temporisation des envois :</strong> Les campagnes e-mail respectent un intervalle automatique de 5 secondes entre chaque message, pour préserver la réputation d'envoi du domaine.</span>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}
