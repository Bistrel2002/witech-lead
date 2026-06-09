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
  Info,
  Phone
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
    sender_signature: "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com",
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    twilio_whatsapp_number: ''
  });

  // Action states
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
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
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-heading font-extrabold text-slate-800">Configurations & Outils</h2>
        <p className="text-slate-500 text-sm mt-1">
          Paramétrez vos connexions SMTP, Twilio et gérez les exports de votre base de données.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SMTP Parameters */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 h-full flex flex-col justify-between">
            <div>
              <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-teal-600" />
                Serveur de Messagerie Sortante (SMTP)
              </h3>
              
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hôte SMTP *</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                      value={settings.smtp_host} onChange={(e) => handleInputChange('smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com, mail.gandi.net..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Port SMTP *</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                      value={settings.smtp_port} onChange={(e) => handleInputChange('smtp_port', e.target.value)}
                      placeholder="587, 465..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Utilisateur SMTP *</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                      value={settings.smtp_user} onChange={(e) => handleInputChange('smtp_user', e.target.value)}
                      placeholder="votre-email@gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mot de passe SMTP *</label>
                    <input 
                      type="password" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                      value={settings.smtp_pass} onChange={(e) => handleInputChange('smtp_pass', e.target.value)}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adresse Expéditeur (From)</label>
                    <input 
                      type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                      value={settings.smtp_from} onChange={(e) => handleInputChange('smtp_from', e.target.value)}
                      placeholder="laisser vide pour utiliser l'utilisateur"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom de l'Expéditeur (Name)</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                      value={settings.smtp_name} onChange={(e) => handleInputChange('smtp_name', e.target.value)}
                      placeholder="Ex: Wi'Tech Agency"
                    />
                  </div>
                </div>

                {/* Twilio Outreach Configuration (SMS/WhatsApp) */}
                <div className="border-t border-slate-100 pt-6 mt-6">
                  <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4 flex items-center gap-2">
                    <Phone className="w-5 h-5 text-teal-600" />
                    Configuration Twilio (SMS & WhatsApp Outreach)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Twilio Account SID</label>
                      <input 
                        type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                        value={settings.twilio_account_sid || ''} onChange={(e) => handleInputChange('twilio_account_sid', e.target.value)}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Twilio Auth Token</label>
                      <input 
                        type="password" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                        value={settings.twilio_auth_token || ''} onChange={(e) => handleInputChange('twilio_auth_token', e.target.value)}
                        placeholder="••••••••••••••••••••••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Numéro Expéditeur Twilio (SMS)</label>
                      <input 
                        type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                        value={settings.twilio_phone_number || ''} onChange={(e) => handleInputChange('twilio_phone_number', e.target.value)}
                        placeholder="Ex: +14155552671"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Numéro Expéditeur Twilio (WhatsApp)</label>
                      <input 
                        type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                        value={settings.twilio_whatsapp_number || ''} onChange={(e) => handleInputChange('twilio_whatsapp_number', e.target.value)}
                        placeholder="Ex: +14155238886"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-6 border-t border-slate-100 mt-6">
                  <button 
                    type="button" 
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleTestSmtp}
                    disabled={testing || !settings.smtp_host || !settings.smtp_user}
                  >
                    {testing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                        Vérification SMTP...
                      </>
                    ) : (
                      'Tester la Connexion'
                    )}
                  </button>
                  <button 
                    type="submit" 
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={saving}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Sauvegarde...' : 'Sauvegarder les Paramètres'}
                  </button>
                </div>
              </form>
            </div>

            {/* Test Connection Display Panel */}
            {testResult && (
              <div className={`mt-5 p-4 rounded-xl text-sm flex items-start gap-3 border ${
                testResult.success 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {testResult.success ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Connexion établie avec succès ! Le serveur SMTP de Witech Lead est prêt à l'envoi.</span>
                  </>
                ) : (
                  <>
                    <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <span>Échec de connexion : <strong>{testResult.error}</strong>.</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Agency profiles & backups */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 h-full flex flex-col justify-between">
            <div className="space-y-4 w-full">
              <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" />
                Profil Wi'Tech Agency
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom de votre SaaS</label>
                <input 
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={settings.company_name} onChange={(e) => handleInputChange('company_name', e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Site Internet de base</label>
                <input 
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={settings.company_website} onChange={(e) => handleInputChange('company_website', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Signature par défaut</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all min-h-[120px] font-mono text-xs"
                  value={settings.sender_signature} onChange={(e) => handleInputChange('sender_signature', e.target.value)}
                />
              </div>
            </div>

            <button 
              type="button" 
              className="w-full mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150"
              onClick={handleSaveSettings}
            >
              Sauvegarder le Profil
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Database panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
          <div>
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-3 flex items-center gap-2">
              <Download className="w-5 h-5 text-teal-600" />
              Sauvegarde de la Base (Export)
            </h3>
            <p className="text-slate-500 text-sm mb-5">
              Téléchargez l'intégralité de vos prospects qualifiés actuels au format JSON pour les sauvegarder ou les réutiliser sur un autre poste.
            </p>
            
            <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6">
              <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-slate-600">
                Votre base contient actuellement <strong>{leads.length}</strong> prospect(s) prêt(s) à l'exportation.
              </span>
            </div>
          </div>

          <button 
            type="button" 
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all duration-150"
            onClick={handleExportData}
          >
            Exporter la Base (.json)
          </button>
        </div>

        {/* Bulk Raw imports (CSV style copy-pastes) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
          <div>
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-3 flex items-center gap-2">
              <Upload className="w-5 h-5 text-teal-600" />
              Import Brut (CSV / JSON)
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              Copiez-collez des lignes brutes (séparées par des virgules : <strong>Nom, Catégorie, Site, Ville, Téléphone, Email</strong>) ou une chaîne JSON brute exportée.
            </p>
            <div className="mb-4">
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all min-h-[100px] font-mono" 
                placeholder="Dupont Plomberie, Plombier, http://dupont.fr, Paris, 0145228800, contact@dupont.fr&#10;SOS Menuisier, Menuisier, http://sosbois.fr, Lyon"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="button" 
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleBulkTextImport}
            disabled={!importText.trim()}
          >
            Lancer l'Importation de Masse
          </button>
        </div>
      </div>
    </div>
  );
}
