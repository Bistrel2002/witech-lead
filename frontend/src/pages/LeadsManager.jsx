import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  Trash2, 
  Plus, 
  FileText, 
  Eye, 
  RefreshCw, 
  Check, 
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Link2,
  Download,
  Star,
  Shield,
  ShieldOff,
  Smartphone,
  MessageSquare,
  Clock,
  X,
  Upload,
  Kanban,
  LayoutList,
  Building2,
  Calendar,
  MessageCircle,
  Play
} from 'lucide-react';

const PIPELINE_STATUSES = [
  'New',
  'Contacted',
  'Meeting Scheduled',
  'Proposal Sent',
  'Closed Won',
  'Closed Lost'
];

const getMockDiscussions = (leadId) => {
  const now = new Date();
  const formatTime = (daysAgo) => new Date(now.getTime() - daysAgo * 24 * 3600 * 1000).toISOString();
  
  if (leadId === 991) {
    return [
      { id: 'm1', lead_id: 991, type: 'Note', content: "Prospect identifié sur Google Maps dans la catégorie Plombier. Site internet moderne mais aucune adresse email publique trouvée.", created_at: formatTime(2) }
    ];
  }
  if (leadId === 992) {
    return [
      { id: 'm2_1', lead_id: 992, type: 'Call', content: "Appel de suivi : Le gérant (M. Lefebvre) confirme l'intérêt pour l'automatisation de sa facturation via n8n. Rendez-vous planifié pour une démo.", created_at: formatTime(0.5) },
      { id: 'm2_2', lead_id: 992, type: 'Email', content: "Campagne Outreach : Email automatique envoyé avec la template d'automatisation de processus.", created_at: formatTime(1) }
    ];
  }
  if (leadId === 993) {
    return [
      { id: 'm3_1', lead_id: 993, type: 'WhatsApp', content: "Message envoyé sur Instagram : Demande si le salon a déjà envisagé de créer un site internet pour les réservations en ligne.", created_at: formatTime(3) }
    ];
  }
  if (leadId === 994) {
    return [
      { id: 'm4_1', lead_id: 994, type: 'Note', content: "Site web analysé (Squarespace). Très propre mais pas de widget de chat ni de formulaire d'automatisation de devis.", created_at: formatTime(1) }
    ];
  }
  return [];
};

const DATABASE_FIELDS = [
  { key: 'name', label: "Nom de l'entreprise *", required: true, keywords: ['name', 'nom', 'entreprise', 'société', 'company', 'business', 'établissement', 'title'] },
  { key: 'category', label: "Catégorie / Secteur", required: false, keywords: ['category', 'catégorie', 'secteur', 'activité', 'type', 'tags', 'sector', 'job', 'industry'] },
  { key: 'website', label: "Site Internet (URL)", required: false, keywords: ['website', 'site', 'site web', 'web', 'url', 'site_web', 'lien'] },
  { key: 'phone', label: "Téléphone", required: false, keywords: ['phone', 'téléphone', 'tel', 'tél', 'telephone', 'mobile', 'portable'] },
  { key: 'email', label: "Email", required: false, keywords: ['email', 'mail', 'courriel', 'e-mail', 'contact'] },
  { key: 'city', label: "Ville", required: false, keywords: ['city', 'ville', 'localité', 'town', 'commune'] },
  { key: 'address', label: "Adresse complète", required: false, keywords: ['address', 'adresse', 'street', 'localisation', 'location'] },
  { key: 'rating', label: "Note Google Maps", required: false, keywords: ['rating', 'note', 'stars', 'score', 'évaluations'] },
  { key: 'review_count', label: "Nombre d'avis", required: false, keywords: ['review_count', 'avis', 'reviews', 'votes', 'commentaires_count'] },
  { key: 'google_maps_url', label: "Lien Google Maps", required: false, keywords: ['maps_url', 'google_maps', 'maps', 'link', 'gmaps'] },
  { key: 'notes', label: "Notes / Commentaires", required: false, keywords: ['notes', 'commentaires', 'description', 'memo', 'remarques'] }
];

const parseCSV = (text) => {
  const firstLine = text.split('\n')[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const separator = semiCount > commaCount ? ';' : ',';
  
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === separator && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') { i++; }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map(h => h.trim().replace(/^"|"$/g, ''));
  const dataRows = lines.slice(1)
    .filter(row => row.some(cell => cell && cell.trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = (row[index] || '').trim().replace(/^"|"$/g, '');
      });
      return obj;
    });
  return { headers, rows: dataRows };
};

