import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Plus, 
  Send, 
  Pause, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  Eye, 
  Trash2, 
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Edit2,
  MessageSquare,
  Smartphone
} from 'lucide-react';

export default function Campaigns({ apiHost, leads = [], reloadLeads }) {
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeTab, setActiveTab] = useState('templates'); // templates, new-campaign, history
  
  // New Template state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '' });
  
  // New Campaign wizard state
  const [newCampaign, setNewCampaign] = useState({ name: '', template_id: '', category: '', channel: 'email' });
  const [campaignPreviewLeads, setCampaignPreviewLeads] = useState([]);
  const [selectedPreviewLeadIdx, setSelectedPreviewLeadIdx] = useState(0);
  
  // Active Campaign tracker
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Load Templates & Campaigns on Mount
  useEffect(() => {
    loadTemplates();
    loadCampaigns();
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${apiHost}/api/templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };

  const loadCampaigns = async () => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns`);
      if (res.ok) setCampaigns(await res.json());
    } catch (err) {
      console.error('Failed to load campaigns', err);
    }
  };

  // Poll active campaign status
  const startCampaignPolling = (campaignId) => {
    if (pollingInterval) clearInterval(pollingInterval);
    
    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiHost}/api/campaigns/${campaignId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedCampaignDetails(data);
          
          // Refresh list
          loadCampaigns();
          
          // Stop polling if completed or failed
          if (['Completed', 'Failed', 'Paused'].includes(data.campaign.status)) {
            clearInterval(interval);
            setPollingInterval(null);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    
    setPollingInterval(interval);
  };

  // Compile individual draft mock-previews on the client side
  const compileClientDraft = (text, lead) => {
    if (!text || !lead) return '';
    let compiled = text;
    
    const signature = "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com";
    const replacements = {
      company_name: lead.name || 'votre entreprise',
      website: lead.website || 'votre site internet',
      phone: lead.phone || 'votre numéro',
      city: lead.city || 'votre ville',
      sender_name: "Wi'Tech Agency",
      sender_signature: signature
    };

    Object.entries(replacements).forEach(([key, val]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      compiled = compiled.replace(regex, val);
    });

    return compiled;
  };

  // Filter categories depending on selected channel
  const uniqueCategoriesWithContacts = [...new Set(
    leads
      .filter(l => {
        if (newCampaign.channel === 'email') {
          return l.email && l.email.trim() !== '';
        } else {
          // SMS or WhatsApp require a valid phone number
          return l.phone && l.phone.trim() !== '';
        }
      })
      .map(l => l.category)
  )];

  // Update target leads preview when category or channel changes in wizard
  useEffect(() => {
    if (newCampaign.category) {
      const targets = leads.filter(l => {
        const hasCategory = l.category === newCampaign.category;
        if (newCampaign.channel === 'email') {
          return hasCategory && l.email && l.email.trim() !== '';
        } else {
          return hasCategory && l.phone && l.phone.trim() !== '';
        }
      });
      setCampaignPreviewLeads(targets);
      setSelectedPreviewLeadIdx(0);
    } else {
      setCampaignPreviewLeads([]);
    }
  }, [newCampaign.category, newCampaign.channel, leads]);

  // Handle Template Crud
  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingTemplate 
        ? `${apiHost}/api/templates/${editingTemplate.id}` 
        : `${apiHost}/api/templates`;
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm)
      });

      if (res.ok) {
        await loadTemplates();
        setShowTemplateForm(false);
        setEditingTemplate(null);
        setTemplateForm({ name: '', subject: '', body: '' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditTemplate = (tmpl) => {
    setEditingTemplate(tmpl);
    setTemplateForm({ name: tmpl.name, subject: tmpl.subject, body: tmpl.body });
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Voulez-vous supprimer ce modèle ?')) return;
    try {
      const res = await fetch(`${apiHost}/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) loadTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Campaign wizard launch
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaign.name || !newCampaign.template_id || !newCampaign.category) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    try {
      const res = await fetch(`${apiHost}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampaign.name,
          template_id: parseInt(newCampaign.template_id),
          category: newCampaign.category,
          channel: newCampaign.channel
        })
      });

      if (res.ok) {
        const campaign = await res.json();
        
        // Auto-trigger background delivery send
        await fetch(`${apiHost}/api/campaigns/${campaign.id}/start`, { method: 'POST' });
        
        await loadCampaigns();
        
        // Open campaign details panel immediately
        viewCampaignDetails(campaign.id);
        
        // Reset wizard
        setNewCampaign({ name: '', template_id: '', category: '', channel: 'email' });
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la création de la campagne');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const viewCampaignDetails = async (campaignId) => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCampaignDetails(data);
        setActiveTab('active-monitor');
        
        if (data.campaign.status === 'Active') {
          startCampaignPolling(campaignId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePauseCampaign = async (id) => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns/${id}/pause`, { method: 'POST' });
      if (res.ok) {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        viewCampaignDetails(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeCampaign = async (id) => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns/${id}/start`, { method: 'POST' });
      if (res.ok) {
        viewCampaignDetails(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Mailto Link Generator for Manual Outreach option
  const getMailtoLink = (lead, template) => {
    if (!lead || !template) return '#';
    const compiledSubject = compileClientDraft(template.subject, lead);
    const compiledBody = compileClientDraft(template.body, lead);
    return `mailto:${lead.email}?subject=${encodeURIComponent(compiledSubject)}&body=${encodeURIComponent(compiledBody)}`;
  };

  // SMS / WhatsApp Link Generator
  const getMessageLink = (lead, template, type) => {
    if (!lead || !template) return '#';
    const compiledBody = compileClientDraft(template.body, lead);
    const cleanPhone = lead.phone ? lead.phone.replace(/[\s\-\(\)]/g, '') : '';
    if (type === 'whatsapp') {
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(compiledBody)}`;
    }
    return `sms:${cleanPhone}?body=${encodeURIComponent(compiledBody)}`;
  };

  const handleCopyClipboard = (lead, template) => {
    const compiledBody = compileClientDraft(template.body, lead);
    navigator.clipboard.writeText(compiledBody);
    alert('📝 Message copié dans le presse-papier !');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-heading font-extrabold text-slate-800">Campagnes d'Outreach</h2>
        <p className="text-slate-500 text-sm mt-1">
          Configurez vos modèles et lancez des campagnes automatisées par Email, SMS ou WhatsApp.
        </p>
      </div>

      {/* Mini Tabs */}
      <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl border border-slate-200/80 max-w-2xl">
        <button 
          className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all duration-150 ${activeTab === 'templates' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={() => setActiveTab('templates')}
        >
          Modèles de Prospection
        </button>
        <button 
          className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all duration-150 ${activeTab === 'new-campaign' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={() => setActiveTab('new-campaign')}
        >
          Créateur de Campagne
        </button>
        <button 
          className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all duration-150 ${activeTab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={() => setActiveTab('history')}
        >
          Historique & Rapports
        </button>
        {selectedCampaignDetails && (
          <button 
            className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all duration-150 ${activeTab === 'active-monitor' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('active-monitor')}
          >
            Suivi : {selectedCampaignDetails.campaign.name}
          </button>
        )}
      </div>

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg">Modèles Disponibles</h3>
            {!showTemplateForm && (
              <button 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150" 
                onClick={() => { setShowTemplateForm(true); setEditingTemplate(null); setTemplateForm({ name: '', subject: '', body: '' }); }}
              >
                <Plus className="w-4 h-4" />
                Nouveau Modèle
              </button>
            )}
          </div>

          {showTemplateForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
              <h4 className="font-heading font-extrabold text-slate-800 text-base">{editingTemplate ? 'Modifier le modèle' : 'Créer un nouveau modèle'}</h4>
              <form onSubmit={handleTemplateSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom du Modèle *</label>
                  <input 
                    type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                    value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Ex: Witech - Pitch n8n Artisans"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Objet (Email seulement)</label>
                  <input 
                    type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                    value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    placeholder="Ex: Optimisation de la visibilité en ligne de {{company_name}}"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Corps du Message *</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {['company_name', 'website', 'phone', 'city', 'sender_name', 'sender_signature'].map(tag => (
                      <span 
                        key={tag} 
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-2 py-1 text-2xs text-teal-700 font-mono cursor-pointer transition-colors"
                        onClick={() => setTemplateForm({ ...templateForm, body: templateForm.body + ` {{${tag}}}` })}
                      >
                        +{tag}
                      </span>
                    ))}
                  </div>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all min-h-[160px] font-mono" required
                    value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                    placeholder="Saisissez votre message. Utilisez les tags ci-dessus pour insérer des variables dynamiques..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all duration-150" onClick={() => setShowTemplateForm(false)}>Annuler</button>
                  <button type="submit" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150">Sauvegarder</button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                    <h4 className="font-heading font-extrabold text-slate-800 text-base">{tmpl.name}</h4>
                    <div className="flex gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors" onClick={() => handleEditTemplate(tmpl)}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" onClick={() => handleDeleteTemplate(tmpl.id)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {tmpl.subject && (
                    <div className="mb-3">
                      <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-1">Sujet (Email) :</p>
                      <p className="text-sm text-slate-700 font-semibold">{tmpl.subject}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-1">Message :</p>
                    <p className="text-xs text-slate-500 whiteSpace-pre-wrap font-mono line-clamp-4 leading-relaxed">
                      {tmpl.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: NEW CAMPAIGN WIZARD */}
      {activeTab === 'new-campaign' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-5">Paramétrer la Campagne</h3>
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom de la Campagne *</label>
                <input 
                  type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                  value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="Ex: Campagne Plombiers Nantes SMS"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Canal de Prospection *</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border font-semibold text-xs transition-all ${newCampaign.channel === 'email' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                    onClick={() => setNewCampaign({ ...newCampaign, channel: 'email', category: '' })}
                  >
                    <Mail className="w-5 h-5 mb-1.5" />
                    Email
                  </button>
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border font-semibold text-xs transition-all ${newCampaign.channel === 'sms' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                    onClick={() => setNewCampaign({ ...newCampaign, channel: 'sms', category: '' })}
                  >
                    <Smartphone className="w-5 h-5 mb-1.5" />
                    SMS
                  </button>
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border font-semibold text-xs transition-all ${newCampaign.channel === 'whatsapp' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                    onClick={() => setNewCampaign({ ...newCampaign, channel: 'whatsapp', category: '' })}
                  >
                    <MessageSquare className="w-5 h-5 mb-1.5" />
                    WhatsApp
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Modèle de Message *</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                  value={newCampaign.template_id} onChange={(e) => setNewCampaign({ ...newCampaign, template_id: e.target.value })}
                >
                  <option value="">-- Sélectionnez un modèle --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Catégorie Cible *</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                  value={newCampaign.category} onChange={(e) => setNewCampaign({ ...newCampaign, category: e.target.value })}
                >
                  <option value="">-- Sélectionnez une catégorie --</option>
                  {uniqueCategoriesWithContacts.map(c => {
                    const count = leads.filter(l => {
                      const hasCat = l.category === c;
                      if (newCampaign.channel === 'email') {
                        return hasCat && l.email && l.email.trim() !== '';
                      } else {
                        return hasCat && l.phone && l.phone.trim() !== '';
                      }
                    }).length;
                    return (
                      <option key={c} value={c}>
                        {c} ({count} {newCampaign.channel === 'email' ? 'emails' : 'téléphones'} qualifiés)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 space-y-1">
                <h5 className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Prospection groupée intelligente
                </h5>
                <p className="text-slate-500 text-[11px] leading-normal">
                  {newCampaign.channel === 'email' 
                    ? "Les e-mails seront envoyés automatiquement via votre connexion SMTP avec une temporisation d'envoi pour protéger votre domaine."
                    : "Les messages mobiles (SMS/WhatsApp) seront planifiés dans la file d'attente et envoyés de manière espacée via l'API Twilio."}
                </p>
              </div>

              <button 
                type="submit" 
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={campaignPreviewLeads.length === 0 || !newCampaign.template_id}
              >
                Lancer la Campagne ({campaignPreviewLeads.length} cibles)
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[440px] flex flex-col justify-between">
            <div>
              <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-teal-600" />
                Aperçu du Draft Client
              </h3>

              {campaignPreviewLeads.length === 0 || !newCampaign.template_id ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Users className="w-12 h-12 opacity-30 mb-3" />
                  <p className="text-xs text-center max-w-[240px]">Sélectionnez un canal, un modèle et une catégorie pour simuler les messages.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                    <span className="text-xs text-slate-500 font-semibold">Destinataire {selectedPreviewLeadIdx + 1} sur {campaignPreviewLeads.length}</span>
                    <div className="flex gap-1.5">
                      <button 
                        className="px-2.5 py-1 rounded-lg font-semibold text-2xs bg-white border border-slate-200 text-slate-700 disabled:opacity-40"
                        disabled={selectedPreviewLeadIdx === 0}
                        onClick={() => setSelectedPreviewLeadIdx(selectedPreviewLeadIdx - 1)}
                      >
                        Précédent
                      </button>
                      <button 
                        className="px-2.5 py-1 rounded-lg font-semibold text-2xs bg-white border border-slate-200 text-slate-700 disabled:opacity-40"
                        disabled={selectedPreviewLeadIdx === campaignPreviewLeads.length - 1}
                        onClick={() => setSelectedPreviewLeadIdx(selectedPreviewLeadIdx + 1)}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>

                  {/* Message header preview */}
                  <div className="pb-3 border-b border-slate-100 space-y-1">
                    <p className="text-xs text-slate-500">
                      Canal : <span className="font-bold text-slate-700 uppercase">{newCampaign.channel}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Destinataire : <strong className="text-teal-700">
                        {newCampaign.channel === 'email' 
                          ? campaignPreviewLeads[selectedPreviewLeadIdx].email 
                          : campaignPreviewLeads[selectedPreviewLeadIdx].phone || 'Non renseigné'}
                      </strong> ({campaignPreviewLeads[selectedPreviewLeadIdx].name})
                    </p>
                    {newCampaign.channel === 'email' && (
                      <p className="text-xs text-slate-500">
                        Objet : <strong className="text-slate-800">
                          {compileClientDraft(
                            templates.find(t => t.id === parseInt(newCampaign.template_id))?.subject,
                            campaignPreviewLeads[selectedPreviewLeadIdx]
                          )}
                        </strong>
                      </p>
                    )}
                  </div>

                  {/* Message body preview */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono whiteSpace-pre-wrap overflow-y-auto max-h-[200px]">
                    {compileClientDraft(
                      templates.find(t => t.id === parseInt(newCampaign.template_id))?.body,
                      campaignPreviewLeads[selectedPreviewLeadIdx]
                    )}
                  </div>
                  
                  {/* Action triggers */}
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button" 
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all duration-150"
                      onClick={() => handleCopyClipboard(
                        campaignPreviewLeads[selectedPreviewLeadIdx],
                        templates.find(t => t.id === parseInt(newCampaign.template_id))
                      )}
                    >
                      Copier le corps
                    </button>
                    {newCampaign.channel === 'email' ? (
                      <a 
                        href={getMailtoLink(
                          campaignPreviewLeads[selectedPreviewLeadIdx],
                          templates.find(t => t.id === parseInt(newCampaign.template_id))
                        )}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150"
                      >
                        Ouvrir le client Mail
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <a 
                        href={getMessageLink(
                          campaignPreviewLeads[selectedPreviewLeadIdx],
                          templates.find(t => t.id === parseInt(newCampaign.template_id)),
                          newCampaign.channel
                        )}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150"
                      >
                        {newCampaign.channel === 'whatsapp' ? 'Ouvrir WhatsApp' : 'Ouvrir SMS'}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPAIGNS HISTORY LIST */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
          <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4">Historique des Campagnes</h3>
          
          {campaigns.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30 text-teal-600" />
              <h4 className="font-heading font-bold text-slate-700">Aucune campagne lancée</h4>
              <p className="text-xs mt-1">Vous pourrez suivre vos outreachs automatisés ici.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="p-4">Nom de la Campagne</th>
                    <th className="p-4">Canal</th>
                    <th className="p-4">Modèle</th>
                    <th className="p-4">Cibles</th>
                    <th className="p-4">Envoyés</th>
                    <th className="p-4">Échecs</th>
                    <th className="p-4">Date de Lancement</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {campaigns.map(camp => (
                    <tr key={camp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">{camp.name}</td>
                      <td className="p-4 text-xs font-semibold capitalize text-slate-600">{camp.channel || 'email'}</td>
                      <td className="p-4 text-slate-500">{camp.template_name}</td>
                      <td className="p-4 font-bold text-slate-800">{camp.total_leads}</td>
                      <td className="p-4 font-semibold text-emerald-600">{camp.sent_count}</td>
                      <td className={`p-4 font-semibold ${camp.failed_count > 0 ? 'text-red-500' : 'text-slate-400'}`}>{camp.failed_count}</td>
                      <td className="p-4 text-xs text-slate-400">{new Date(camp.created_at).toLocaleDateString()}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                          camp.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                          camp.status === 'Active' ? 'bg-teal-50 text-teal-700 border border-teal-100' : 
                          camp.status === 'Paused' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {camp.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs transition-colors" 
                          onClick={() => viewCampaignDetails(camp.id)}
                        >
                          Suivi
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACTIVE MONITOR */}
      {activeTab === 'active-monitor' && selectedCampaignDetails && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-5">Statut de la Campagne</h3>
            
            <div className="space-y-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Nom</span>
                <strong className="text-slate-800 text-sm font-bold">{selectedCampaignDetails.campaign.name}</strong>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Canal</span>
                <span className="text-slate-600 text-xs font-semibold capitalize">{selectedCampaignDetails.campaign.channel || 'email'}</span>
              </div>
              
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Gabarit de Message</span>
                <span className="text-slate-600 text-xs">{selectedCampaignDetails.campaign.template_name}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Progression</span>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mt-1 mb-2">
                  <span>{selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count} / {selectedCampaignDetails.campaign.total_leads} cibles</span>
                  <span>{Math.round(((selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count) / selectedCampaignDetails.campaign.total_leads) * 100)}%</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-600 rounded-full transition-all duration-300"
                    style={{ width: `${((selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count) / selectedCampaignDetails.campaign.total_leads) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Status Actions */}
              <div className="flex gap-2 pt-4 border-t border-slate-100">
                {selectedCampaignDetails.campaign.status === 'Active' ? (
                  <button className="flex-grow inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors" onClick={() => handlePauseCampaign(selectedCampaignDetails.campaign.id)}>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                ) : ['Paused', 'Pending'].includes(selectedCampaignDetails.campaign.status) ? (
                  <button className="flex-grow inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 transition-colors" onClick={() => handleResumeCampaign(selectedCampaignDetails.campaign.id)}>
                    <Play className="w-3.5 h-3.5" />
                    Reprendre
                  </button>
                ) : (
                  <button className="flex-grow inline-flex items-center justify-center px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-semibold text-xs cursor-not-allowed" disabled>
                    Campagne Terminée
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4 flex items-center justify-between">
              Rapports de distribution en temps réel
              {selectedCampaignDetails.campaign.status === 'Active' && (
                <RefreshCw className="w-4 h-4 text-teal-600 animate-spin" />
              )}
            </h3>
            
            <div className="overflow-x-auto border border-slate-100 rounded-xl max-h-[360px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="p-3">Prospect</th>
                    <th className="p-3">Coordonnées</th>
                    <th className="p-3">Heure</th>
                    <th className="p-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedCampaignDetails.logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-3 font-bold text-slate-800">{log.lead_name}</td>
                      <td className="p-3 text-slate-500">
                        {selectedCampaignDetails.campaign.channel === 'email' 
                          ? log.lead_email || '—' 
                          : log.lead_phone || '—'}
                      </td>
                      <td className="p-3 text-slate-400">
                        {log.sent_at ? new Date(log.sent_at).toLocaleTimeString() : 'En attente'}
                      </td>
                      <td className="p-3">
                        {log.status === 'Sent' ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Envoyé
                          </span>
                        ) : log.status === 'Failed' ? (
                          <span className="text-red-500 flex items-center gap-1 font-semibold" title={log.error_message}>
                            <XCircle className="w-3.5 h-3.5" />
                            Échec
                          </span>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            En attente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
