import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users as UsersIcon, 
  Send, 
  Settings as SettingsIcon,
  Zap,
  Globe,
  Menu,
  X,
  LogOut,
  Shield,
  Users
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import LeadsManager from './pages/LeadsManager';
import Campaigns from './pages/Campaigns';
import Settings from './pages/Settings';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';
import TeamSpace from './pages/TeamSpace';

const API_HOST = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Dynamic Fallback leads for premium initial visual seeding
const INITIAL_FALLBACK_LEADS = [
  {
    id: 991,
    name: 'Millet Plomberie Rénovation',
    category: 'Plombier',
    website: 'https://www.witechagency.com',
    phone: '01 42 33 88 12',
    email: null,
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Millet+Plomberie+Paris',
    status: 'New',
    city: 'Paris',
    address: '45 Rue de Rivoli, 75001 Paris',
    rating: 4.6,
    review_count: 87,
    has_ssl: 1,
    is_mobile_friendly: 1,
    has_chat_widget: 1,
    social_handles: JSON.stringify({ facebook: 'https://facebook.com/milletplomberie', instagram: null, linkedin: null }),
    tech_stack: 'WordPress',
    load_time_ms: 1200,
    notes: 'Prospect sans email identifié sur Google Maps. Cliquez sur le globe pour crawler son site internet !',
    scraped_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 992,
    name: 'Artisan Menuisier Lefebvre & Fils',
    category: 'Menuisier',
    website: 'http://www.menuiserie-lefebvre.fr',
    phone: '06 88 12 44 90',
    email: 'contact@menuiserie-lefebvre.fr',
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Menuisier+Lefebvre+Lyon',
    status: 'Contacted',
    city: 'Lyon',
    address: '12 Rue de la République, 69001 Lyon',
    rating: 4.8,
    review_count: 142,
    has_ssl: 0,
    is_mobile_friendly: 0,
    has_chat_widget: 0,
    social_handles: null,
    tech_stack: 'Wix',
    load_time_ms: 3800,
    notes: 'Prospect très intéressé par une automatisation de facturation sous n8n. Réponse reçue hier.',
    scraped_at: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 993,
    name: 'Studio Coiffure Design',
    category: 'Coiffeur',
    website: '',
    phone: '04 91 30 20 10',
    email: 'hello@studio-coiffure-design.fr',
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Studio+Coiffure+Marseille',
    status: 'Proposal Sent',
    city: 'Marseille',
    address: '8 Cours Julien, 13006 Marseille',
    rating: 3.9,
    review_count: 34,
    has_ssl: 0,
    is_mobile_friendly: 0,
    has_chat_widget: 0,
    social_handles: JSON.stringify({ facebook: null, instagram: 'https://instagram.com/studiocoiffuredesign', linkedin: null }),
    tech_stack: null,
    load_time_ms: null,
    notes: 'Pas de site web — Cible directe pour proposition web design Wi\'Tech.',
    scraped_at: new Date(Date.now() - 3600000 * 72).toISOString()
  },
  {
    id: 994,
    name: 'Les Compagnons Ebénistes',
    category: 'Menuisier',
    website: 'http://www.compagnons-ebenistes.fr',
    phone: '05 56 12 77 90',
    email: 'devis@compagnons-ebenistes.fr',
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Compagnons+Ebenistes+Bordeaux',
    status: 'New',
    city: 'Bordeaux',
    address: '22 Rue Sainte-Catherine, 33000 Bordeaux',
    rating: 4.2,
    review_count: 56,
    has_ssl: 1,
    is_mobile_friendly: 1,
    has_chat_widget: 0,
    social_handles: JSON.stringify({ facebook: 'https://facebook.com/compagnons-ebenistes', instagram: null, linkedin: 'https://linkedin.com/company/compagnons-ebenistes' }),
    tech_stack: 'Squarespace',
    load_time_ms: 1800,
    notes: 'Prospect qualifié. Site correct mais aucune automatisation détectée — Cible pour n8n.',
    scraped_at: new Date().toISOString()
  }
];

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authentication states
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [path, setPath] = useState(window.location.pathname);

  // Sync route path
  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Fetch leads from SQLite/PostgreSQL backend
  const loadLeadsFromApi = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_HOST}/api/leads`);
      if (res.ok) {
        const data = await res.json();
        if (data.length === 0) {
          setLeads(INITIAL_FALLBACK_LEADS);
        } else {
          setLeads(data);
        }
      } else {
        setLeads(INITIAL_FALLBACK_LEADS);
      }
    } catch (err) {
      console.warn('Backend API not available. Seeding mock leads for client demonstration.', err);
      setLeads(INITIAL_FALLBACK_LEADS);
    } finally {
      setLoading(false);
    }
  };

  // Check user authentication session on mount
  useEffect(() => {
    const checkSession = async () => {
      if (import.meta.env.VITE_MOCK_AUTH === 'true') {
        setUser({ id: 1, email: 'dev@witech.local', name: 'Developer Bypass', role: 'admin' });
        setCheckingSession(false);
        loadLeadsFromApi();
        return;
      }

      try {
        const res = await fetch(`${API_HOST}/api/auth/me`);
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          loadLeadsFromApi();
        } else {
          setUser(null);
        }
      } catch (err) {
        console.warn('Failed to verify session with backend.');
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    loadLeadsFromApi();
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_HOST}/api/auth/logout`, { method: 'POST' });
    } catch (_) {}
    setUser(null);
  };

  // Page switcher router component
  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard 
            apiHost={API_HOST} 
            leads={leads} 
            reloadLeads={loadLeadsFromApi} 
          />
        );
      case 'leads':
        return (
          <LeadsManager 
            apiHost={API_HOST} 
            leads={leads} 
            reloadLeads={loadLeadsFromApi} 
          />
        );
      case 'campaigns':
        return (
          <Campaigns 
            apiHost={API_HOST} 
            leads={leads} 
            reloadLeads={loadLeadsFromApi} 
          />
        );
      case 'settings':
        return (
          <Settings 
            apiHost={API_HOST} 
            leads={leads} 
            reloadLeads={loadLeadsFromApi} 
          />
        );
      default:
        return (
          <Dashboard 
            apiHost={API_HOST} 
            leads={leads} 
            reloadLeads={loadLeadsFromApi} 
          />
        );
    }
  };

  // 1. GATED PORTAL ROUTING CHECKS
  if (path === '/portal/admin-panel') {
    return <AdminPanel apiHost={API_HOST} />;
  }

  if (path === '/portal/team-space') {
    return <TeamSpace apiHost={API_HOST} />;
  }

  // 2. LOADING STATE
  if (checkingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-500 font-sans">
        <Zap className="w-12 h-12 text-teal-500 animate-bounce mb-4" />
        <p className="text-sm font-heading font-medium tracking-wide">Vérification de la session Witech Lead...</p>
      </div>
    );
  }

  // 3. UNAUTHENTICATED LOGIN PAGE
  if (!user) {
    return <Login apiHost={API_HOST} onLoginSuccess={handleLoginSuccess} />;
  }

  // 4. MAIN APP WITH NAVIGATION SIDEBAR
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Mobile Top Bar */}
      <div className="lg:hidden flex justify-between items-center bg-slate-900 text-white px-4 py-3 fixed top-0 left-0 w-full z-50 shadow-md">
        <div className="flex items-center gap-2">
          <Zap className="text-teal-400 fill-teal-400 w-5 h-5 animate-pulse" />
          <span className="font-heading font-heading font-extrabold text-lg">Wi'Tech <span className="text-teal-400">Lead</span></span>
        </div>
        <button className="text-slate-300 hover:text-white" onClick={() => setMobileMenuOpen(true)}>
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar backdrop overlay on mobile */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <div className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-slate-300 border-r border-slate-800 p-6 flex flex-col z-50 lg:z-30 transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-2">
            <Zap className="text-teal-400 fill-teal-400 w-6 h-6" />
            <span className="font-heading font-heading font-extrabold text-xl text-white">Wi'Tech <span className="text-teal-400">Lead</span></span>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <ul className="flex flex-col gap-1 list-none flex-grow">
          <li>
            <div 
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer font-medium text-sm transition-all duration-200 ${activePage === 'dashboard' ? 'text-white bg-teal-600/20 border border-teal-500/20 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
              onClick={() => { setActivePage('dashboard'); setMobileMenuOpen(false); }}
            >
              <LayoutDashboard className={`w-5 h-5 ${activePage === 'dashboard' ? 'text-teal-400' : ''}`} />
              Tableau de Bord
            </div>
          </li>
          <li>
            <div 
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer font-medium text-sm transition-all duration-200 ${activePage === 'leads' ? 'text-white bg-teal-600/20 border border-teal-500/20 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
              onClick={() => { setActivePage('leads'); setMobileMenuOpen(false); }}
            >
              <UsersIcon className={`w-5 h-5 ${activePage === 'leads' ? 'text-teal-400' : ''}`} />
              Prospects
            </div>
          </li>
          <li>
            <div 
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer font-medium text-sm transition-all duration-200 ${activePage === 'campaigns' ? 'text-white bg-teal-600/20 border border-teal-500/20 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
              onClick={() => { setActivePage('campaigns'); setMobileMenuOpen(false); }}
            >
              <Send className={`w-5 h-5 ${activePage === 'campaigns' ? 'text-teal-400' : ''}`} />
              Campagnes Outreach
            </div>
          </li>
          <li>
            <div 
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer font-medium text-sm transition-all duration-200 ${activePage === 'settings' ? 'text-white bg-teal-600/20 border border-teal-500/20 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
              onClick={() => { setActivePage('settings'); setMobileMenuOpen(false); }}
            >
              <SettingsIcon className={`w-5 h-5 ${activePage === 'settings' ? 'text-teal-400' : ''}`} />
              Configurations
            </div>
          </li>
        </ul>

        {/* User Card & Logout */}
        <div className="mt-auto border-t border-slate-800 pt-4">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-950/40 mb-3 border border-slate-800/30">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
              {user.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.role}</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg cursor-pointer transition-all"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>

        {/* Footer brand indicator */}
        <div className="border-t border-slate-800 pt-4 mt-3 pl-2">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-heading">
            Développé par
          </p>
          <a 
            href="https://www.witechagency.com" 
            target="_blank" 
            rel="noreferrer" 
            className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1.5 mt-1 transition-colors"
          >
            Wi'Tech Agency
            <Globe className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Main Panel Content Render */}
      <div className="flex-grow p-6 lg:p-10 w-full min-h-screen bg-slate-50 mt-14 lg:mt-0 overflow-x-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-slate-500">
            <Zap className="w-12 h-12 text-teal-500 animate-bounce mb-4" />
            <p className="text-sm font-heading font-medium tracking-wide">Initialisation de l'écosystème Witech Lead...</p>
          </div>
        ) : (
          renderActivePage()
        )}
      </div>
    </div>
  );
}
