import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Send, 
  Settings as SettingsIcon,
  Zap,
  Globe
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import LeadsManager from './pages/LeadsManager';
import Campaigns from './pages/Campaigns';
import Settings from './pages/Settings';

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

  // Fetch leads from SQLite backend
  const loadLeadsFromApi = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_HOST}/api/leads`);
      if (res.ok) {
        const data = await res.json();
        // If database is empty, seed initial fallback data into UI state
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

  useEffect(() => {
    loadLeadsFromApi();
  }, []);

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

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <Zap style={{ color: '#00BC7D', fill: '#00BC7D', width: '22px', height: '22px' }} />
          <span>Wi'Tech <span className="accent">Lead</span></span>
        </div>
        
        <ul className="nav-links">
          <li>
            <div 
              className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActivePage('dashboard')}
            >
              <LayoutDashboard />
              Tableau de Bord
            </div>
          </li>
          <li>
            <div 
              className={`nav-item ${activePage === 'leads' ? 'active' : ''}`}
              onClick={() => setActivePage('leads')}
            >
              <Users />
              Prospects
            </div>
          </li>
          <li>
            <div 
              className={`nav-item ${activePage === 'campaigns' ? 'active' : ''}`}
              onClick={() => setActivePage('campaigns')}
            >
              <Send />
              Campagnes Outreach
            </div>
          </li>
          <li>
            <div 
              className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
              onClick={() => setActivePage('settings')}
            >
              <SettingsIcon />
              Configurations
            </div>
          </li>
        </ul>

        {/* Footer brand indicator */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', paddingLeft: '8px' }}>
          <p style={{ fontSize: '11px', color: '#555', fontWeight: 500 }}>
            Développé par
          </p>
          <a 
            href="https://www.witechagency.com" 
            target="_blank" 
            rel="noreferrer" 
            style={{ 
              fontSize: '12px', 
              color: '#87D6C2', 
              textDecoration: 'none', 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '2px'
            }}
          >
            Wi'Tech Agency
            <Globe style={{ width: '10px', height: '10px' }} />
          </a>
        </div>
      </div>

      {/* Main Panel Content Render */}
      <div className="main-content">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#a3a3a3' }}>
            <Zap style={{ width: '48px', height: '48px', color: '#00BC7D', animation: 'spin 1.5s linear infinite', marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', fontFamily: 'var(--font-heading)' }}>Initialisation de l'écosystème Witech Lead...</p>
          </div>
        ) : (
          renderActivePage()
        )}
      </div>
    </div>
  );
}
