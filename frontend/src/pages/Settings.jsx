import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Settings as SettingsIcon, 
  Lock, 
  User, 
  Check, 
  X, 
  Save, 
  Download, 
  Upload,
  RefreshCw,
  Sparkles,
  Info
} from 'lucide-react';

export default function Settings({ apiHost, leads = [], reloadLeads }) {
  const [settings, setSettings] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_name: "Wi'Tech Agency",
    company_name: "Wi'Tech Agency",
    company_website: 'https://www.witechagency.com',
    sender_signature: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com"
  });

  // Action states
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, error?: string }
  const [importText, setImportText] = useState('');
  
  // Load Settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${apiHost}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  };

  const handleInputChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  // Save configurations in SQLite
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiHost}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("✔️ Configurations sauvegardées avec succès !");
      } else {
        alert("Erreur lors de la sauvegarde.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Test SMTP Credentials
  const handleTestSmtp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${apiHost}/api/settings/test-smtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: 'Impossible de contacter le serveur Express local.' });
    } finally {
      setTesting(false);
    }
  };

  // Export current SQLite leads database to JSON download file
  const handleExportData = () => {
    if (leads.length === 0) {
      alert("Votre base est actuellement vide.");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(leads, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `witech_leads_export_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Bulk Import CSV / JSON textarea copy-pastes
  const handleBulkTextImport = async () => {
    if (!importText.trim()) return;
    
    try {
      let leadsArray = [];
      
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(importText);
        leadsArray = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Fallback: Parse as custom CSV/tab listing (Name, Category, Website, City)
        const lines = importText.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          
          const parts = line.split(',');
          if (parts.length >= 2) {
            leadsArray.push({
              name: parts[0]?.trim(),
              category: parts[1]?.trim() || 'Plombier',
              website: parts[2]?.trim() || '',
              city: parts[3]?.trim() || '',
              phone: parts[4]?.trim() || '',
              email: parts[5]?.trim() || '',
              notes: 'Importé via copie-coller brut CSV.',
              status: 'New'
            });
          }
        }
      }

      if (leadsArray.length === 0) {
        alert("Format invalide. Fournissez soit du JSON valide soit des lignes séparées par des virgules (Nom, Catégorie, Site, Ville).");
        return;
      }

      const res = await fetch(`${apiHost}/api/leads/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customLeads: leadsArray })
      });

      if (res.ok) {
        await reloadLeads();
        alert(`🎉 Importation réussie de ${leadsArray.length} prospect(s) !`);
        setImportText('');
      } else {
        alert("Erreur lors de l'importation");
      }

    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de l'analyse.");
    }
  };

  return (
    <div>
      {/* Title Header */}
      <div className="flex-between mb-20">
        <div>
          <h2>Configurations & Outils</h2>
          <p style={{ color: '#a3a3a3', fontSize: '14px', marginTop: '4px' }}>
            Paramétrez vos connexions SMTP et gérez les exports de votre base de données.
          </p>
        </div>
      </div>

      <div className="row">
        {/* SMTP Parameters */}
        <div className="col col-8">
          <div className="glass-panel" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock style={{ width: '18px', color: '#00BC7D' }} />
              Serveur de Messagerie Sortante (SMTP)
            </h3>
            
            <form onSubmit={handleSaveSettings}>
              <div className="row">
                <div className="col col-8">
                  <div className="form-group">
                    <label className="form-label">Hôte SMTP *</label>
                    <input 
                      type="text" className="form-control" required
                      value={settings.smtp_host} onChange={(e) => handleInputChange('smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com, mail.gandi.net..."
                    />
                  </div>
                </div>
                <div className="col col-4">
                  <div className="form-group">
                    <label className="form-label">Port SMTP *</label>
                    <input 
                      type="text" className="form-control" required
                      value={settings.smtp_port} onChange={(e) => handleInputChange('smtp_port', e.target.value)}
                      placeholder="587, 465..."
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col col-6">
                  <div className="form-group">
                    <label className="form-label">Utilisateur SMTP *</label>
                    <input 
                      type="text" className="form-control" required
                      value={settings.smtp_user} onChange={(e) => handleInputChange('smtp_user', e.target.value)}
                      placeholder="votre-email@gmail.com"
                    />
                  </div>
                </div>
                <div className="col col-6">
                  <div className="form-group">
                    <label className="form-label">Mot de passe SMTP *</label>
                    <input 
                      type="password" className="form-control" required
                      value={settings.smtp_pass} onChange={(e) => handleInputChange('smtp_pass', e.target.value)}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col col-6">
                  <div className="form-group">
                    <label className="form-label">Adresse Expéditeur (From)</label>
                    <input 
                      type="email" className="form-control"
                      value={settings.smtp_from} onChange={(e) => handleInputChange('smtp_from', e.target.value)}
                      placeholder="laisser vide pour utiliser l'utilisateur"
                    />
                  </div>
                </div>
                <div className="col col-6">
                  <div className="form-group">
                    <label className="form-label">Nom de l'Expéditeur (Name)</label>
                    <input 
                      type="text" className="form-control"
                      value={settings.smtp_name} onChange={(e) => handleInputChange('smtp_name', e.target.value)}
                      placeholder="Ex: Wi'Tech Agency"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleTestSmtp}
                  disabled={testing || !settings.smtp_host || !settings.smtp_user}
                >
                  {testing ? (
                    <>
                      <RefreshCw style={{ width: '14px', animation: 'spin 1s linear infinite' }} />
                      Vérification SMTP...
                    </>
                  ) : (
                    'Tester la Connexion'
                  )}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save style={{ width: '14px' }} />
                  {saving ? 'Sauvegarde...' : 'Sauvegarder les Paramètres'}
                </button>
              </div>
            </form>

            {/* Test Connection Display Panel */}
            {testResult && (
              <div style={{ 
                marginTop: '16px', 
                padding: '12px 16px', 
                borderRadius: '10px', 
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: testResult.success ? 'rgba(0,188,125,0.05)' : 'rgba(239,68,68,0.05)',
                border: `1px solid ${testResult.success ? '#00BC7D' : '#ef4444'}`
              }}>
                {testResult.success ? (
                  <>
                    <Check style={{ width: '16px', color: '#00BC7D', flexShrink: 0 }} />
                    <span style={{ color: '#e5e7eb' }}>Connexion établie avec succès ! Le serveur SMTP de Witech Lead est prêt à l'envoi.</span>
                  </>
                ) : (
                  <>
                    <X style={{ width: '16px', color: '#ef4444', flexShrink: 0 }} />
                    <span style={{ color: '#e5e7eb' }}>Échec de connexion : <strong>{testResult.error}</strong>.</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Agency profiles & backups */}
        <div className="col col-4">
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User style={{ width: '18px', color: '#87D6C2' }} />
              Profil Wi'Tech Agency
            </h3>

            <div className="form-group">
              <label className="form-label">Nom de votre SaaS</label>
              <input 
                type="text" className="form-control"
                value={settings.company_name} onChange={(e) => handleInputChange('company_name', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Site Internet de base</label>
              <input 
                type="text" className="form-control"
                value={settings.company_website} onChange={(e) => handleInputChange('company_website', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Signature par défaut</label>
              <textarea 
                className="form-control"
                value={settings.sender_signature} onChange={(e) => handleInputChange('sender_signature', e.target.value)}
                style={{ minHeight: '100px', fontSize: '12px' }}
              />
            </div>

            <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={handleSaveSettings}>
              Sauvegarder le Profil
            </button>
          </div>
        </div>
      </div>

      <div className="row mt-20">
        {/* Backup Database panel */}
        <div className="col col-6">
          <div className="glass-panel" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download style={{ width: '18px', color: '#87D6C2' }} />
              Sauvegarde de la Base (Export)
            </h3>
            <p style={{ color: '#a3a3a3', fontSize: '13px', marginBottom: '20px' }}>
              Téléchargez l'intégralité de vos prospects qualifiés actuels au format JSON pour les sauvegarder ou les réutiliser sur un autre poste.
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', marginBottom: '20px' }}>
              <Info style={{ width: '16px', color: '#87D6C2', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#e5e7eb' }}>
                Votre base contient actuellement <strong>{leads.length}</strong> prospect(s) prêt(s) à l'exportation.
              </span>
            </div>

            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ width: '100%' }}
              onClick={handleExportData}
            >
              Exporter la Base (.json)
            </button>
          </div>
        </div>

        {/* Bulk Raw imports (CSV style copy-pastes) */}
        <div className="col col-6">
          <div className="glass-panel" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload style={{ width: '18px', color: '#00BC7D' }} />
              Import Brut (CSV / JSON)
            </h3>
            <p style={{ color: '#a3a3a3', fontSize: '13px', marginBottom: '12px' }}>
              Copiez-collez des lignes brutes (séparées par des virgules : <strong>Nom, Catégorie, Site, Ville, Téléphone, Email</strong>) ou une chaîne JSON brute exportée.
            </p>
            <div className="form-group">
              <textarea 
                className="form-control" 
                placeholder="Dupont Plomberie, Plombier, http://dupont.fr, Paris, 0145228800, contact@dupont.fr&#10;SOS Menuisier, Menuisier, http://sosbois.fr, Lyon"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                style={{ minHeight: '80px', fontSize: '11px', fontFamily: 'monospace' }}
              />
            </div>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={handleBulkTextImport}
              disabled={!importText.trim()}
            >
              Lancer l'Importation de Masse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
