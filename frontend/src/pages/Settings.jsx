import React, { useState, useEffect } from 'react';
import {
  Mail,
  Settings as SettingsIcon,
  User,
  Check,
  X,
  Download,
  Upload,
  RefreshCw,
  Info
} from 'lucide-react';

export default function Settings({ apiHost, leads = [], reloadLeads, currentUser, setCurrentUser }) {
  const [sending, setSending] = useState({ status: 'pending', subdomain: null, replyTo: null, pausedAt: null });

  // User Profile States
  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    company_name: currentUser?.company_name || '',
    company_website: currentUser?.company_website || '',
    sender_signature: currentUser?.sender_signature || ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Sync profile form when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        company_name: currentUser.company_name || '',
        company_website: currentUser.company_website || '',
        sender_signature: currentUser.sender_signature || ''
      });
    }
  }, [currentUser]);

  const [importText, setImportText] = useState('');

  // Load sending status on mount
  useEffect(() => {
    loadSendingStatus();
  }, []);

  const loadSendingStatus = async () => {
    try {
      const res = await fetch(`${apiHost}/api/sending-status`, { credentials: 'include' });
      if (res.ok) setSending(await res.json());
    } catch (err) {
      console.error('Failed to load sending status', err);
    }
  };

  // Save profile modifications
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    try {
      const res = await fetch(`${apiHost}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        alert("✔️ Votre profil a été mis à jour avec succès !");
      } else {
        setProfileError(data.error || 'Erreur lors de la mise à jour.');
        alert(data.error || 'Erreur lors de la mise à jour.');
      }
    } catch (err) {
      console.error(err);
      setProfileError('Impossible de contacter le serveur.');
    } finally {
      setProfileSaving(false);
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
          Gérez votre profil, votre signature de prospection et les exports de votre base de données.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sending infrastructure — managed by the platform, nothing to configure */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-full">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-600" />
              Votre infrastructure d'envoi
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Aucune configuration requise. Wi'Tech Lead envoie vos campagnes depuis une
              infrastructure dédiée à votre compte.
            </p>

            {sending.pausedAt ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-red-50 border-red-200 text-red-800">
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Envoi suspendu.</strong> Le taux de plaintes de vos destinataires a dépassé
                  le seuil autorisé. Contactez le support pour rétablir l'envoi.
                </span>
              </div>
            ) : sending.status === 'verified' ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-emerald-50 border-emerald-200 text-emerald-800">
                <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Prêt à l'envoi.</strong> Vos e-mails partent au nom de{' '}
                  <strong>{profileForm.name}</strong>. Les réponses de vos prospects arrivent
                  directement dans <strong>{sending.replyTo}</strong>.
                </span>
              </div>
            ) : sending.status === 'failed' ? (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-amber-50 border-amber-200 text-amber-800">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  La préparation de votre infrastructure a échoué. Cliquez sur Actualiser, et
                  contactez le support si le problème persiste.
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-xl text-sm flex items-start gap-3 border bg-slate-50 border-slate-200 text-slate-700">
                <RefreshCw className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5 animate-spin" />
                <span>
                  <strong>Préparation en cours.</strong> Votre infrastructure d'envoi est en cours
                  de configuration — cela prend généralement quelques minutes.
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-6 mt-6 border-t border-slate-100">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm shadow-sm hover:bg-slate-50 active:scale-95 transition-all duration-150"
                onClick={loadSendingStatus}
              >
                <RefreshCw className="w-4 h-4 text-teal-600" />
                Actualiser
              </button>
            </div>
          </div>
        </div>

        {/* Agency profiles & backups */}
        <div className="lg:col-span-4 space-y-6">
          {/* User Profile Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4 w-full">
              <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" />
                Mon Profil
              </h3>

              {profileError && (
                <p className="bg-red-50 text-red-600 text-xs p-3 rounded-lg font-semibold border border-red-100">{profileError}</p>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom complet *</label>
                <input 
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adresse E-mail *</label>
                <input 
                  type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Numéro de téléphone (Optionnel)</label>
                <input 
                  type="tel" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
            </div>

            <button 
              type="button" 
              className="w-full mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150"
              onClick={handleSaveProfile}
              disabled={profileSaving}
            >
              {profileSaving ? 'Sauvegarde...' : 'Sauvegarder le Profil'}
            </button>
          </div>

          {/* Agency Settings Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="space-y-4 w-full">
              <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-2 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-teal-600" />
                Profil Wi'Tech Agency
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom de votre SaaS</label>
                <input 
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Site Internet de base</label>
                <input
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                  value={profileForm.company_website} onChange={(e) => setProfileForm({ ...profileForm, company_website: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Signature par défaut</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all min-h-[120px] font-mono text-xs"
                  value={profileForm.sender_signature} onChange={(e) => setProfileForm({ ...profileForm, sender_signature: e.target.value })}
                />
              </div>
            </div>

            <button
              type="button"
              className="w-full mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150"
              onClick={handleSaveProfile}
            >
              Sauvegarder les Paramètres
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