const loadSheetJS = () => {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export default function LeadsManager({ apiHost, leads = [], reloadLeads }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState('All');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [emailFilter, setEmailFilter] = useState('All'); 
  const [websiteFilter, setWebsiteFilter] = useState('All');
  
  // Selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [viewMode, setViewMode] = useState('board'); // board, list
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  
  // Modal & Drawer
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeLeadDetails, setActiveLeadDetails] = useState(null);
  
  // Action loaders
  const [scrapingLeadId, setScrapingLeadId] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [mapsScraping, setMapsScraping] = useState(false);
  const [scrapingSeconds, setScrapingSeconds] = useState(0);

  // New Scraper Options (PRD and user requirements)
  const [scrapeSource, setScrapeSource] = useState('maps'); // maps, database
  const [searchCategory, setSearchCategory] = useState('');
  const [searchCity, setSearchCity] = useState('');
  const [searchRadius, setSearchRadius] = useState(5); // default 5km
  const [maxLeads, setMaxLeads] = useState(50);
  const [saveToDb, setSaveToDb] = useState(true);
  const [targetCampaignId, setTargetCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState([]);

  // Backward compatibility maps link input
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [useRawLink, setUseRawLink] = useState(false);

  // Form states for manual lead
  const [newLead, setNewLead] = useState({
    name: '', category: 'Plombier', website: '', phone: '', email: '', city: '', address: '', notes: ''
  });

  // Timeline discussions
  const [discussions, setDiscussions] = useState([]);
  const [loadingDiscussions, setLoadingDiscussions] = useState(false);
  const [discussionType, setDiscussionType] = useState('Note');
  const [discussionContent, setDiscussionContent] = useState('');
  const [addingDiscussion, setAddingDiscussion] = useState(false);

  // File Import Wizard States
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [defaultCategory, setDefaultCategory] = useState('Importé');
  const [defaultCity, setDefaultCity] = useState('');
  const [defaultStatus, setDefaultStatus] = useState('New');
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState({ inserted: 0, skipped: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState('');

  // Fetch campaigns for queuing select options
  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${apiHost}/api/campaigns`);
      if (res.ok) setCampaigns(await res.json());
    } catch (err) {}
  };

  const autoMatchColumn = (field, fileHeaders) => {
    const normalizedField = field.key.toLowerCase();
    for (const h of fileHeaders) {
      const normalizedH = h.toLowerCase().trim();
      if (normalizedH === normalizedField) return h;
    }
    for (const keyword of field.keywords) {
      for (const h of fileHeaders) {
        const normalizedH = h.toLowerCase().trim();
        if (normalizedH.includes(keyword) || keyword.includes(normalizedH)) {
          return h;
        }
      }
    }
    return '';
  };

  const uniqueCategories = useMemo(() => [...new Set(leads.map(l => l.category))], [leads]);

  const filteredUniqueCategories = useMemo(() => {
    return uniqueCategories.filter(cat => 
      cat.toLowerCase().includes(categorySearchTerm.toLowerCase())
    );
  }, [uniqueCategories, categorySearchTerm]);

  const vulnMetrics = useMemo(() => {
    const noWebsite = leads.filter(l => !l.website || l.website.trim() === '').length;
    return { noWebsite };
  }, [leads]);

  const filteredLeads = useMemo(() => leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.address?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategoryTab === 'All' || lead.category === activeCategoryTab;
    const matchesStatus = selectedStatus === 'All' || lead.status === selectedStatus;
    
    let matchesEmail = true;
    if (emailFilter === 'Has Email') {
      matchesEmail = lead.email && lead.email.trim() !== '';
    } else if (emailFilter === 'No Email') {
      matchesEmail = !lead.email || lead.email.trim() === '';
    }

    let matchesWebsite = true;
    if (websiteFilter === 'Has Website') {
      matchesWebsite = lead.website && lead.website.trim() !== '';
    } else if (websiteFilter === 'No Website') {
      matchesWebsite = !lead.website || lead.website.trim() === '';
    }

    return matchesSearch && matchesCategory && matchesStatus && matchesEmail && matchesWebsite;
  }), [leads, searchTerm, activeCategoryTab, selectedStatus, emailFilter, websiteFilter]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleSelectLead = (id) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(item => item !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  useEffect(() => {
    let interval;
    if (mapsScraping) {
      setScrapingSeconds(0);
      interval = setInterval(() => {
        setScrapingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setScrapingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [mapsScraping]);

  const getScrapingProgressMessage = () => {
    if (scrapingSeconds < 6) {
      return `Lancement du moteur de scraping Playwright (Python)... (Étape 1/5)`;
    } else if (scrapingSeconds < 16) {
      return `Génération de l'URL Google Maps optimisée et contournement anti-bot... (Étape 2/5)`;
    } else if (scrapingSeconds < 45) {
      return `Extraction des fiches sur un rayon restreint à ${searchRadius}km... (Étape 3/5)`;
    } else if (scrapingSeconds < 68) {
      return `Audit digital du site web: vérification SSL, mobile, e-mails et widgets... (Étape 4/5)`;
    } else {
      return `Enregistrement des prospects qualifiés dans le CRM / la campagne... (Étape 5/5)`;
    }
  };

  // Modernized search scraper launcher
  const handleLaunchProspecting = async (e) => {
    e.preventDefault();
    
    // Validations
    if (scrapeSource === 'maps' && !useRawLink && (!searchCategory.trim() || !searchCity.trim())) {
      alert("Veuillez saisir une catégorie et une ville.");
      return;
    }
    if (useRawLink && !googleMapsUrl.trim()) {
      alert("Veuillez saisir un lien Google Maps.");
      return;
    }
    if (!saveToDb && !targetCampaignId) {
      alert("Veuillez sélectionner une campagne cible pour ajouter les prospects.");
      return;
    }

    setMapsScraping(true);

    try {
      let endpoint = `${apiHost}/api/leads/scrape-maps-link`;
      let payload = {};

      if (useRawLink) {
        payload = { mapsUrl: googleMapsUrl, maxLeads };
      } else {
        // Build optimized Google Maps search query from details
        const query = `${searchCity} ${searchCategory}`;
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;
        payload = { 
          mapsUrl,
          category: searchCategory,
          city: searchCity,
          radius: searchRadius,
          saveToDb,
          campaignId: targetCampaignId || null,
          maxLeads
        };
      }

      // If calling from French Database (National database lookups)
      if (scrapeSource === 'database') {
        endpoint = `${apiHost}/api/leads/french-db-lookup`;
        payload = {
          category: searchCategory,
          city: searchCity,
          saveToDb,
          campaignId: targetCampaignId || null
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok) {
        await reloadLeads();
        setSearchCategory('');
        setSearchCity('');
        setGoogleMapsUrl('');
        
        if (data.category) {
          setActiveCategoryTab(data.category);
        }
        alert(`🎉 ${data.message}`);
      } else {
        alert(data.error || "Une erreur est survenue lors de l'extraction.");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau: Impossible de contacter le serveur backend.");
    } finally {
      setMapsScraping(false);
    }
  };

  const handleScrapeContactInfo = async (leadId) => {
    setScrapingLeadId(leadId);
    try {
      const response = await fetch(`${apiHost}/api/leads/${leadId}/scrape`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        await reloadLeads();
        if (activeLeadDetails && activeLeadDetails.id === leadId) {
          setActiveLeadDetails(data.lead);
        }
        if (data.crawlerDetails?.email) {
          alert(`🎉 Succès! Email extrait de leur site web : ${data.crawlerDetails.email}`);
        } else {
          alert('Scraping terminé. Audit digital complété.');
        }
      } else {
        alert(data.error || 'Erreur lors du scraping');
      }
    } catch (err) {
      console.error(err);
      alert('Erreur réseau.');
    } finally {
      setScrapingLeadId(null);
    }
  };

  const handleAddLeadSubmit = async (e) => {
    e.preventDefault();
    setActionInProgress(true);
    try {
      const response = await fetch(`${apiHost}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLead)
      });
      if (response.ok) {
        const added = await response.json();
        await reloadLeads();
        setShowAddModal(false);
        setActiveCategoryTab(added.category);
        setNewLead({ name: '', category: 'Plombier', website: '', phone: '', email: '', city: '', address: '', notes: '' });
      } else {
        const errData = await response.json();
        alert(errData.error || 'Erreur');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleFileSelection = async (file) => {
    if (!file) return;
    setUploadedFileName(file.name);
    setImportError('');
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (extension === 'json') {
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          const rawRows = Array.isArray(json) ? json : [json];
          if (rawRows.length === 0) throw new Error("Le fichier JSON est vide.");
          const headersSet = new Set();
          rawRows.forEach(item => {
            Object.keys(item).forEach(k => headersSet.add(k));
          });
          const headers = Array.from(headersSet);
          setParsedHeaders(headers);
          setParsedRows(rawRows);
          
          const initialMappings = {};
          DATABASE_FIELDS.forEach(field => {
            initialMappings[field.key] = autoMatchColumn(field, headers);
          });
          setColumnMappings(initialMappings);
          setImportStep(2);
        } catch (err) {
          setImportError("Erreur lors de la lecture du fichier JSON: " + err.message);
        }
      };
      reader.readAsText(file);
    } else if (extension === 'csv' || extension === 'txt') {
      reader.onload = (e) => {
        try {
          const { headers, rows } = parseCSV(e.target.result);
          if (rows.length === 0) throw new Error("Le fichier CSV est vide.");
          setParsedHeaders(headers);
          setParsedRows(rows);
          const initialMappings = {};
          DATABASE_FIELDS.forEach(field => {
            initialMappings[field.key] = autoMatchColumn(field, headers);
          });
          setColumnMappings(initialMappings);
          setImportStep(2);
        } catch (err) {
          setImportError("Erreur lors de la lecture du fichier CSV: " + err.message);
        }
      };
      reader.readAsText(file);
    } else if (extension === 'xlsx' || extension === 'xls') {
      try {
        setImportError("Chargement du module Excel (SheetJS)...");
        const XLSX = await loadSheetJS();
        setImportError('');
        
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            if (workbook.SheetNames.length === 0) throw new Error("Aucune feuille dans le fichier.");
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json(worksheet);
            if (rawRows.length === 0) throw new Error("Le fichier est vide.");
            
            const headersSet = new Set();
            rawRows.forEach(item => {
              Object.keys(item).forEach(k => headersSet.add(k));
            });
            const headers = Array.from(headersSet);
            setParsedHeaders(headers);
            setParsedRows(rawRows);
            
            const initialMappings = {};
            DATABASE_FIELDS.forEach(field => {
              initialMappings[field.key] = autoMatchColumn(field, headers);
            });
            setColumnMappings(initialMappings);
            setImportStep(2);
          } catch (err) {
            setImportError("Erreur lors du parsing Excel: " + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setImportError("Impossible de charger le parser Excel.");
      }
    } else {
      setImportError("Format de fichier non pris en charge.");
    }
  };

  const handleLaunchImport = async () => {
    if (!columnMappings.name) {
      alert("Le champ 'Nom de l'entreprise' est obligatoire.");
      return;
    }
    setImportStep(3);
    setImportProgress(0);

    const structuredLeads = parsedRows.map(row => {
      const lead = {};
      DATABASE_FIELDS.forEach(field => {
        const fileCol = columnMappings[field.key];
        let val = fileCol ? row[fileCol] : undefined;
        
        if (field.key === 'rating') {
          if (val !== undefined && val !== null && val !== '') lead[field.key] = parseFloat(val) || null;
        } else if (field.key === 'review_count') {
          if (val !== undefined && val !== null && val !== '') lead[field.key] = parseInt(val) || 0;
        } else {
          lead[field.key] = val;
        }
      });
      lead.name = lead.name ? String(lead.name).trim() : '';
      lead.category = lead.category || defaultCategory || 'Importé';
      lead.city = lead.city || defaultCity || null;
      lead.status = lead.status || defaultStatus || 'New';
      return lead;
    }).filter(lead => lead.name.length > 0);

    if (structuredLeads.length === 0) {
      alert("Aucun prospect valide.");
      setImportStep(2);
      return;
    }

    const chunkSize = 30;
    let totalInserted = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < structuredLeads.length; i += chunkSize) {
        const chunk = structuredLeads.slice(i, i + chunkSize);
        const response = await fetch(`${apiHost}/api/leads/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customLeads: chunk })
        });
        if (response.ok) {
          const resData = await response.json();
          totalInserted += resData.insertedCount || 0;
          totalSkipped += resData.skippedCount || 0;
        }
        setImportProgress(Math.round(((i + chunk.length) / structuredLeads.length) * 100));
        await new Promise(r => setTimeout(r, 100));
      }
      setImportResult({ inserted: totalInserted, skipped: totalSkipped, total: structuredLeads.length });
      await reloadLeads();
      setImportStep(4);
    } catch (err) {
      console.error(err);
      setImportStep(2);
    }
  };

  const handleDeleteLeads = async (ids) => {
    if (!window.confirm(`Confirmez-vous la suppression de ${ids.length} prospect(s) ?`)) return;
    setActionInProgress(true);
    try {
      for (const id of ids) {
        await fetch(`${apiHost}/api/leads/${id}`, { method: 'DELETE' });
      }
      setSelectedLeadIds([]);
      await reloadLeads();
      if (activeLeadDetails && ids.includes(activeLeadDetails.id)) {
        setActiveLeadDetails(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!window.confirm("Éliminer les doublons ?")) return;
    setActionInProgress(true);
    try {
      const response = await fetch(`${apiHost}/api/leads/cleanup`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        await reloadLeads();
        alert(`✨ ${data.message}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    try {
      const targetLead = leads.find(l => l.id === leadId);
      const updatedData = { ...targetLead, status: newStatus };
      const response = await fetch(`${apiHost}/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (response.ok) {
        await reloadLeads();
        if (activeLeadDetails && activeLeadDetails.id === leadId) {
          setActiveLeadDetails({ ...activeLeadDetails, status: newStatus });
        }
      }
    } catch (err) {}
  };

  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStatus(null);
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    const leadIdStr = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadIdStr) return;
    const leadId = parseInt(leadIdStr);
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.status !== targetStatus) {
      await handleUpdateStatus(leadId, targetStatus);
    }
    setDraggedLeadId(null);
  };

  const handleSaveNotes = async (leadId, newNotes) => {
    try {
      const targetLead = leads.find(l => l.id === leadId);
      const updatedData = { ...targetLead, notes: newNotes };
      await fetch(`${apiHost}/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      await reloadLeads();
    } catch (err) {}
  };

  const fetchDiscussions = async (leadId) => {
    setLoadingDiscussions(true);
    try {
      const response = await fetch(`${apiHost}/api/leads/${leadId}/discussions`);
      if (response.ok) {
        setDiscussions(await response.json());
      } else {
        setDiscussions(getMockDiscussions(leadId));
      }
    } catch (err) {
      setDiscussions(getMockDiscussions(leadId));
    } finally {
      setLoadingDiscussions(false);
    }
  };

  useEffect(() => {
    if (activeLeadDetails && activeLeadDetails.id) {
      fetchDiscussions(activeLeadDetails.id);
    } else {
      setDiscussions([]);
    }
  }, [activeLeadDetails]);

  const handleAddDiscussion = async (e) => {
    e.preventDefault();
    if (!discussionContent.trim() || !activeLeadDetails) return;

    setAddingDiscussion(true);
    const leadId = activeLeadDetails.id;
    const newEntry = { type: discussionType, content: discussionContent.trim() };

    try {
      const response = await fetch(`${apiHost}/api/leads/${leadId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });
      if (response.ok) {
        setDiscussionContent('');
        await fetchDiscussions(leadId);
      } else {
        const mockNew = { id: `local_${Date.now()}`, lead_id: leadId, type: discussionType, content: discussionContent.trim(), created_at: new Date().toISOString() };
        setDiscussions([mockNew, ...discussions]);
        setDiscussionContent('');
      }
    } catch (err) {
      const mockNew = { id: `local_${Date.now()}`, lead_id: leadId, type: discussionType, content: discussionContent.trim(), created_at: new Date().toISOString() };
      setDiscussions([mockNew, ...discussions]);
      setDiscussionContent('');
    } finally {
      setAddingDiscussion(false);
    }
  };

  const handleDeleteDiscussion = async (id) => {
    if (!window.confirm("Supprimer cet échange ?")) return;
    try {
      if (String(id).startsWith('local_') || String(id).startsWith('m')) {
        setDiscussions(discussions.filter(d => d.id !== id));
        return;
      }
      const response = await fetch(`${apiHost}/api/leads/discussions/${id}`, { method: 'DELETE' });
      if (response.ok && activeLeadDetails) await fetchDiscussions(activeLeadDetails.id);
    } catch (err) {
      setDiscussions(discussions.filter(d => d.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nom', 'Catégorie', 'Ville', 'Adresse', 'Site Web', 'Email', 'Téléphone', 'Note Maps', 'Avis', 'Statut'];
    const rows = filteredLeads.map(l => [
      l.name || '',
      l.category || '',
      l.city || '',
      l.address || '',
      l.website || '',
      l.email || '',
      l.phone || '',
      l.rating || '',
      l.review_count || '',
      l.status || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `witech-prospects-${activeCategoryTab === 'All' ? 'tous' : activeCategoryTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'New': return 'bg-slate-100 border-slate-200 text-slate-600';
      case 'Contacted': return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'Meeting Scheduled': return 'bg-indigo-50 border-indigo-200 text-indigo-700';
      case 'Proposal Sent': return 'bg-purple-50 border-purple-200 text-purple-700';
      case 'Closed Won': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'Closed Lost': return 'bg-red-50 border-red-200 text-red-700';
      default: return 'bg-slate-100 border-slate-200 text-slate-600';
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      'New': 'Nouveau',
      'Contacted': 'Contacté',
      'Meeting Scheduled': 'RDV Planifié',
      'Proposal Sent': 'Devis Envoyé',
      'Closed Won': 'Gagné ✓',
      'Closed Lost': 'Perdu'
    };
    return labels[status] || status;
  };

  const getVulnFlags = (lead) => {
    const flags = [];
    if (!lead.website || lead.website.trim() === '') {
      flags.push({ label: 'Pas de Site', cls: 'bg-red-50 text-red-700 border-red-200', icon: Globe });
    }
    return flags;
  };


  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-heading font-extrabold text-slate-800">Gestionnaire de Prospects</h2>
          <p className="text-slate-500 text-sm mt-1">
            Importez, qualifiez vos cibles et pilotez votre CRM prospection.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl border border-slate-300/40">
            <button 
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${viewMode === 'board' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setViewMode('board')}
            >
              <Kanban className="w-3.5 h-3.5" />
              Pipeline
            </button>
            <button 
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${viewMode === 'list' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Table
            </button>
          </div>

          {selectedLeadIds.length > 0 && (
            <button className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold text-xs transition-colors" onClick={() => handleDeleteLeads(selectedLeadIds)}>
              <Trash2 className="w-4 h-4" />
              Supprimer ({selectedLeadIds.length})
            </button>
          )}

          <button className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs shadow-sm hover:bg-slate-50 transition-colors" onClick={handleExportCSV} disabled={filteredLeads.length === 0}>
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
          
          <button 
            className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs shadow-sm hover:bg-slate-50 transition-colors"
            onClick={() => {
              setImportStep(1); setUploadedFileName(''); setParsedHeaders([]); setParsedRows([]); setColumnMappings({}); setImportError(''); setShowImportModal(true);
            }}
          >
            <Upload className="w-4 h-4" />
            Importer
          </button>

          <button 
            className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold text-xs transition-colors"
            onClick={handleCleanDuplicates}
            disabled={actionInProgress}
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            Nettoyer Doublons
          </button>

          <button className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs shadow-sm hover:bg-teal-700 transition-colors" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            Créer
          </button>
        </div>
      </div>

      {/* PROSPECTING SEARCH WIZARD */}
      <div className="bg-teal-50/20 border border-teal-500/15 rounded-2xl p-6">
        <h4 className="font-heading font-extrabold text-teal-800 text-sm mb-1.5 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-600" />
          Extraction Intelligente de Prospects (Google Maps & Base de Données France)
        </h4>
        <p className="text-slate-500 text-xs mb-5">
          Sélectionnez votre source de données, affinez le ciblage géographique et planifiez la qualification immédiate des entreprises.
        </p>
        
        <form onSubmit={handleLaunchProspecting} className="space-y-4">
          {/* Source Options Toggle */}
          <div className="flex gap-2 max-w-md bg-slate-200/40 p-1 rounded-lg border border-slate-200/60 text-2xs font-bold text-slate-600">
            <button 
              type="button" 
              className={`flex-1 py-1.5 rounded-md transition-all ${scrapeSource === 'maps' ? 'bg-white text-slate-800 shadow-sm' : 'hover:text-slate-800'}`}
              onClick={() => { setScrapeSource('maps'); setUseRawLink(false); }}
            >
              Google Maps (Direct)
            </button>
            <button 
              type="button" 
              className={`flex-1 py-1.5 rounded-md transition-all ${scrapeSource === 'database' ? 'bg-white text-slate-800 shadow-sm' : 'hover:text-slate-800'}`}
              onClick={() => { setScrapeSource('database'); setUseRawLink(false); }}
            >
              Base Nationale (France CSV)
            </button>
          </div>

          {!useRawLink ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className={scrapeSource === 'maps' ? 'md:col-span-3' : 'md:col-span-5'}>
                <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Catégorie recherchée</label>
                <input 
                  type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                  placeholder="Ex: Plombier, Menuisier, Electricien..."
                  value={searchCategory} onChange={(e) => setSearchCategory(e.target.value)}
                  required={!useRawLink}
                />
              </div>
              <div className={scrapeSource === 'maps' ? 'md:col-span-3' : 'md:col-span-5'}>
                <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ville cible</label>
                <input 
                  type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                  placeholder="Ex: Nantes, Lyon, Bordeaux..."
                  value={searchCity} onChange={(e) => setSearchCity(e.target.value)}
                  required={!useRawLink}
                />
              </div>
              {scrapeSource === 'maps' && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Rayon (km)</label>
                    <input 
                      type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                      min="1" max="50"
                      value={searchRadius} onChange={(e) => setSearchRadius(parseInt(e.target.value) || 5)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Max Leads</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                      value={maxLeads} onChange={(e) => setMaxLeads(parseInt(e.target.value))}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={300}>300</option>
                      <option value={400}>400</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                </>
              )}
              <div className="md:col-span-2 flex items-end">
                <button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all" disabled={mapsScraping}>
                  {mapsScraping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  Lancer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 relative w-full">
                <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Lien Google Maps</label>
                <div className="relative">
                  <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="url" className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                    placeholder="Collez le lien Google Maps complet ici..."
                    value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)}
                    required={useRawLink}
                  />
                </div>
              </div>
              <div className="w-full sm:w-32">
                <label className="block text-3xs font-bold text-slate-400 uppercase tracking-wider mb-1">Max Leads</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs focus:outline-none focus:border-teal-500"
                  value={maxLeads} onChange={(e) => setMaxLeads(parseInt(e.target.value))}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={300}>300</option>
                  <option value={400}>400</option>
                  <option value={500}>500</option>
                </select>
              </div>
              <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all" disabled={mapsScraping}>
                {mapsScraping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Scraper'}
              </button>
            </div>
          )}

          {/* Scraper Advanced settings: DB vs Campaign Routing */}
          <div className="flex flex-wrap gap-5 items-center pt-2 text-xs text-slate-600 border-t border-slate-200/40">
            <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
              <input 
                type="checkbox" className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 border-slate-300"
                checked={saveToDb} onChange={(e) => setSaveToDb(e.target.checked)}
              />
              Enregistrer dans le CRM global (Base locale)
            </label>

            <div className="flex items-center gap-2">
              <span className="font-medium">Associer directement à une campagne :</span>
              <select
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none"
                value={targetCampaignId} onChange={(e) => setTargetCampaignId(e.target.value)}
                required={!saveToDb}
              >
                <option value="">-- Pas de campagne (CRM seul) --</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.channel})</option>
                ))}
              </select>
            </div>

            {scrapeSource === 'maps' && (
              <button 
                type="button" className="text-teal-600 hover:text-teal-700 font-semibold text-3xs uppercase tracking-wider ml-auto"
                onClick={() => setUseRawLink(!useRawLink)}
              >
                {useRawLink ? "Rechercher par catégorie/ville" : "Importer via lien maps brut"}
              </button>
            )}
          </div>
        </form>

        {mapsScraping && (
          <div className="mt-4 p-4 bg-teal-50 border border-teal-200/50 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-teal-800">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                Robot d'extraction et audit actif
              </span>
              <span className="text-slate-400">{scrapingSeconds}s</span>
            </div>
            <p className="text-xs text-slate-700 font-medium">{getScrapingProgressMessage()}</p>
            <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-teal-600 transition-all duration-300"
                style={{ width: `${Math.min(95, (scrapingSeconds / 75) * 100)}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* VULNERABILITY METRIC FLAGS SUMMARY */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-4 items-center text-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Indicateurs de faiblesses CRM
          </span>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold bg-red-50 text-red-700 border border-red-100">
              <Globe className="w-3 h-3" />
              {vulnMetrics.noWebsite} sans site
            </span>
          </div>
        </div>
      </div>

      {/* STRICT CATEGORY TAB BAR */}
      <div className="space-y-3">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Filtrer par Secteur d'activité
          </span>
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-teal-500"
              placeholder="Rechercher un secteur..."
              value={categorySearchTerm} onChange={(e) => setCategorySearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${activeCategoryTab === 'All' ? 'bg-slate-900 border-slate-950 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            onClick={() => { setActiveCategoryTab('All'); setSelectedLeadIds([]); }}
          >
            Tous ({leads.length})
          </button>
          
          {filteredUniqueCategories.map(cat => {
            const count = leads.filter(l => l.category === cat).length;
            return (
              <button 
                key={cat}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${activeCategoryTab === cat ? 'bg-teal-600 border-teal-700 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                onClick={() => { setActiveCategoryTab(cat); setSelectedLeadIds([]); }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
              placeholder="Rechercher nom, ville, adresse..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 text-sm focus:outline-none focus:border-teal-500"
              value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="All">Tous les Statuts</option>
              {PIPELINE_STATUSES.map(st => (
                <option key={st} value={st}>{getStatusLabel(st)}</option>
              ))}
            </select>
          </div>
          <div>
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 text-sm focus:outline-none focus:border-teal-500"
              value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)}
            >
              <option value="All">Email : Tous</option>
              <option value="Has Email">Avec Email</option>
              <option value="No Email">Sans Email</option>
            </select>
          </div>
          <div>
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 text-sm focus:outline-none focus:border-teal-500"
              value={websiteFilter} onChange={(e) => setWebsiteFilter(e.target.value)}
            >
              <option value="All">Site : Tous</option>
              <option value="Has Website">Avec Site</option>
              <option value="No Website">Sans Site</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main CRM Workspace (Pipeline vs List) */}
      {viewMode === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
          {PIPELINE_STATUSES.map(status => {
            const columnLeads = filteredLeads.filter(l => l.status === status);
            const isDragOver = dragOverStatus === status;
            return (
              <div 
                key={status} 
                className={`flex-shrink-0 w-72 rounded-2xl p-4 flex flex-col gap-3 border transition-all duration-200 ${isDragOver ? 'bg-teal-50/70 border-teal-500 shadow-inner' : 'bg-slate-100/60 border-slate-200/80'}`}
                onDragOver={(e) => { e.preventDefault(); if (dragOverStatus !== status) setDragOverStatus(status); }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(e) => handleDrop(e, status)}
              >
                {/* Column Header */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {getStatusLabel(status)}
                    </span>
                    <span className="text-2xs bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[60vh] p-0.5">
                  {columnLeads.map(lead => {
                    const isDragged = draggedLeadId === lead.id;
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white border border-slate-200 rounded-xl p-4 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-teal-500 hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3 ${isDragged ? 'opacity-40' : 'opacity-100'}`}
                        onClick={() => setActiveLeadDetails(lead)}
                      >
                        <div>
                          <strong className="text-slate-800 text-sm block mb-1 group-hover:text-teal-600 transition-colors leading-tight">
                            {lead.name}
                          </strong>
                          <span className="inline-block bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2 py-0.5 text-3xs font-semibold">
                            {lead.category}
                          </span>
                        </div>

                        {lead.city && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{lead.city}</span>
                          </div>
                        )}

                        {lead.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                            <span className="text-xs font-bold text-amber-500">{lead.rating}</span>
                            <span className="text-3xs text-slate-400">({lead.review_count})</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 mt-1">
                          <div className="flex gap-2 text-slate-400">
                            <Globe className={`w-3.5 h-3.5 ${lead.website ? 'text-teal-500' : 'text-slate-200'}`} />
                            <Mail className={`w-3.5 h-3.5 ${lead.email ? 'text-emerald-500' : 'text-slate-200'}`} />
                            <Phone className={`w-3.5 h-3.5 ${lead.phone ? 'text-amber-500' : 'text-slate-200'}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {columnLeads.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-3xs border border-dashed border-slate-300/60 rounded-xl bg-slate-50/50">
                      Déposez les prospects ici
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <AlertTriangle className="w-12 h-12 mx-auto opacity-30 text-teal-600" />
              <h4 className="font-heading font-bold text-slate-700">Aucun prospect dans cette section</h4>
              <p className="text-xs">Lancez une recherche ci-dessus pour peupler la liste.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="p-4 w-10 text-center">
                      <input 
                        type="checkbox" className="rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                        onChange={handleSelectAll} 
                        checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                      />
                    </th>
                    <th className="p-4">Nom</th>
                    <th className="p-4">Secteur</th>
                    <th className="p-4">Ville</th>
                    <th className="p-4">Note Maps</th>
                    <th className="p-4">Contacts</th>
                    <th className="p-4">Pipeline</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredLeads.map((lead) => {
                    return (
                      <tr key={lead.id} className={`hover:bg-slate-50/50 transition-colors ${selectedLeadIds.includes(lead.id) ? 'bg-teal-50/20' : ''}`}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" className="rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={() => handleSelectLead(lead.id)}
                          />
                        </td>
                        <td className="p-4 font-bold text-slate-800">{lead.name}</td>
                        <td className="p-4">
                          <span className="inline-block bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-0.5 text-2xs font-semibold">
                            {lead.category}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {lead.city || '—'}
                          </span>
                        </td>
                        <td className="p-4">
                          {lead.rating ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-bold">
                              <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                              {lead.rating}
                              <span className="text-3xs text-slate-400 font-normal">({lead.review_count || 0})</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 text-slate-400">
                            <Globe className={`w-4 h-4 ${lead.website ? 'text-teal-500' : 'text-slate-200'}`} />
                            <Mail className={`w-4 h-4 ${lead.email ? 'text-emerald-500' : 'text-slate-200'}`} />
                            <Phone className={`w-4 h-4 ${lead.phone ? 'text-amber-500' : 'text-slate-200'}`} />
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${getStatusBadgeClass(lead.status)}`}>
                            {getStatusLabel(lead.status)}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="inline-flex gap-2">
                            {lead.website && !lead.email && (
                              <button 
                                className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg hover:bg-slate-50 border border-slate-200 transition-colors"
                                onClick={() => handleScrapeContactInfo(lead.id)}
                                disabled={scrapingLeadId === lead.id}
                                title="Lancer l'audit digital"
                              >
                                {scrapingLeadId === lead.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                                ) : (
                                  <Globe className="w-3.5 h-3.5 text-teal-500" />
                                )}
                              </button>
                            )}
                            <button className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 border border-slate-200 transition-colors" onClick={() => setActiveLeadDetails(lead)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-200 transition-colors" onClick={() => handleDeleteLeads([lead.id])}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create manual lead */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-[modalFadeIn_0.25s_ease-out]">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-heading font-extrabold text-slate-800 text-lg">Ajouter un Prospect Manuel</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddLeadSubmit}>
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nom de l'entreprise *</label>
                  <input 
                    type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                    value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Catégorie *</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all" required
                      value={newLead.category} onChange={(e) => setNewLead({ ...newLead, category: e.target.value })}
                      placeholder="Ex: Plombier, Menuisier..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ville</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                      value={newLead.city} onChange={(e) => setNewLead({ ...newLead, city: e.target.value })}
                      placeholder="Ex: Paris"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adresse</label>
                  <input 
                    type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                    value={newLead.address} onChange={(e) => setNewLead({ ...newLead, address: e.target.value })}
                    placeholder="Ex: 45 Rue de Rivoli, 75001 Paris"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Site Internet</label>
                  <input 
                    type="url" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                    value={newLead.website} onChange={(e) => setNewLead({ ...newLead, website: e.target.value })}
                    placeholder="https://www.exemple.fr"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
                    <input 
                      type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                      value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Téléphone</label>
                    <input 
                      type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                      value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notes</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all min-h-[80px]"
                    value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-slate-100 bg-slate-50">
                <button type="button" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all duration-150" onClick={() => setShowAddModal(false)}>Annuler</button>
                <button type="submit" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 active:scale-95 transition-all duration-150" disabled={actionInProgress}>Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-in side drawer (CRM view) */}
      {activeLeadDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end transition-opacity" onClick={() => setActiveLeadDetails(null)}>
          <div className="w-full max-w-lg bg-white h-screen border-l border-slate-200 shadow-2xl flex flex-col justify-between animate-[drawerSlideIn_0.3s_cubic-bezier(0.16,1,0.3,1)]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-teal-600" />
                  {activeLeadDetails.name}
                </h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider mt-2 ${getStatusBadgeClass(activeLeadDetails.status)}`}>
                  {getStatusLabel(activeLeadDetails.status)}
                </span>
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1" onClick={() => setActiveLeadDetails(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              
              {/* Profile Overview */}
              <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Profil Général
                </span>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Secteur</span>
                    <strong className="text-slate-800 font-bold">{activeLeadDetails.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Localité</span>
                    <strong className="text-slate-800 font-bold">{activeLeadDetails.city || '—'}</strong>
                  </div>
                  {activeLeadDetails.rating && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Avis Google Maps</span>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                        <strong className="text-slate-800 text-sm font-bold">{activeLeadDetails.rating}</strong>
                        <span className="text-slate-400 text-2xs">({activeLeadDetails.review_count || 0} avis)</span>
                      </div>
                    </div>
                  )}
                  {activeLeadDetails.address && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Adresse</span>
                      <span className="text-slate-600">{activeLeadDetails.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact details */}
              <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Coordonnées
                </span>
                <div className="space-y-3 text-xs">
                  {/* Web */}
                  <div className="flex items-start gap-3">
                    <Globe className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Site Internet</span>
                      {activeLeadDetails.website ? (
                        <a href={activeLeadDetails.website} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-700 font-semibold inline-flex items-center gap-1 mt-0.5">
                          {activeLeadDetails.website}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-red-500">Aucun site détecté (Cible Web Design)</span>
                      )}
                    </div>
                  </div>
                  {/* Email */}
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Email</span>
                      {activeLeadDetails.email ? (
                        <a href={`mailto:${activeLeadDetails.email}`} className="text-teal-600 hover:text-teal-700 font-semibold mt-0.5 block">
                          {activeLeadDetails.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">Non disponible</span>
                      )}
                    </div>
                  </div>
                  {/* Phone */}
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Téléphone</span>
                      {activeLeadDetails.phone ? (
                        <strong className="text-slate-800 block mt-0.5">{activeLeadDetails.phone}</strong>
                      ) : (
                        <span className="text-slate-400">Non disponible</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scraper action inside drawer */}
              {activeLeadDetails.website && !activeLeadDetails.email && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex justify-between items-center gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-teal-800">Crawler le site du prospect</h5>
                    <p className="text-[10px] text-slate-500 mt-0.5">Scraping des emails et détection de sécurité.</p>
                  </div>
                  <button 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 transition-colors"
                    onClick={() => handleScrapeContactInfo(activeLeadDetails.id)}
                    disabled={scrapingLeadId === activeLeadDetails.id}
                  >
                    {scrapingLeadId === activeLeadDetails.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Lancer'
                    )}
                  </button>
                </div>
              )}



              {/* Status Selector */}
              <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Statut du Pipeline
                </span>
                <div className="flex gap-2 flex-wrap">
                  {PIPELINE_STATUSES.map(st => (
                    <button 
                      key={st} type="button" 
                      className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${activeLeadDetails.status === st ? 'bg-teal-600 border-teal-700 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => handleUpdateStatus(activeLeadDetails.id, st)}
                    >
                      {getStatusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* General Note */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Notes Générales</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-teal-500 min-h-[80px]" 
                  defaultValue={activeLeadDetails.notes} 
                  onBlur={(e) => handleSaveNotes(activeLeadDetails.id, e.target.value)}
                  placeholder="Saisissez des notes sur ce prospect..."
                />
              </div>

              {/* Discussions & Timeline */}
              <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-4">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Historique des Échanges
                </span>

                {/* Form to add note */}
                <form onSubmit={handleAddDiscussion} className="space-y-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { type: 'Note', label: 'Note', icon: FileText, color: '#64748b', bg: 'bg-slate-50 border-slate-200 text-slate-600' },
                      { type: 'Email', label: 'Email', icon: Mail, color: '#059669', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                      { type: 'Call', label: 'Appel', icon: Phone, color: '#d97706', bg: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { type: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle, color: '#0d9488', bg: 'bg-teal-50 border-teal-200 text-teal-700' },
                      { type: 'Meeting', label: 'RDV', icon: Calendar, color: '#7c3aed', bg: 'bg-violet-50 border-violet-200 text-violet-700' }
                    ].map(btn => {
                      const Icon = btn.icon;
                      const isSelected = discussionType === btn.type;
                      return (
                        <button
                          key={btn.type} type="button"
                          onClick={() => setDiscussionType(btn.type)}
                          className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border text-[9px] font-bold uppercase transition-all ${isSelected ? btn.bg : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text" className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500"
                      value={discussionContent} onChange={(e) => setDiscussionContent(e.target.value)}
                      placeholder={`Résumé de l'échange (${discussionType})...`}
                      required
                    />
                    <button
                      type="submit" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700"
                      disabled={addingDiscussion || !discussionContent.trim()}
                    >
                      {addingDiscussion ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Ajouter'}
                    </button>
                  </div>
                </form>

                {/* Timeline list */}
                {loadingDiscussions ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-teal-600" />
                  </div>
                ) : discussions.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-white/40">
                    <MessageSquare className="w-5 h-5 mx-auto mb-2 text-slate-300" />
                    <p className="text-3xs text-slate-400">Aucun échange pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {discussions.map((item) => {
                      const configMap = {
                        'Note': { icon: FileText, color: 'text-slate-500', label: 'Note', bg: 'bg-slate-50 border-slate-200' },
                        'Email': { icon: Mail, color: 'text-emerald-600', label: 'Email', bg: 'bg-emerald-50 border-emerald-200' },
                        'Call': { icon: Phone, color: 'text-amber-500', label: 'Appel', bg: 'bg-amber-50 border-amber-200' },
                        'WhatsApp': { icon: MessageCircle, color: 'text-teal-600', label: 'WhatsApp', bg: 'bg-teal-50 border-teal-200' },
                        'Meeting': { icon: Calendar, color: 'text-violet-600', label: 'RDV', bg: 'bg-violet-50 border-violet-200' }
                      };
                      const config = configMap[item.type] || { icon: FileText, color: 'text-slate-500', label: item.type, bg: 'bg-slate-50 border-slate-200' };
                      const ItemIcon = config.icon;
                      
                      const dateObj = new Date(item.created_at);
                      const formattedDate = isNaN(dateObj.getTime())
                        ? item.created_at
                        : dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

                      return (
                        <div key={item.id} className="relative group flex gap-3 p-3 bg-white border border-slate-150 rounded-xl">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                            <ItemIcon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className={`text-[9px] font-bold uppercase ${config.color}`}>{config.label}</span>
                              <span className="text-[9px] text-slate-400">{formattedDate}</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-normal overflow-wrap-anywhere">{item.content}</p>
                          </div>

                          <button
                            type="button" className="absolute top-2.5 right-2.5 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteDiscussion(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button type="button" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50" onClick={() => setActiveLeadDetails(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: File Import Wizard */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-[modalFadeIn_0.25s_ease-out] flex flex-col justify-between ${importStep === 2 ? 'max-w-4xl' : 'max-w-lg'}`}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5 text-teal-600" />
                  Assistant d'importation de prospects
                </h3>
                <p className="text-3xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                  Étape {importStep} sur 4 : {
                    importStep === 1 ? "Téléversement" :
                    importStep === 2 ? "Correspondance & classification" :
                    importStep === 3 ? "Importation en cours" : "Rapport de fin"
                  }
                </p>
              </div>
              {importStep !== 3 && (
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowImportModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {/* STEP 1 */}
              {importStep === 1 && (
                <div className="space-y-4">
                  <p className="text-slate-500 text-sm">
                    Sélectionnez un fichier <strong>JSON</strong>, <strong>CSV</strong>, ou <strong>Excel (.xlsx, .xls)</strong> contenant vos cibles.
                  </p>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault(); setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelection(e.dataTransfer.files[0]);
                    }}
                    onClick={() => document.getElementById('import-file-input').click()}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-4 ${isDragging ? 'border-teal-500 bg-teal-50/30' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'}`}
                  >
                    <input 
                      type="file" id="import-file-input" className="hidden" accept=".json,.csv,.txt,.xlsx,.xls"
                      onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileSelection(e.target.files[0]); }}
                    />
                    <FileText className={`w-12 h-12 ${isDragging ? 'text-teal-600' : 'text-slate-400'}`} />
                    <div>
                      <strong className="text-slate-800 text-sm block mb-1">Déposez votre fichier ici</strong>
                      <span className="text-slate-400 text-xs">Ou cliquez pour parcourir les dossiers</span>
                    </div>
                  </div>

                  {importError && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                      <span>{importError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2 */}
              {importStep === 2 && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Valeurs de classification par défaut</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-3xs font-bold text-slate-500 uppercase tracking-wider mb-1">Secteur / Catégorie *</label>
                        <input 
                          type="text" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                          value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} required
                        />
                      </div>
                      <div>
                        <label className="block text-3xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ville par défaut</label>
                        <input 
                          type="text" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                          value={defaultCity} onChange={(e) => setDefaultCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-3xs font-bold text-slate-500 uppercase tracking-wider mb-1">Statut initial</label>
                        <select 
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                          value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)}
                        >
                          {PIPELINE_STATUSES.map(st => (
                            <option key={st} value={st}>{getStatusLabel(st)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-heading font-extrabold text-slate-800 text-sm">Correspondance des attributs</h4>
                    <p className="text-slate-400 text-xs">Mappez les colonnes détectées dans <strong>{uploadedFileName}</strong> aux variables du CRM.</p>
                  </div>

                  <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-4 max-h-48 overflow-y-auto space-y-2.5">
                    <div className="grid grid-cols-2 gap-4 pb-2 border-b border-slate-200 text-3xs font-bold text-slate-400 uppercase">
                      <span>Variable base locale</span>
                      <span>Colonne de votre fichier</span>
                    </div>
                    {DATABASE_FIELDS.map(field => (
                      <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                        <span className={`text-xs ${field.required ? 'font-bold text-slate-800' : 'text-slate-500'}`}>{field.label}</span>
                        <select
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                          value={columnMappings[field.key] || ''}
                          onChange={(e) => setColumnMappings({ ...columnMappings, [field.key]: e.target.value })}
                        >
                          <option value="">-- Ignorer cet attribut --</option>
                          {parsedHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-heading font-extrabold text-slate-800 text-sm">Aperçu de l'Importation</h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-32">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold">
                            {DATABASE_FIELDS.filter(f => columnMappings[f.key]).map(f => (
                              <th key={f.key} className="p-2.5 whitespace-nowrap">{f.label.replace(' *', '')}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.slice(0, 3).map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-b-0 text-slate-600">
                              {DATABASE_FIELDS.filter(f => columnMappings[f.key]).map(f => {
                                const col = columnMappings[f.key];
                                let val = row[col];
                                if (typeof val === 'object') val = JSON.stringify(val);
                                if (f.key === 'category' && !val) val = defaultCategory;
                                if (f.key === 'city' && !val) val = defaultCity || '—';
                                return (
                                  <td key={f.key} className="p-2.5 whitespace-nowrap max-w-[150px] overflow-hidden text-ellipsis">{val !== undefined && val !== '' ? String(val) : '—'}</td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3 */}
              {importStep === 3 && (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                  <RefreshCw className="w-12 h-12 text-teal-600 animate-spin" />
                  <div>
                    <h4 className="font-heading font-extrabold text-slate-800 text-base">Traitement de l'importation...</h4>
                    <p className="text-slate-500 text-xs mt-1">Nettoyage, indexation et de-duplication en tâche de fond.</p>
                  </div>
                  <div className="w-full max-w-xs">
                    <div className="flex justify-between text-2xs font-bold text-slate-400 mb-1.5 uppercase">
                      <span>Progression</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600 transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 */}
              {importStep === 4 && (
                <div className="py-6 flex flex-col items-center justify-center gap-5 text-center">
                  <div className="w-14 h-14 bg-emerald-50 border-2 border-emerald-500 rounded-full flex items-center justify-center text-emerald-600 shadow-sm shadow-emerald-500/10">
                    <Check className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-slate-800 text-lg">Importation complétée !</h3>
                    <p className="text-slate-500 text-sm mt-1">Vos prospects ont été correctement importés et qualifiés.</p>
                  </div>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-left text-xs text-slate-600">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Rapport d'activité</span>
                    <div className="flex justify-between">
                      <span>Total des cibles analysées :</span>
                      <strong className="text-slate-800">{importResult.total}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Prospects importés :</span>
                      <strong className="text-emerald-600">+{importResult.inserted}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Doublons ignorés (sécurité) :</span>
                      <strong className="text-amber-600">{importResult.skipped}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              {importStep === 1 && (
                <button type="button" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50" onClick={() => setShowImportModal(false)}>Fermer</button>
              )}
              {importStep === 2 && (
                <>
                  <button type="button" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50" onClick={() => setImportStep(1)}>Précédent</button>
                  <button type="button" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700 disabled:opacity-50" onClick={handleLaunchImport} disabled={!columnMappings.name}>
                    Lancer l'import ({parsedRows.length} prospects)
                  </button>
                </>
              )}
              {importStep === 4 && (
                <button type="button" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-xs hover:bg-teal-700" onClick={() => setShowImportModal(false)}>Terminer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
