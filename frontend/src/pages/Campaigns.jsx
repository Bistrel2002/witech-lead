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
  Sparkles,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Edit2
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
  const [newCampaign, setNewCampaign] = useState({ name: '', template_id: '', category: '' });
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

  // Unique categories matching prospects with emails
  const uniqueCategoriesWithEmails = [...new Set(
    leads.filter(l => l.email && l.email.trim() !== '').map(l => l.category)
  )];

  // Update target leads preview when category changes in wizard
  useEffect(() => {
    if (newCampaign.category) {
      const targets = leads.filter(
        l => l.category === newCampaign.category && l.email && l.email.trim() !== ''
      );
      setCampaignPreviewLeads(targets);
      setSelectedPreviewLeadIdx(0);
    } else {
      setCampaignPreviewLeads([]);
    }
  }, [newCampaign.category, leads]);

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
          category: newCampaign.category
        })
      });

      if (res.ok) {
        const campaign = await res.json();
        
        // Auto-trigger background SMTP send
        await fetch(`${apiHost}/api/campaigns/${campaign.id}/start`, { method: 'POST' });
        
        await loadCampaigns();
        
        // Open campaign details panel immediately
        viewCampaignDetails(campaign.id);
        
        // Reset wizard
        setNewCampaign({ name: '', template_id: '', category: '' });
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

  const handleCopyClipboard = (lead, template) => {
    const compiledBody = compileClientDraft(template.body, lead);
    navigator.clipboard.writeText(compiledBody);
    alert('📧 Message copié dans le presse-papier !');
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-20">
        <div>
          <h2>Campagnes d'Outreach</h2>
          <p style={{ color: '#a3a3a3', fontSize: '14px', marginTop: '4px' }}>
            Configurez vos modèles d'emails et lancez des campagnes groupées intelligentes.
          </p>
        </div>
      </div>

      {/* Mini Tabs */}
      <div className="tab-container">
        <button 
          className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Modèles d'Emails
        </button>
        <button 
          className={`tab-btn ${activeTab === 'new-campaign' ? 'active' : ''}`}
          onClick={() => setActiveTab('new-campaign')}
        >
          Nouvelle Campagne (wizard)
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historique & Rapports
        </button>
        {selectedCampaignDetails && (
          <button 
            className={`tab-btn ${activeTab === 'active-monitor' ? 'active' : ''}`}
            onClick={() => setActiveTab('active-monitor')}
          >
            Suivi Campagne : {selectedCampaignDetails.campaign.name}
          </button>
        )}
      </div>

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex-between mb-20">
            <h3>Vos Modèles de Prospection</h3>
            {!showTemplateForm && (
              <button className="btn btn-primary btn-sm" onClick={() => { setShowTemplateForm(true); setEditingTemplate(null); setTemplateForm({ name: '', subject: '', body: '' }); }}>
                <Plus style={{ width: '14px' }} />
                Nouveau Modèle
              </button>
            )}
          </div>

          {showTemplateForm && (
            <div className="glass-panel mb-20" style={{ padding: '24px' }}>
              <h4>{editingTemplate ? 'Modifier le modèle' : 'Créer un nouveau modèle'}</h4>
              <form onSubmit={handleTemplateSubmit} style={{ marginTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Nom du Modèle *</label>
                  <input 
                    type="text" className="form-control" required
                    value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Ex: Witech - Web Design Plombiers"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sujet de l'Email *</label>
                  <input 
                    type="text" className="form-control" required
                    value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    placeholder="Ex: Amélioration de la visibilité en ligne de {{company_name}}"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Contenu de l'Email *</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {['company_name', 'website', 'phone', 'city', 'sender_name', 'sender_signature'].map(tag => (
                      <span 
                        key={tag} 
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#87D6C2', cursor: 'pointer' }}
                        onClick={() => setTemplateForm({ ...templateForm, body: templateForm.body + ` {{${tag}}}` })}
                      >
                        +{tag}
                      </span>
                    ))}
                  </div>
                  <textarea 
                    className="form-control" required
                    style={{ minHeight: '200px', fontFamily: 'monospace', fontSize: '13px' }}
                    value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                    placeholder="Ecrivez votre email ici..."
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTemplateForm(false)}>Annuler</button>
                  <button type="submit" className="btn btn-primary">Sauvegarder le Modèle</button>
                </div>
              </form>
            </div>
          )}

          <div className="row">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="col col-6">
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="flex-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '15px' }}>{tmpl.name}</h4>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px' }} onClick={() => handleEditTemplate(tmpl)}>
                        <Edit2 style={{ width: '12px' }} />
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px' }} onClick={() => handleDeleteTemplate(tmpl.id)}>
                        <Trash2 style={{ width: '12px', color: '#ef4444' }} />
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Sujet :</p>
                  <p style={{ fontSize: '13px', color: '#fff', fontWeight: 500, marginBottom: '12px' }}>{tmpl.subject}</p>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Aperçu du corps :</p>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', whiteSpace: 'pre-wrap', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                    {tmpl.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: NEW CAMPAIGN WIZARD */}
      {activeTab === 'new-campaign' && (
        <div className="row">
          <div className="col col-6">
            <div className="glass-panel">
              <h3 style={{ marginBottom: '16px' }}>Créer une Nouvelle Campagne</h3>
              <form onSubmit={handleCreateCampaign}>
                <div className="form-group">
                  <label className="form-label">Nom de la Campagne *</label>
                  <input 
                    type="text" className="form-control" required
                    value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    placeholder="Ex: Campagne Plombiers Paris n8n"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Choisir un Modèle d'Email *</label>
                  <select 
                    className="form-control" required
                    value={newCampaign.template_id} onChange={(e) => setNewCampaign({ ...newCampaign, template_id: e.target.value })}
                  >
                    <option value="">-- Sélectionnez un modèle --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Sélectionner la Catégorie cible *</label>
                  <select 
                    className="form-control" required
                    value={newCampaign.category} onChange={(e) => setNewCampaign({ ...newCampaign, category: e.target.value })}
                  >
                    <option value="">-- Sélectionnez une catégorie --</option>
                    {uniqueCategoriesWithEmails.map(c => (
                      <option key={c} value={c}>{c} ({leads.filter(l => l.category === c && l.email && l.email.trim() !== '').length} emails qualifiés)</option>
                    ))}
                  </select>
                </div>

                <div style={{ background: 'rgba(0,188,125,0.03)', border: '1px solid rgba(0,188,125,0.1)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                  <h5 style={{ fontSize: '13px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Send style={{ width: '14px', color: '#00BC7D' }} />
                    Envoi Automatisé via SMTP
                  </h5>
                  <p style={{ fontSize: '11px', color: '#a3a3a3', marginTop: '4px' }}>
                    Les messages seront envoyés séquentiellement en arrière-plan avec un délai de 5 secondes pour préserver la réputation de votre adresse mail.
                  </p>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                  disabled={campaignPreviewLeads.length === 0 || !newCampaign.template_id}
                >
                  Démarrer la Campagne ({campaignPreviewLeads.length} cibles)
                </button>
              </form>
            </div>
          </div>

          <div className="col col-6">
            <div className="glass-panel" style={{ height: '100%', minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye style={{ width: '18px', color: '#87D6C2' }} />
                Aperçu des Drafts Clients
              </h3>

              {campaignPreviewLeads.length === 0 || !newCampaign.template_id ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666', padding: '40px 0' }}>
                  <Users style={{ width: '48px', height: '48px', opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontSize: '13px' }}>Sélectionnez un modèle et une catégorie pour générer les aperçus.</p>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="flex-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', color: '#a3a3a3' }}>Cible {selectedPreviewLeadIdx + 1} sur {campaignPreviewLeads.length}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="tab-btn" style={{ padding: '2px 8px', fontSize: '11px' }}
                        disabled={selectedPreviewLeadIdx === 0}
                        onClick={() => setSelectedPreviewLeadIdx(selectedPreviewLeadIdx - 1)}
                      >
                        Précédent
                      </button>
                      <button 
                        className="tab-btn" style={{ padding: '2px 8px', fontSize: '11px' }}
                        disabled={selectedPreviewLeadIdx === campaignPreviewLeads.length - 1}
                        onClick={() => setSelectedPreviewLeadIdx(selectedPreviewLeadIdx + 1)}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>

                  {/* Mail header preview */}
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', color: '#666' }}>À: <strong style={{ color: '#00BC7D' }}>{campaignPreviewLeads[selectedPreviewLeadIdx].email}</strong> ({campaignPreviewLeads[selectedPreviewLeadIdx].name})</p>
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Objet: <strong style={{ color: '#fff' }}>
                      {compileClientDraft(
                        templates.find(t => t.id === parseInt(newCampaign.template_id))?.subject,
                        campaignPreviewLeads[selectedPreviewLeadIdx]
                      )}
                    </strong></p>
                  </div>

                  {/* Mail body preview */}
                  <div style={{ 
                    flex: 1, 
                    background: 'rgba(0,0,0,0.4)', 
                    border: '1px solid rgba(255,255,255,0.04)', 
                    borderRadius: '10px', 
                    padding: '16px', 
                    fontSize: '13px', 
                    color: '#e5e7eb', 
                    whiteSpace: 'pre-wrap', 
                    fontFamily: 'monospace',
                    overflowY: 'auto',
                    maxHeight: '280px'
                  }}>
                    {compileClientDraft(
                      templates.find(t => t.id === parseInt(newCampaign.template_id))?.body,
                      campaignPreviewLeads[selectedPreviewLeadIdx]
                    )}
                  </div>
                  
                  {/* Manual mailto action queue helper */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                      onClick={() => handleCopyClipboard(
                        campaignPreviewLeads[selectedPreviewLeadIdx],
                        templates.find(t => t.id === parseInt(newCampaign.template_id))
                      )}
                    >
                      Copier le corps
                    </button>
                    <a 
                      href={getMailtoLink(
                        campaignPreviewLeads[selectedPreviewLeadIdx],
                        templates.find(t => t.id === parseInt(newCampaign.template_id))
                      )}
                      className="btn btn-primary btn-sm" style={{ flex: 1 }}
                    >
                      Ouvrir Mail Client
                      <ExternalLink style={{ width: '12px' }} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPAIGNS HISTORY LIST */}
      {activeTab === 'history' && (
        <div className="glass-panel">
          <h3 style={{ marginBottom: '16px' }}>Historique de vos Campagnes</h3>
          
          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#666' }}>
              <Clock style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', opacity: 0.3 }} />
              <h4>Aucune campagne lancée</h4>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>Vous pourrez suivre vos outreachs automatisés ici.</p>
            </div>
          ) : (
            <div className="table-container" style={{ marginTop: '0' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nom de la Campagne</th>
                    <th>Modèle</th>
                    <th>Cibles</th>
                    <th>Envoyés</th>
                    <th>Échecs</th>
                    <th>Date de Lancement</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(camp => (
                    <tr key={camp.id}>
                      <td><strong style={{ color: '#fff' }}>{camp.name}</strong></td>
                      <td><span style={{ fontSize: '13px', color: '#a3a3a3' }}>{camp.template_name}</span></td>
                      <td><strong style={{ color: '#fff' }}>{camp.total_leads}</strong></td>
                      <td><span style={{ color: '#00BC7D', fontWeight: 600 }}>{camp.sent_count}</span></td>
                      <td><span style={{ color: camp.failed_count > 0 ? '#ef4444' : '#666' }}>{camp.failed_count}</span></td>
                      <td><span style={{ fontSize: '12px', color: '#666' }}>{new Date(camp.created_at).toLocaleDateString()}</span></td>
                      <td>
                        <span className={`badge ${
                          camp.status === 'Completed' ? 'badge-replied' : 
                          camp.status === 'Active' ? 'badge-contacting' : 
                          camp.status === 'Paused' ? 'badge-warm' : 'badge-new'
                        }`}>
                          {camp.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => viewCampaignDetails(camp.id)}>
                          Suivi
                          <ChevronRight style={{ width: '12px' }} />
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
        <div className="row">
          <div className="col col-4">
            <div className="glass-panel" style={{ height: '100%' }}>
              <h3 style={{ marginBottom: '16px' }}>Status de la Campagne</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', textTransform: 'uppercase' }}>Nom</span>
                <strong style={{ color: '#fff', fontSize: '15px' }}>{selectedCampaignDetails.campaign.name}</strong>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', textTransform: 'uppercase' }}>Gabarit d'email</span>
                <span style={{ color: '#a3a3a3', fontSize: '14px' }}>{selectedCampaignDetails.campaign.template_name}</span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', textTransform: 'uppercase' }}>Progression</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', margin: '4px 0', color: '#fff' }}>
                  <span>{selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count} / {selectedCampaignDetails.campaign.total_leads} cibles</span>
                  <span>{Math.round(((selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count) / selectedCampaignDetails.campaign.total_leads) * 100)}%</span>
                </div>
                {/* Progress bar container */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    background: 'var(--primary)', 
                    width: `${((selectedCampaignDetails.campaign.sent_count + selectedCampaignDetails.campaign.failed_count) / selectedCampaignDetails.campaign.total_leads) * 100}%`,
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
              </div>

              {/* Status Actions */}
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                {selectedCampaignDetails.campaign.status === 'Active' ? (
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => handlePauseCampaign(selectedCampaignDetails.campaign.id)}>
                    <Pause style={{ width: '12px' }} />
                    Pause
                  </button>
                ) : ['Paused', 'Pending'].includes(selectedCampaignDetails.campaign.status) ? (
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleResumeCampaign(selectedCampaignDetails.campaign.id)}>
                    <Play style={{ width: '12px' }} />
                    Reprendre
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-sm btn-disabled" style={{ flex: 1 }} disabled>
                    Campagne Terminée
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="col col-8">
            <div className="glass-panel" style={{ height: '100%' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyBreak: 'space-between', gap: '8px' }}>
                Rapports de distribution en temps réel
                {selectedCampaignDetails.campaign.status === 'Active' && (
                  <RefreshCw style={{ width: '14px', color: '#00BC7D', animation: 'spin 1s linear infinite' }} />
                )}
              </h3>
              
              <div className="table-container" style={{ marginTop: '0', maxHeight: '320px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Prospect</th>
                      <th>Email</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCampaignDetails.logs.map(log => (
                      <tr key={log.id}>
                        <td><strong>{log.lead_name}</strong></td>
                        <td><span style={{ color: '#a3a3a3' }}>{log.lead_email || '—'}</span></td>
                        <td><span style={{ fontSize: '11px', color: '#555' }}>{log.sent_at ? new Date(log.sent_at).toLocaleTimeString() : 'En attente'}</span></td>
                        <td>
                          {log.status === 'Sent' ? (
                            <span style={{ color: '#00BC7D', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                              <CheckCircle style={{ width: '12px' }} />
                              Envoyé
                            </span>
                          ) : log.status === 'Failed' ? (
                            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }} title={log.error_message}>
                              <XCircle style={{ width: '12px' }} />
                              Échec
                            </span>
                          ) : (
                            <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                              <Clock style={{ width: '12px' }} />
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
        </div>
      )}
    </div>
  );
}
