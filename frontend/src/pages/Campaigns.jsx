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
  Smartphone,
  MinusCircle
} from 'lucide-react';

/**
 * SMS is deliberately disabled in-product. Mirrors SMS_UNAVAILABLE_MESSAGE in
 * backend/src/services/emailService.js, which is what actually refuses the
 * channel; this is only the reason shown before the click.
 */
const SMS_COMING_SOON_HINT =
  "Le canal SMS n'est pas encore disponible : il sera activé une fois la gestion des réponses STOP en place, comme l'exige la réglementation française.";

/**
 * Shown when the manual send actions are held back because the prospect's
 * unsubscribe link has not been obtained from the backend. Sending a
 * prospecting e-mail by hand does not make an opt-out link optional.
 */
const UNSUBSCRIBE_LINK_PENDING =
  "Le lien de désinscription de ce prospect n'est pas encore disponible. Chaque e-mail de prospection doit en contenir un — patientez quelques instants ou actualisez la page.";

export default function Campaigns({ apiHost, leads = [], reloadLeads, currentUser }) {
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

  // Platform sending status for this tenant. null = not yet known.
  const [sending, setSending] = useState(null);

  // Real unsubscribe link for the prospect currently shown in the preview.
  // The frontend cannot mint one: the token is an HMAC over a server-side
  // secret, so it comes from GET /api/unsubscribe-link.
  const [previewUnsubscribe, setPreviewUnsubscribe] = useState({ email: null, url: null });

  const loadSendingStatus = async () => {
    try {
      const res = await fetch(`${apiHost}/api/sending-status`, { credentials: 'include' });
      if (res.ok) setSending(await res.json());
    } catch (err) {
      console.error('Failed to load sending status', err);
    }
  };

  // Load Templates & Campaigns on Mount
  useEffect(() => {
    loadTemplates();
    loadCampaigns();
    loadSendingStatus();
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${apiHost}/api/templates`, { credentials: 'include' });
      if (res.ok) setTemplates(await res.json());
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };

  const loadCampaigns = async () => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns`, { credentials: 'include' });
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
        const res = await fetch(`${apiHost}/api/campaigns/${campaignId}`, { credentials: 'include' });
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

  /**
   * Client-side preview of a compiled draft.
   *
   * Mirrors compileTemplate in backend/src/services/emailService.js, including
   * its fallbacks — deliberately, and it must stay that way. This preview used
   * to default sender_name to "Wi'Tech Agency" and the signature to
   * "Cordialement,\nL'équipe Wi'Tech Agency\nhttps://www.witechagency.com",
   * which is the exact leak the backend was rewritten to eliminate: the mail
   * goes out under the TENANT's name, from the TENANT's mailbox, to the
   * TENANT's prospects, so a customer who had not set a signature and used
   * "Ouvrir Gmail" sent a pitch signed with the operator's agency name and
   * URL. Derive the fallback from the tenant, or say nothing.
   */
  const compileClientDraft = (text, lead, unsubscribeUrl) => {
    if (!text || !lead) return '';
    let compiled = text;

    const senderName = currentUser?.name || '';
    const replacements = {
      company_name: lead.name || 'votre entreprise',
      website: lead.website || 'votre site internet',
      phone: lead.phone || 'votre numéro',
      city: lead.city || 'votre ville',
      sender_name: senderName,
      sender_phone: currentUser?.phone || '',
      sender_signature:
        currentUser?.sender_signature || (senderName ? `Cordialement,\n${senderName}` : 'Cordialement,'),
      // Without this the tenant saw — and sent — the literal
      // {{unsubscribe_link}} the moment they used the merge tag.
      unsubscribe_link: unsubscribeUrl || ''
    };

    Object.entries(replacements).forEach(([key, val]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      compiled = compiled.replace(regex, val);
    });

    return compiled;
  };

  /**
   * Mirrors appendUnsubscribeNotice in backend/src/services/emailService.js.
   *
   * The preview has to show what actually leaves, and the manual mailto/Gmail
   * path has to carry a real opt-out: it is a genuine send to a genuine
   * prospect, and nothing about it being triggered by hand makes an
   * unsubscribe link optional.
   */
  const appendClientUnsubscribeNotice = (body, unsubscribeUrl) => {
    if (!unsubscribeUrl) return body;
    if (body && body.includes(unsubscribeUrl)) return body;
    return `${body || ''}\n\n---\nPour vous désinscrire et ne plus recevoir de messages de notre part : ${unsubscribeUrl}`;
  };

  /**
   * Why this campaign cannot be launched right now, or null.
   *
   * Mirrors assertChannelSendable on the backend, which is what actually
   * enforces it — this exists so the customer sees the reason before clicking
   * rather than after. `sending === null` means the status has not loaded yet;
   * we do not block on that, the backend's 400 is the real gate.
   */
  const sendingBlockReason = (() => {
    if (!sending) return null;
    if (sending.pausedAt) {
      return "Envoi suspendu pour ce compte suite à un taux de plainte trop élevé. Contactez le support.";
    }
    if (newCampaign.channel === 'email' && sending.status !== 'verified') {
      if (sending.status === 'failed') {
        return "La préparation de votre infrastructure d'envoi a échoué. Ouvrez « Configurations & Outils » et cliquez sur Actualiser, puis contactez le support si le problème persiste.";
      }
      return "Votre domaine d'envoi n'est pas encore vérifié — cela prend généralement quelques minutes après l'inscription. Vous pouvez suivre l'état dans « Configurations & Outils ».";
    }
    return null;
  })();

  /**
   * Progress of the campaign being monitored.
   *
   * Skipped recipients belong in the denominator's numerator: total_leads
   * counts every prospect, and a suppressed one increments neither sent_count
   * nor failed_count. Leaving it out made a 10-prospect campaign with 3
   * suppressed finish "Terminée" at "7 / 10 cibles — 70%", which reads as
   * three emails silently dropped.
   */
  const campaignProgress = (() => {
    const c = selectedCampaignDetails?.campaign;
    if (!c) return { processed: 0, total: 0, skipped: 0, percent: 0 };
    const skipped = c.skipped_count || 0;
    const processed = (c.sent_count || 0) + (c.failed_count || 0) + skipped;
    const total = c.total_leads || 0;
    return {
      processed,
      total,
      skipped,
      percent: total > 0 ? Math.round((processed / total) * 100) : 0
    };
  })();

  // Filter categories depending on selected channel
  const uniqueCategoriesWithContacts = [...new Set(
    leads
      .filter(l => {
        if (newCampaign.channel === 'email') {
          return l.email && l.email.trim() !== '';
        } else {
          // SMS requires a valid phone number
          return l.phone && l.phone.trim() !== '';
        }
      })
      .map(l => l.category)
  )];

  // Update target leads preview when category or channel changes in wizard
  useEffect(() => {
    if (newCampaign.category) {
      const targets = leads.filter(l => {
        let isSegmentMatch = false;
        if (newCampaign.category === '__WITH_WEBSITE__') {
          isSegmentMatch = !!(l.website && l.website.trim() !== '');
        } else if (newCampaign.category === '__WITHOUT_WEBSITE__') {
          isSegmentMatch = !(l.website && l.website.trim() !== '');
        } else if (newCampaign.category === '__WITH_EMAIL__') {
          isSegmentMatch = !!(l.email && l.email.trim() !== '');
        } else if (newCampaign.category === '__WITHOUT_EMAIL__') {
          isSegmentMatch = !(l.email && l.email.trim() !== '');
        } else {
          isSegmentMatch = l.category === newCampaign.category;
        }

        if (newCampaign.channel === 'email') {
          return isSegmentMatch && l.email && l.email.trim() !== '';
        } else {
          return isSegmentMatch && l.phone && l.phone.trim() !== '';
        }
      });
      setCampaignPreviewLeads(targets);
      setSelectedPreviewLeadIdx(0);
    } else {
      setCampaignPreviewLeads([]);
    }
  }, [newCampaign.category, newCampaign.channel, leads]);

  // The prospect the preview is currently showing.
  const previewLead = campaignPreviewLeads[selectedPreviewLeadIdx] || null;

  /**
   * Fetch the real unsubscribe link for the previewed prospect.
   *
   * Only ever for a lead the tenant owns, and always minted server-side: the
   * signing secret is platform config and must not reach the browser.
   */
  useEffect(() => {
    const email = newCampaign.channel === 'email' ? previewLead?.email : null;
    // No clearing needed: previewUnsubscribeUrl below only trusts a stored
    // link whose email matches the prospect on screen, so a leftover value
    // from the previous prospect is already inert.
    if (!email) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiHost}/api/unsubscribe-link?email=${encodeURIComponent(email)}`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setPreviewUnsubscribe({ email, url: res.ok && data.url ? data.url : null });
      } catch (err) {
        console.error('Failed to load unsubscribe link', err);
        if (!cancelled) setPreviewUnsubscribe({ email, url: null });
      }
    })();

    return () => { cancelled = true; };
  }, [apiHost, previewLead?.email, newCampaign.channel]);

  // Non-null only once the link for THIS prospect has come back, so a stale
  // link from the previously previewed prospect can never be sent.
  const previewUnsubscribeUrl =
    previewLead?.email && previewUnsubscribe.email === previewLead.email
      ? previewUnsubscribe.url
      : null;

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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm)
      });

      if (res.ok) {
        await loadTemplates();
        setShowTemplateForm(false);
        setEditingTemplate(null);
        setTemplateForm({ name: '', subject: '', body: '' });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Erreur lors de la sauvegarde (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      alert('Erreur réseau — vérifiez que le serveur backend est en marche.');
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
      const res = await fetch(`${apiHost}/api/templates/${id}`, { method: 'DELETE', credentials: 'include' });
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
    if (newCampaign.channel !== 'email') {
      // Belt and braces with the disabled channel button: nothing in this
      // component may post a non-email channel while SMS is switched off.
      alert(SMS_COMING_SOON_HINT);
      return;
    }
    if (sendingBlockReason) {
      alert(sendingBlockReason);
      return;
    }

    try {
      const isVirtual = ['__WITH_WEBSITE__', '__WITHOUT_WEBSITE__', '__WITH_EMAIL__', '__WITHOUT_EMAIL__'].includes(newCampaign.category);
      const payload = {
        name: newCampaign.name,
        template_id: parseInt(newCampaign.template_id),
        channel: newCampaign.channel
      };

      if (isVirtual) {
        payload.lead_ids = campaignPreviewLeads.map(l => l.id);
      } else {
        payload.category = newCampaign.category;
      }

      const res = await fetch(`${apiHost}/api/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const campaign = await res.json();
        
        // Auto-trigger background delivery send. /start now refuses with 400
        // and a readable French reason when this tenant cannot send (domain
        // not verified yet, account suspended), so surface it instead of
        // dropping the customer into a campaign that will silently Fail.
        const startRes = await fetch(`${apiHost}/api/campaigns/${campaign.id}/start`, { method: 'POST', credentials: 'include' });
        if (!startRes.ok) {
          const startData = await startRes.json().catch(() => ({}));
          alert(startData.error || "La campagne a été créée mais n'a pas pu démarrer.");
          loadSendingStatus();
        }

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
      const res = await fetch(`${apiHost}/api/campaigns/${campaignId}`, { credentials: 'include' });
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
      const res = await fetch(`${apiHost}/api/campaigns/${id}/pause`, { method: 'POST', credentials: 'include' });
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

  // Both of these re-enter the same background run, so both can now be
  // refused with 400 and a reason. Never swallow that silently.
  const runCampaignAction = async (id, action) => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns/${id}/${action}`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        viewCampaignDetails(id);
        return;
      }
      const data = await res.json().catch(() => ({}));
      alert(data.error || "La campagne n'a pas pu être relancée.");
      loadSendingStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeCampaign = (id) => runCampaignAction(id, 'start');

  const handleRestartCampaign = (id) => runCampaignAction(id, 'restart');

  /**
   * The body exactly as it would leave: merge tags compiled, then the
   * unsubscribe notice appended if the template does not already carry the
   * link — the same two steps, in the same order, as the SES send path.
   */
  const buildPreviewBody = (lead, template) =>
    appendClientUnsubscribeNotice(
      compileClientDraft(template?.body || '', lead, previewUnsubscribeUrl),
      previewUnsubscribeUrl
    );

  // Mailto Link Generator for Manual Outreach option
  const getMailtoLink = (lead, template) => {
    if (!lead || !template) return '#';
    const email = lead.email || '';
    const compiledSubject = compileClientDraft(template.subject || '', lead, previewUnsubscribeUrl);
    return `mailto:${email}?subject=${encodeURIComponent(compiledSubject)}&body=${encodeURIComponent(buildPreviewBody(lead, template))}`;
  };

  // Direct Gmail Web Compose Link Generator
  const getGmailLink = (lead, template) => {
    if (!lead || !template) return '#';
    const email = lead.email || '';
    const compiledSubject = compileClientDraft(template.subject || '', lead, previewUnsubscribeUrl);
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(compiledSubject)}&body=${encodeURIComponent(buildPreviewBody(lead, template))}`;
  };

  // SMS Link Generator. WhatsApp is not a channel the platform supports:
  // campaigns are email or sms only (see validateChannel on the backend).
  const getMessageLink = (lead, template) => {
    if (!lead || !template) return '#';
    const compiledBody = compileClientDraft(template.body || '', lead);
    const cleanPhone = lead.phone ? lead.phone.replace(/[\s\-\(\)]/g, '') : '';
    return `sms:${cleanPhone}?body=${encodeURIComponent(compiledBody)}`;
  };

  const handleCopyClipboard = (lead, template) => {
    if (!lead || !template) return;
    // Copying is a send too — the text is pasted straight into a mail client.
    if (newCampaign.channel === 'email' && !previewUnsubscribeUrl) {
      alert(UNSUBSCRIBE_LINK_PENDING);
      return;
    }
    navigator.clipboard.writeText(buildPreviewBody(lead, template));
    alert('📝 Message copié dans le presse-papier !');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-heading font-extrabold text-slate-800">Campagnes d'Outreach</h2>
        <p className="text-slate-500 text-sm mt-1">
          Configurez vos modèles et lancez des campagnes automatisées par e-mail. Le canal SMS arrive bientôt.
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
                    {/*
                      unsubscribe_link belongs in this list: without it the
                      merge tag is invisible to customers and never gets used
                      deliberately. A template that omits it still gets the
                      notice appended automatically before sending; including
                      it here lets a tenant place the link where they want it.
                    */}
                    {['company_name', 'website', 'phone', 'city', 'sender_name', 'sender_phone', 'sender_signature', 'unsubscribe_link'].map(tag => (
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
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border font-semibold text-xs transition-all ${newCampaign.channel === 'email' ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                    onClick={() => setNewCampaign({ ...newCampaign, channel: 'email', category: '' })}
                  >
                    <Mail className="w-5 h-5 mb-1.5" />
                    Email
                  </button>
                  {/*
                    SMS is built but switched off product-wide: the shared
                    alphanumeric Twilio Sender ID is one-way and cannot receive
                    the STOP replies French law requires for marketing SMS, so
                    an SMS campaign would have no opt-out at all. The button
                    stays visible and disabled rather than disappearing, so the
                    channel reads as planned rather than missing. The backend
                    refuses channel 'sms' as well — this is a label, not a gate.
                  */}
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={SMS_COMING_SOON_HINT}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border font-semibold text-xs transition-all bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed"
                  >
                    <Smartphone className="w-5 h-5 mb-1.5" />
                    SMS
                    <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Bientôt disponible
                    </span>
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Filtrer par Secteur / Métier (Issus de la base)</label>
                
                {/* Quick Sector Selector Buttons derived directly from DB leads */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${!newCampaign.category ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                    onClick={() => setNewCampaign({ ...newCampaign, category: '' })}
                  >
                    Toutes les catégories ({leads.length} prospects)
                  </button>
                  {uniqueCategoriesWithContacts.map(cat => {
                    const count = leads.filter(l => {
                      const matches = l.category === cat;
                      return newCampaign.channel === 'email' ? (matches && l.email && l.email.trim() !== '') : (matches && l.phone && l.phone.trim() !== '');
                    }).length;
                    const isSelected = newCampaign.category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isSelected ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50'}`}
                        onClick={() => setNewCampaign({ ...newCampaign, category: isSelected ? '' : cat })}
                      >
                        {cat} ({count} {newCampaign.channel === 'email' ? 'emails' : 'téléphones'})
                      </button>
                    );
                  })}
                </div>

                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Catégorie Cible Sélectionnée *</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                  value={newCampaign.category} onChange={(e) => setNewCampaign({ ...newCampaign, category: e.target.value })}
                >
                  <option value="">-- Sélectionnez une catégorie ou un segment --</option>
                  
                  <optgroup label="Segments Globaux (Tous métiers)">
                    {[
                      { key: '__WITH_WEBSITE__', label: 'Avec Site internet' },
                      { key: '__WITHOUT_WEBSITE__', label: 'Sans Site internet' },
                      { key: '__WITH_EMAIL__', label: 'Avec Adresse Email' },
                      { key: '__WITHOUT_EMAIL__', label: 'Sans Adresse Email' }
                    ].map(seg => {
                      const count = leads.filter(l => {
                        let matchesSegment = false;
                        if (seg.key === '__WITH_WEBSITE__') {
                          matchesSegment = !!(l.website && l.website.trim() !== '');
                        } else if (seg.key === '__WITHOUT_WEBSITE__') {
                          matchesSegment = !(l.website && l.website.trim() !== '');
                        } else if (seg.key === '__WITH_EMAIL__') {
                          matchesSegment = !!(l.email && l.email.trim() !== '');
                        } else if (seg.key === '__WITHOUT_EMAIL__') {
                          matchesSegment = !(l.email && l.email.trim() !== '');
                        }
                        
                        if (newCampaign.channel === 'email') {
                          return matchesSegment && l.email && l.email.trim() !== '';
                        } else {
                          return matchesSegment && l.phone && l.phone.trim() !== '';
                        }
                      }).length;
                      return (
                        <option key={seg.key} value={seg.key}>
                          {seg.label} ({count} {newCampaign.channel === 'email' ? 'emails' : 'téléphones'} qualifiés)
                        </option>
                      );
                    })}
                  </optgroup>

                  <optgroup label="Secteurs & Catégories de la Base de Données">
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
                  </optgroup>
                </select>
              </div>

              <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 space-y-1">
                <h5 className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Prospection groupée intelligente
                </h5>
                <p className="text-slate-500 text-[11px] leading-normal">
                  {newCampaign.channel === 'email' 
                    ? "Les e-mails seront envoyés automatiquement depuis votre infrastructure d'envoi dédiée, avec une temporisation pour protéger votre réputation."
                    : "Les messages SMS seront planifiés dans la file d'attente et envoyés de manière espacée via l'API Twilio."}
                </p>
              </div>

              {sendingBlockReason && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-800 text-[11px] leading-normal font-semibold">
                    {sendingBlockReason}
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={campaignPreviewLeads.length === 0 || !newCampaign.template_id || !!sendingBlockReason}
                title={sendingBlockReason || undefined}
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
                            campaignPreviewLeads[selectedPreviewLeadIdx],
                            previewUnsubscribeUrl
                          )}
                        </strong>
                      </p>
                    )}
                  </div>

                  {/*
                    Message body preview — the compiled body plus the appended
                    unsubscribe notice, i.e. what actually leaves. Showing the
                    body without the notice misrepresented every campaign.
                  */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono whiteSpace-pre-wrap overflow-y-auto max-h-[200px]">
                    {buildPreviewBody(
                      campaignPreviewLeads[selectedPreviewLeadIdx],
                      templates.find(t => t.id === parseInt(newCampaign.template_id))
                    )}
                  </div>

                  {newCampaign.channel === 'email' && !previewUnsubscribeUrl && (
                    <p className="text-[11px] leading-normal text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      {UNSUBSCRIBE_LINK_PENDING}
                    </p>
                  )}

                  {/* Action triggers */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button 
                      type="button" 
                      className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all duration-150 shadow-sm"
                      onClick={() => handleCopyClipboard(
                        campaignPreviewLeads[selectedPreviewLeadIdx],
                        templates.find(t => t.id === parseInt(newCampaign.template_id))
                      )}
                    >
                      Copier le corps
                    </button>
                    {newCampaign.channel === 'email' ? (
                      /*
                        Both of these open a real message to a real prospect
                        from the tenant's own mailbox, so they stay disabled
                        until the prospect's unsubscribe link has arrived —
                        a hand-triggered prospecting e-mail needs an opt-out
                        exactly like the automated one does.
                      */
                      !previewUnsubscribeUrl ? (
                        <span
                          className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-semibold text-xs cursor-not-allowed"
                          title={UNSUBSCRIBE_LINK_PENDING}
                        >
                          Envoi manuel indisponible
                        </span>
                      ) : (
                      <>
                        <a
                          href={getMailtoLink(
                            campaignPreviewLeads[selectedPreviewLeadIdx],
                            templates.find(t => t.id === parseInt(newCampaign.template_id))
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150 shadow-sm"
                          title="Ouvrir avec votre logiciel de messagerie par défaut (Apple Mail, Outlook, etc.)"
                        >
                          Ouvrir le client Mail
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={getGmailLink(
                            campaignPreviewLeads[selectedPreviewLeadIdx],
                            templates.find(t => t.id === parseInt(newCampaign.template_id))
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-xs hover:bg-red-700 active:scale-95 transition-all duration-150 shadow-sm"
                          title="Ouvrir directement dans Gmail sur le web"
                        >
                          Gmail Web
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </>
                      )
                    ) : (
                      <a 
                        href={getMessageLink(
                          campaignPreviewLeads[selectedPreviewLeadIdx],
                          templates.find(t => t.id === parseInt(newCampaign.template_id))
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150 shadow-sm"
                      >
                        Ouvrir SMS
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
                    <th className="p-4">Ignorés</th>
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
                      <td
                        className={`p-4 font-semibold ${(camp.skipped_count || 0) > 0 ? 'text-slate-600' : 'text-slate-400'}`}
                        title={(camp.skipped_count || 0) > 0 ? "Destinataires désinscrits : ils comptent dans les cibles mais n'ont reçu aucun message." : undefined}
                      >
                        {camp.skipped_count || 0}
                      </td>
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
                  <span>{campaignProgress.processed} / {campaignProgress.total} cibles</span>
                  <span>{campaignProgress.percent}%</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full transition-all duration-300"
                    style={{ width: `${campaignProgress.percent}%` }}
                  ></div>
                </div>
                {/*
                  A skipped prospect counts in total_leads but is neither sent
                  nor failed. Naming the number is the point: reconciling the
                  arithmetic silently would still leave the customer wondering
                  what happened to the missing recipients.
                */}
                {campaignProgress.skipped > 0 && (
                  <p className="text-[11px] text-slate-500 leading-normal mt-2">
                    <strong className="text-slate-700">{campaignProgress.skipped}</strong>{' '}
                    {campaignProgress.skipped > 1 ? 'destinataires désinscrits' : 'destinataire désinscrit'}{' '}
                    {campaignProgress.skipped > 1 ? 'ont été ignorés' : 'a été ignoré'} : aucun message ne
                    leur a été envoyé, conformément à leur demande de désinscription. Ils comptent dans
                    les cibles mais pas dans les envois.
                  </p>
                )}
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
                  <button className="flex-grow inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors" onClick={() => handleRestartCampaign(selectedCampaignDetails.campaign.id)}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Relancer la Campagne
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
                        ) : log.status === 'Skipped' ? (
                          <span className="text-slate-500 flex items-center gap-1 font-semibold" title={log.error_message}>
                            <MinusCircle className="w-3.5 h-3.5" />
                            Ignoré
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
