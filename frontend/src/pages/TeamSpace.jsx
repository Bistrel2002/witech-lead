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
    setIsAuthenticated(false);
  };

  // PASSWORD GATE VIEW (Secure Slate Blue HUD)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 font-sans text-slate-100">
        <div className="max-w-md w-full space-y-6 bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 mb-4 border border-blue-500/20">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Espace Collaborateurs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Veuillez saisir le mot de passe d'équipe pour accéder à la console
            </p>
          </div>

          {authError && (
            <div className="bg-red-950/40 border border-red-800 text-red-200 p-3 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all placeholder:text-slate-700"
                placeholder="Mot de passe d'équipe"
              />
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-900/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Vérification...' : 'Déverrouiller la Console'}
            </button>
          </form>

          <div className="text-center">
            <a href="/" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">Retour à l'accueil</a>
          </div>
        </div>
      </div>
    );
  }

  // MAIN TEAM VIEW
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-6 lg:p-10">
      
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase tracking-wider">
            <Users className="w-4 h-4 text-blue-500" />
            Espace Collaborateurs
          </div>
          <h1 className="text-3xl font-heading font-extrabold text-slate-900 mt-1">
            Tableau de Bord Commercial
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchStats(); fetchCampaigns(); }}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button
            onClick={handlePortalLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <LogOut className="w-4 h-4" />
            Quitter la Console
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Total Prospects */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Prospects CRM</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats.totalLeads}</p>
          </div>
        </div>

        {/* Contacted */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Prospects Contactés</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats.contactedLeads}</p>
          </div>
        </div>

        {/* Email Coverage Rate */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Couverture Emails</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats.emailCoverageRate}%</p>
          </div>
        </div>

        {/* Phone Coverage Rate */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Couverture Téléphones</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats.phoneCoverageRate}%</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Campaigns progress */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-heading font-extrabold text-lg text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-500" />
            Campagnes Récentes d'Équipe
          </h3>
          
          {campaigns.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Aucune campagne active détectée.</div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((c) => {
                const progress = c.total_leads > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_leads) * 100) : 0;
                return (
                  <div key={c.id} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{c.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Template : {c.template_name} | Canal : {c.channel}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        c.status === 'Active' ? 'bg-blue-50 text-blue-600 border border-blue-100 animate-pulse' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Progression</span>
                        <span className="font-bold">{progress}% ({c.sent_count} envoyés / {c.total_leads} cibles)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full ${c.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
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
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-heading font-extrabold text-lg text-slate-900 mb-4">Wi'Tech Team Guide</h3>
          <ul className="space-y-4 text-sm text-slate-600">
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              <span><strong>Dédoublonnage :</strong> Pensez à lancer le nettoyage périodique dans le gestionnaire principal pour garder la base CRM propre.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              <span><strong>Couverture de données :</strong> Utilisez de préférence la recherche hybride (Scrape Maps + Recherche Nationale) pour maximiser les emails détectés.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              <span><strong>Régulation Twilio :</strong> Les campagnes SMS/WhatsApp respectent un intervalle automatique de 5 secondes pour préserver la réputation des numéros.</span>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}
