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
  Code2,
  Clock,
  X,
  Upload,
  Kanban,
  LayoutList,
  Building2
} from 'lucide-react';

// Pipeline statuses matching the PRD (§4.2)
const PIPELINE_STATUSES = [
  'New',
  'Contacted',
  'Meeting Scheduled',
  'Proposal Sent',
  'Closed Won',
  'Closed Lost'
];

// Database fields metadata for smart mapping & classification
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

// Robust zero-dependency CSV parser that supports standard commas, French semicolons, and escaped quotes/newlines.
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

// Dynamic SheetJS Excel parser loader via CDN — ensures no dependency footprint unless needed.
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
  
  // Strict Category Tabs System
  const [activeCategoryTab, setActiveCategoryTab] = useState('All');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [emailFilter, setEmailFilter] = useState('All'); 
  const [websiteFilter, setWebsiteFilter] = useState('All');
  
  // Selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  
  // CRM view states
  const [viewMode, setViewMode] = useState('board'); // Default to Board View
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeLeadDetails, setActiveLeadDetails] = useState(null);
  
  // Action loaders
  const [scrapingLeadId, setScrapingLeadId] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [mapsScraping, setMapsScraping] = useState(false);
  const [scrapingSeconds, setScrapingSeconds] = useState(0);
  
  // Google Maps Link Input
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  
  // Form states for manual lead
  const [newLead, setNewLead] = useState({
    name: '', category: 'Plombier', website: '', phone: '', email: '', city: '', address: '', notes: ''
  });

  // File Import Wizard States
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1: Upload, 2: Mapping, 3: Importing, 4: Success
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

  // Column auto-matching based on keywords
  const autoMatchColumn = (field, fileHeaders) => {
    const normalizedField = field.key.toLowerCase();
    
    // Try exact match first
    for (const h of fileHeaders) {
      const normalizedH = h.toLowerCase().trim();
      if (normalizedH === normalizedField) return h;
    }
    
    // Try keyword matches
    for (const keyword of field.keywords) {
      for (const h of fileHeaders) {
        const normalizedH = h.toLowerCase().trim();
        if (normalizedH.includes(keyword) || keyword.includes(normalizedH)) {
          return h;
        }
      }
    }
    
    return ''; // Default: no mapping found
  };

  // Extract unique categories (strictly grouped, no mixing!)
  const uniqueCategories = useMemo(() => [...new Set(leads.map(l => l.category))], [leads]);

  // Filter unique categories by sector search term
  const filteredUniqueCategories = useMemo(() => {
    return uniqueCategories.filter(cat => 
      cat.toLowerCase().includes(categorySearchTerm.toLowerCase())
    );
  }, [uniqueCategories, categorySearchTerm]);

  // Vulnerability metrics (computed once)
  const vulnMetrics = useMemo(() => {
    const noWebsite = leads.filter(l => !l.website || l.website.trim() === '').length;
    const noSSL = leads.filter(l => l.website && l.has_ssl === 0).length;
    const noMobile = leads.filter(l => l.website && l.is_mobile_friendly === 0).length;
    const noAutomation = leads.filter(l => l.website && l.has_chat_widget === 0).length;
    return { noWebsite, noSSL, noMobile, noAutomation };
  }, [leads]);

  // Filtering Logic
  const filteredLeads = useMemo(() => leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.address?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Strict category filtering
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

  // Handle multi-select toggles
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

  // Timer effect for Google Maps scraping
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
      return `Initialisation du navigateur headless Puppeteer... (Étape 1/5)`;
    } else if (scrapingSeconds < 16) {
      return `Ouverture de Google Maps et acceptation automatique des cookies... (Étape 2/5)`;
    } else if (scrapingSeconds < 45) {
      return `Défilement dynamique de la carte et extraction des établissements visibles... (Étape 3/5)`;
    } else if (scrapingSeconds < 68) {
      return `Analyse et filtrage strict : isolation des établissements avec site web... (Étape 4/5)`;
    } else {
      return `Enregistrement des prospects qualifiés et calcul des audits digitaux... (Étape 5/5)`;
    }
  };

  // Google Maps Link Scraper Endpoint Call
  const handleMapsLinkScrape = async (e) => {
    e.preventDefault();
    if (!googleMapsUrl.trim()) return;

    setMapsScraping(true);
    try {
      const response = await fetch(`${apiHost}/api/leads/scrape-maps-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapsUrl: googleMapsUrl })
      });
      const data = await response.json();

      if (response.ok) {
        await reloadLeads();
        setGoogleMapsUrl('');
        
        if (data.category) {
          setActiveCategoryTab(data.category);
        }

        alert(`🎉 ${data.message}\n(Seuls les établissements disposant d'un site web ont été importés !)`);
      } else {
        alert(data.error || 'Erreur lors du scraping de la recherche Google Maps');
      }
    } catch (err) {
      console.error(err);
      alert('Impossible d\'exécuter le scraping Maps. Le serveur backend n\'est pas joignable.');
    } finally {
      setMapsScraping(false);
    }
  };

  // Trigger Local Website Scraper
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

  // Add Manual Lead
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

  // File Import Logic: Step 1: Parse File (JSON, CSV, or Excel)
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
          if (rawRows.length === 0) {
            throw new Error("Le fichier JSON est vide.");
          }
          // Extract headers from keys of all items
          const headersSet = new Set();
          rawRows.forEach(item => {
            Object.keys(item).forEach(k => headersSet.add(k));
          });
          const headers = Array.from(headersSet);
          
          setParsedHeaders(headers);
          setParsedRows(rawRows);
          
          // Pre-match mappings
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
          if (rows.length === 0) {
            throw new Error("Le fichier CSV est vide ou n'a pu être parsé.");
          }
          setParsedHeaders(headers);
          setParsedRows(rows);
          
          // Pre-match mappings
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
      // Dynamic excel loading
      try {
        setImportError("Chargement du module Excel (SheetJS)...");
        const XLSX = await loadSheetJS();
        setImportError('');
        
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            if (workbook.SheetNames.length === 0) {
              throw new Error("Le fichier Excel ne contient pas de feuilles.");
            }
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = XLSX.utils.sheet_to_json(worksheet);
            
            if (rawRows.length === 0) {
              throw new Error("La feuille Excel sélectionnée est vide.");
            }
            
            // Extract headers
            const headersSet = new Set();
            rawRows.forEach(item => {
              Object.keys(item).forEach(k => headersSet.add(k));
            });
            const headers = Array.from(headersSet);
            
            setParsedHeaders(headers);
            setParsedRows(rawRows);
            
            // Pre-match mappings
            const initialMappings = {};
            DATABASE_FIELDS.forEach(field => {
              initialMappings[field.key] = autoMatchColumn(field, headers);
            });
            setColumnMappings(initialMappings);
            setImportStep(2);
          } catch (err) {
            setImportError("Erreur lors de la lecture du fichier Excel: " + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setImportError("Impossible de charger le parser Excel depuis le CDN. Vérifiez votre connexion internet.");
      }
    } else {
      setImportError("Format de fichier non pris en charge. Veuillez fournir un fichier .json, .csv, ou .xlsx/.xls.");
    }
  };

  // Launch Lead Import in accurate progress chunks
  const handleLaunchImport = async () => {
    // Check if Name is mapped
    if (!columnMappings.name) {
      alert("Le champ 'Nom de l'entreprise' est obligatoire pour l'importation.");
      return;
    }

    setImportStep(3);
    setImportProgress(0);

    // Build lead objects based on mappings
    const structuredLeads = parsedRows.map(row => {
      const lead = {};
      
      DATABASE_FIELDS.forEach(field => {
        const fileCol = columnMappings[field.key];
        let val = fileCol ? row[fileCol] : undefined;
        
        // Normalize digital audit flags (SSL, mobile, chat)
        if (['has_ssl', 'is_mobile_friendly', 'has_chat_widget'].includes(field.key)) {
          if (val !== undefined) {
            const strVal = String(val).toLowerCase().trim();
            if (strVal === 'oui' || strVal === 'yes' || strVal === 'true' || strVal === '1' || val === 1 || val === true) {
              lead[field.key] = 1;
            } else {
              lead[field.key] = 0;
            }
          }
        } else if (field.key === 'rating') {
          if (val !== undefined && val !== null && val !== '') {
            lead[field.key] = parseFloat(val) || null;
          }
        } else if (field.key === 'review_count') {
          if (val !== undefined && val !== null && val !== '') {
            lead[field.key] = parseInt(val) || 0;
          }
        } else {
          lead[field.key] = val;
        }
      });

      // Classification & Default settings
      lead.name = lead.name ? String(lead.name).trim() : '';
      lead.category = lead.category || defaultCategory || 'Importé';
      lead.city = lead.city || defaultCity || null;
      lead.status = lead.status || defaultStatus || 'New';
      
      return lead;
    }).filter(lead => lead.name.length > 0); // Exclude rows with empty names

    if (structuredLeads.length === 0) {
      alert("Aucune donnée valide à importer.");
      setImportStep(2);
      return;
    }

    // Split into chunks of 30 to show a premium progress indicator
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
        } else {
          const errorMsg = await response.text();
          console.error("Batch failure:", errorMsg);
        }

        const pct = Math.round(((i + chunk.length) / structuredLeads.length) * 100);
        setImportProgress(pct);
        
        // Small delay for UI smoothness
        await new Promise(r => setTimeout(r, 150));
      }

      setImportResult({
        inserted: totalInserted,
        skipped: totalSkipped,
        total: structuredLeads.length
      });

      await reloadLeads();
      setImportStep(4);
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de l'importation réseau.");
      setImportStep(2);
    }
  };

  // Delete Leads
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

  // Clean duplicates manually via API
  const handleCleanDuplicates = async () => {
    if (!window.confirm("Voulez-vous lancer l'élimination des doublons dans la base de données ?")) return;
    
    setActionInProgress(true);
    try {
      const response = await fetch(`${apiHost}/api/leads/cleanup`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        await reloadLeads();
        alert(`✨ Nettoyage terminé !\n${data.message}`);
      } else {
        alert("Erreur lors de la suppression des doublons.");
      }
    } catch (err) {
      console.error(err);
      alert("Impossible de contacter le serveur backend.");
    } finally {
      setActionInProgress(false);
    }
  };

  // Update Lead Status
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
    } catch (err) {
      console.error(err);
    }
  };

  // HTML5 Kanban Drag & Drop Handlers
  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStatus(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
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

  // Save Lead Notes
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
    } catch (err) {
      console.error(err);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Nom', 'Catégorie', 'Ville', 'Adresse', 'Site Web', 'Email', 'Téléphone', 'Note Maps', 'Avis', 'Statut', 'SSL', 'Mobile', 'Automatisation'];
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
      l.status || '',
      l.has_ssl ? 'Oui' : 'Non',
      l.is_mobile_friendly ? 'Oui' : 'Non',
      l.has_chat_widget ? 'Oui' : 'Non'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

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
      case 'New': return 'badge-new';
      case 'Contacted': return 'badge-contacted';
      case 'Meeting Scheduled': return 'badge-meeting';
      case 'Proposal Sent': return 'badge-proposal';
      case 'Closed Won': return 'badge-won';
      case 'Closed Lost': return 'badge-lost';
      // Legacy statuses fallback
      case 'Contacting': return 'badge-contacting';
      case 'Warm': return 'badge-warm';
      case 'Replied': return 'badge-replied';
      case 'Do Not Contact': return 'badge-dnc';
      default: return 'badge-new';
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

  // Get vulnerability flags for a lead
  const getVulnFlags = (lead) => {
    const flags = [];
    if (!lead.website || lead.website.trim() === '') {
      flags.push({ label: 'Pas de Site', cls: 'vuln-flag-critical', icon: Globe });
    } else {
      if (lead.has_ssl === 0) {
        flags.push({ label: 'Pas de SSL', cls: 'vuln-flag-warning', icon: ShieldOff });
      }
      if (lead.is_mobile_friendly === 0) {
        flags.push({ label: 'Non Mobile', cls: 'vuln-flag-info', icon: Smartphone });
      }
      if (lead.has_chat_widget === 0) {
        flags.push({ label: '0 Auto.', cls: 'vuln-flag-info', icon: MessageSquare });
      }
    }
    return flags;
  };

  // Digital audit health dots
  const getAuditDots = (lead) => {
    if (!lead.website || lead.website.trim() === '') {
      return [
        { color: 'audit-dot-red', title: 'Aucun site web' },
        { color: 'audit-dot-gray', title: 'N/A' },
        { color: 'audit-dot-gray', title: 'N/A' },
        { color: 'audit-dot-gray', title: 'N/A' }
      ];
    }
    return [
      { color: 'audit-dot-green', title: 'Site web présent' },
      { color: lead.has_ssl ? 'audit-dot-green' : 'audit-dot-red', title: lead.has_ssl ? 'SSL actif' : 'Pas de SSL' },
      { color: lead.is_mobile_friendly ? 'audit-dot-green' : 'audit-dot-yellow', title: lead.is_mobile_friendly ? 'Mobile-friendly' : 'Non optimisé mobile' },
      { color: lead.has_chat_widget ? 'audit-dot-green' : 'audit-dot-red', title: lead.has_chat_widget ? 'Widget chat/booking' : 'Aucune automatisation' }
    ];
  };

  // Parse social handles JSON safely
  const parseSocialHandles = (jsonStr) => {
    if (!jsonStr) return {};
    try {
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex-between mb-20">
        <div>
          <h2>Gestionnaire de Prospects</h2>
          <p style={{ color: '#a3a3a3', fontSize: '14px', marginTop: '4px' }}>
            Importez, analysez et qualifiez vos cibles avec l'audit digital automatisé.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* CRM View Toggle (Board vs List) */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginRight: '8px' }}>
            <button 
              className={`btn btn-sm`}
              style={{ 
                padding: '6px 12px', 
                borderRadius: '8px', 
                background: viewMode === 'board' ? 'var(--primary)' : 'transparent',
                borderColor: 'transparent',
                color: '#fff',
                boxShadow: viewMode === 'board' ? '0 2px 8px var(--primary-glow)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setViewMode('board')}
              title="Affichage Pipeline / Kanban CRM"
            >
              <Kanban style={{ width: '13px' }} />
              Pipeline
            </button>
            <button 
              className={`btn btn-sm`}
              style={{ 
                padding: '6px 12px', 
                borderRadius: '8px', 
                background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
                borderColor: 'transparent',
                color: '#fff',
                boxShadow: viewMode === 'list' ? '0 2px 8px var(--primary-glow)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setViewMode('list')}
              title="Affichage Liste / Table de données"
            >
              <LayoutList style={{ width: '13px' }} />
              Table
            </button>
          </div>

          {selectedLeadIds.length > 0 && (
            <button 
              className="btn btn-danger btn-sm"
              onClick={() => handleDeleteLeads(selectedLeadIds)}
              disabled={actionInProgress}
            >
              <Trash2 style={{ width: '14px' }} />
              Supprimer ({selectedLeadIds.length})
            </button>
          )}
          <button 
            className="btn btn-export btn-sm"
            onClick={handleExportCSV}
            disabled={filteredLeads.length === 0}
            title="Exporter les prospects filtrés en CSV"
          >
            <Download style={{ width: '14px' }} />
            Exporter CSV
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setImportStep(1);
              setUploadedFileName('');
              setParsedHeaders([]);
              setParsedRows([]);
              setColumnMappings({});
              setImportError('');
              setShowImportModal(true);
            }}
            title="Importer des prospects depuis un fichier JSON, CSV ou Excel"
          >
            <Upload style={{ width: '14px' }} />
            Importer
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleCleanDuplicates}
            disabled={actionInProgress}
            style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.15)', background: 'rgba(251, 191, 36, 0.03)' }}
            title="Éliminer tous les doublons de prospects de la base de données"
          >
            <Sparkles style={{ width: '14px', color: '#fbbf24' }} />
            Nettoyer Doublons
          </button>
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus style={{ width: '14px' }} />
            Ajouter
          </button>
        </div>
      </div>

      {/* GOOGLE MAPS LINK SCRAPER WIDGET */}
      <div className="glass-panel mb-20" style={{ border: '1px solid rgba(0,188,125,0.15)', background: 'rgba(0, 188, 125, 0.02)' }}>
        <h4 style={{ fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#00BC7D' }}>
          <Sparkles style={{ width: '16px' }} />
          Extracteur Google Maps & Audit Digital Automatique
        </h4>
        <p style={{ color: '#a3a3a3', fontSize: '12px', marginBottom: '14px' }}>
          Collez le lien de votre recherche Google Maps. Le système extrait les établissements, <strong>élimine ceux sans site web</strong>, détecte les failles digitales et classe tout par catégories hermétiques.
        </p>
        <form onSubmit={handleMapsLinkScrape} style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Link2 style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', color: '#666' }} />
            <input 
              type="url" 
              className="form-control" 
              style={{ paddingLeft: '38px', borderColor: 'rgba(0, 188, 125, 0.2)' }}
              placeholder="Ex: https://www.google.com/maps/search/Plombiers+Bordeaux/..." 
              value={googleMapsUrl}
              onChange={(e) => setGoogleMapsUrl(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary btn-sm"
            style={{ minWidth: '180px' }}
            disabled={mapsScraping}
          >
            {mapsScraping ? (
              <>
                <RefreshCw style={{ width: '14px', animation: 'spin 1s linear infinite' }} />
                Scraping en cours...
              </>
            ) : (
              'Scraper cette Zone'
            )}
          </button>
        </form>

        {mapsScraping && (
          <div style={{ marginTop: '14px', padding: '12px 16px', background: 'rgba(0,188,125,0.06)', borderRadius: '8px', border: '1px solid rgba(0,188,125,0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#00BC7D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="pulse-indicator"></span>
                Robot d'extraction actif
              </span>
              <span style={{ fontSize: '11px', color: '#888' }}>{scrapingSeconds}s écoulées</span>
            </div>
            <p style={{ fontSize: '12px', color: '#e5e7eb', margin: 0, fontWeight: 500 }}>
              {getScrapingProgressMessage()}
            </p>
            <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #00BC7D, #87D6C2)', 
                  width: `${Math.min(95, (scrapingSeconds / 75) * 100)}%`, 
                  transition: 'width 1s linear' 
                }} 
              />
            </div>
            <span style={{ fontSize: '10px', color: '#666' }}>Note: Le scraping réel de Google Maps peut prendre de 30 à 90 secondes selon la taille de la zone.</span>
          </div>
        )}
      </div>

      {/* VULNERABILITY METRIC FLAGS SUMMARY BAR (PRD §4.2) */}
      <div className="glass-panel mb-20" style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Indicateurs de Vulnérabilité
          </span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span className="vuln-flag vuln-flag-critical">
              <Globe style={{ width: '10px' }} />
              {vulnMetrics.noWebsite} sans site web
            </span>
            <span className="vuln-flag vuln-flag-warning">
              <ShieldOff style={{ width: '10px' }} />
              {vulnMetrics.noSSL} sans SSL
            </span>
            <span className="vuln-flag vuln-flag-info">
              <Smartphone style={{ width: '10px' }} />
              {vulnMetrics.noMobile} non mobile
            </span>
            <span className="vuln-flag vuln-flag-info">
              <MessageSquare style={{ width: '10px' }} />
              {vulnMetrics.noAutomation} sans automatisation
            </span>
          </div>
        </div>
      </div>

      {/* STRICT CATEGORY TAB BAR */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Sections Catégories (Secteurs Hermétiques)
          </span>
          {/* Sector Quick Search */}
          <div style={{ position: 'relative', width: '180px' }}>
            <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px', color: '#666' }} />
            <input 
              type="text" 
              className="form-control form-control-sm" 
              style={{ paddingLeft: '28px', height: '28px', borderRadius: '8px', fontSize: '11px', background: 'rgba(8, 8, 8, 0.4)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#fff' }}
              placeholder="Rechercher un secteur..."
              value={categorySearchTerm}
              onChange={(e) => setCategorySearchTerm(e.target.value)}
            />
            {categorySearchTerm && (
              <button 
                onClick={() => setCategorySearchTerm('')} 
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '10px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button 
            className={`btn btn-secondary btn-sm ${activeCategoryTab === 'All' ? 'active' : ''}`}
            style={{ 
              borderRadius: '10px',
              background: activeCategoryTab === 'All' ? 'rgba(255,255,255,0.08)' : 'rgba(13,13,13,0.5)',
              borderColor: activeCategoryTab === 'All' ? '#fff' : 'rgba(255,255,255,0.05)',
              color: '#fff'
            }}
            onClick={() => { setActiveCategoryTab('All'); setSelectedLeadIds([]); }}
          >
            Tous les Secteurs ({leads.length})
          </button>
          
          {filteredUniqueCategories.map(cat => {
            const count = leads.filter(l => l.category === cat).length;
            return (
              <button 
                key={cat}
                className={`btn btn-secondary btn-sm ${activeCategoryTab === cat ? 'active' : ''}`}
                style={{ 
                  borderRadius: '10px',
                  background: activeCategoryTab === cat ? 'rgba(0,188,125,0.12)' : 'rgba(13,13,13,0.5)',
                  borderColor: activeCategoryTab === cat ? '#00BC7D' : 'rgba(255,255,255,0.05)',
                  color: activeCategoryTab === cat ? '#00BC7D' : '#a3a3a3'
                }}
                onClick={() => { setActiveCategoryTab(cat); setSelectedLeadIds([]); }}
              >
                {cat} ({count})
              </button>
            );
          })}
          {filteredUniqueCategories.length === 0 && categorySearchTerm && (
            <span style={{ fontSize: '12px', color: '#666', padding: '6px 12px' }}>Aucun secteur trouvé</span>
          )}
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <div className="glass-panel mb-20" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Search bar */}
          <div style={{ flex: 2, minWidth: '200px', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', color: '#666' }} />
            <input 
              type="text" 
              className="form-control form-control-sm" 
              style={{ paddingLeft: '36px', height: '38px', borderRadius: '10px' }}
              placeholder={`Rechercher dans ${activeCategoryTab === 'All' ? 'tous les secteurs' : activeCategoryTab}...`} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Sector / Category Filter */}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              className="form-control" 
              style={{ height: '38px', borderRadius: '10px', fontSize: '13px' }}
              value={activeCategoryTab}
              onChange={(e) => { setActiveCategoryTab(e.target.value); setSelectedLeadIds([]); }}
            >
              <option value="All">Tous les Secteurs</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ flex: 1, minWidth: '130px' }}>
            <select 
              className="form-control" 
              style={{ height: '38px', borderRadius: '10px', fontSize: '13px' }}
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="All">Tous les Statuts</option>
              {PIPELINE_STATUSES.map(st => (
                <option key={st} value={st}>{getStatusLabel(st)}</option>
              ))}
            </select>
          </div>

          {/* Email Filter */}
          <div style={{ flex: 1, minWidth: '120px' }}>
            <select 
              className="form-control" 
              style={{ height: '38px', borderRadius: '10px', fontSize: '13px' }}
              value={emailFilter} 
              onChange={(e) => setEmailFilter(e.target.value)}
            >
              <option value="All">Email : Tous</option>
              <option value="Has Email">Avec Email</option>
              <option value="No Email">Sans Email</option>
            </select>
          </div>

          {/* Website Filter (PRD §4.2) */}
          <div style={{ flex: 1, minWidth: '120px' }}>
            <select 
              className="form-control" 
              style={{ height: '38px', borderRadius: '10px', fontSize: '13px' }}
              value={websiteFilter} 
              onChange={(e) => setWebsiteFilter(e.target.value)}
            >
              <option value="All">Site : Tous</option>
              <option value="Has Website">Avec Site</option>
              <option value="No Website">Sans Site</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Leads Table */}
      {/* Main Leads CRM Workspace */}
      {viewMode === 'board' ? (
        <div className="crm-board-container" style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', minHeight: '65vh' }}>
          {PIPELINE_STATUSES.map(status => {
            const columnLeads = filteredLeads.filter(l => l.status === status);
            return (
              <div 
                key={status} 
                className={`crm-board-column ${dragOverStatus === status ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== status) {
                    setDragOverStatus(status);
                  }
                }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(e) => handleDrop(e, status)}
                style={{
                  flex: '0 0 280px',
                  background: 'rgba(13, 13, 13, 0.4)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.04)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Column Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {getStatusLabel(status)}
                    </span>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: '#888', padding: '1px 6px', borderRadius: '10px' }}>
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                {/* Column Cards Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, maxHeight: '65vh', padding: '2px' }}>
                  {columnLeads.map(lead => {
                    const vulnFlags = getVulnFlags(lead);
                    const auditDots = getAuditDots(lead);
                    
                    return (
                      <div
                        key={lead.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        className="crm-board-card"
                        onClick={() => setActiveLeadDetails(lead)}
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          padding: '14px',
                          cursor: 'grab',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                          opacity: draggedLeadId === lead.id ? 0.4 : 1
                        }}
                      >
                        {/* Company Name */}
                        <div>
                          <strong style={{ color: '#fff', fontSize: '13px', display: 'block', marginBottom: '2px' }} className="card-title-hover">
                            {lead.name}
                          </strong>
                          <span className="badge badge-contacting" style={{ fontSize: '10px', textTransform: 'none', background: 'rgba(135,214,194,0.04)', borderColor: 'rgba(135,214,194,0.1)', padding: '2px 6px' }}>
                            {lead.category}
                          </span>
                        </div>

                        {/* Location */}
                        {lead.city && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#888' }}>
                            <MapPin style={{ width: '10px', height: '10px' }} />
                            <span>{lead.city}</span>
                          </div>
                        )}

                        {/* Rating */}
                        {lead.rating && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Star style={{ width: '11px', fill: '#fbbf24', stroke: '#fbbf24' }} />
                            <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>{lead.rating}</span>
                            <span style={{ fontSize: '10px', color: '#555' }}>({lead.review_count})</span>
                          </div>
                        )}

                        {/* Quick Contact & Audit Indicators */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px', marginTop: '4px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Globe style={{ width: '12px', color: lead.website ? '#87D6C2' : '#333' }} title={lead.website || 'Pas de site'} />
                            <Mail style={{ width: '12px', color: lead.email ? '#00BC7D' : '#333' }} title={lead.email || "Pas d'email"} />
                            <Phone style={{ width: '12px', color: lead.phone ? '#fbbf24' : '#333' }} title={lead.phone || 'Pas de téléphone'} />
                          </div>
                          
                          {/* Mini Audit Dots */}
                          <div className="audit-dots" style={{ gap: '3px' }}>
                            {auditDots.map((dot, i) => (
                              <span key={i} className={`audit-dot ${dot.color}`} style={{ width: '6px', height: '6px' }} title={dot.title}></span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {columnLeads.length === 0 && (
                    <div style={{ padding: '24px 10px', textAlign: 'center', color: '#444', fontSize: '11px', border: '1px dashed rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      Déposer ici
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel table-container">
          {filteredLeads.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#666' }}>
              <AlertTriangle style={{ width: '40px', height: '40px', margin: '0 auto 12px auto', opacity: 0.5 }} />
              <h4>Aucun prospect dans cette section</h4>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                {activeCategoryTab === 'All' 
                  ? 'Importez des cibles en collant un lien Google Maps ci-dessus.' 
                  : `Aucune entreprise enregistrée sous le secteur "${activeCategoryTab}" pour ces critères.`
                }
              </p>
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll} 
                      checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                    />
                  </th>
                  <th>Nom de l'Entreprise</th>
                  <th>Secteur</th>
                  <th>Ville</th>
                  <th style={{ width: '100px' }}>Note Maps</th>
                  <th style={{ width: '100px' }}>Contact</th>
                  <th style={{ width: '80px' }}>Audit</th>
                  <th>Vulnérabilités</th>
                  <th>Pipeline</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const vulnFlags = getVulnFlags(lead);
                  const auditDots = getAuditDots(lead);
                  
                  return (
                    <tr key={lead.id} style={{ background: selectedLeadIds.includes(lead.id) ? 'rgba(0,188,125,0.02)' : '' }}>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => handleSelectLead(lead.id)}
                        />
                      </td>
                      <td>
                        <strong style={{ color: '#fff' }}>{lead.name}</strong>
                      </td>
                      <td>
                        <span className="badge badge-contacting" style={{ fontSize: '11px', textTransform: 'none', background: 'rgba(135,214,194,0.04)', borderColor: 'rgba(135,214,194,0.1)' }}>
                          {lead.category}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#a3a3a3' }}>
                          <MapPin style={{ width: '12px', height: '12px' }} />
                          {lead.city || '—'}
                        </span>
                      </td>
                      {/* Rating */}
                      <td>
                        {lead.rating ? (
                          <span className="rating-display">
                            <Star style={{ width: '12px', fill: '#fbbf24', stroke: '#fbbf24' }} />
                            <span className="rating-value">{lead.rating}</span>
                            <span className="review-count">({lead.review_count || 0})</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#333' }}>—</span>
                        )}
                      </td>
                      {/* Contact icons */}
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Globe style={{ width: '14px', color: lead.website ? '#87D6C2' : '#333' }} title={lead.website || 'Pas de site'} />
                          <Mail style={{ width: '14px', color: lead.email ? '#00BC7D' : '#333' }} title={lead.email || "Pas d'email"} />
                          <Phone style={{ width: '14px', color: lead.phone ? '#fbbf24' : '#333' }} title={lead.phone || 'Pas de téléphone'} />
                        </div>
                      </td>
                      {/* Digital Audit Health Dots */}
                      <td>
                        <div className="audit-dots">
                          {auditDots.map((dot, i) => (
                            <span key={i} className={`audit-dot ${dot.color}`} title={dot.title}></span>
                          ))}
                        </div>
                      </td>
                      {/* Vulnerability Flags */}
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {vulnFlags.length === 0 ? (
                            <span className="vuln-flag vuln-flag-success">
                              <Check style={{ width: '10px' }} />
                              OK
                            </span>
                          ) : (
                            vulnFlags.slice(0, 2).map((flag, i) => (
                              <span key={i} className={`vuln-flag ${flag.cls}`}>
                                <flag.icon style={{ width: '10px' }} />
                                {flag.label}
                              </span>
                            ))
                          )}
                          {vulnFlags.length > 2 && (
                            <span className="vuln-flag vuln-flag-warning" style={{ cursor: 'pointer' }} title={vulnFlags.slice(2).map(f => f.label).join(', ')}>
                              +{vulnFlags.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Pipeline Status */}
                      <td>
                        <span className={`badge ${getStatusBadgeClass(lead.status)}`}>
                          {getStatusLabel(lead.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {lead.website && !lead.email && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', borderRadius: '6px' }}
                              onClick={() => handleScrapeContactInfo(lead.id)}
                              disabled={scrapingLeadId === lead.id}
                              title="Crawler le site pour extraire emails & audit digital"
                            >
                              {scrapingLeadId === lead.id ? (
                                <RefreshCw style={{ width: '12px', animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <Globe style={{ width: '12px', color: '#00BC7D' }} />
                              )}
                            </button>
                          )}
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', borderRadius: '6px' }}
                            onClick={() => setActiveLeadDetails(lead)}
                            title="Voir la fiche détaillée"
                          >
                            <Eye style={{ width: '12px' }} />
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', borderRadius: '6px' }}
                            onClick={() => handleDeleteLeads([lead.id])}
                            title="Supprimer"
                          >
                            <Trash2 style={{ width: '12px', color: '#ef4444' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Add Manual Lead */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Ajouter un Nouveau Prospect</h3>
              <button className="tab-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddLeadSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nom de l'entreprise *</label>
                  <input 
                    type="text" className="form-control" required
                    value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  />
                </div>
                <div className="row">
                  <div className="col">
                    <div className="form-group">
                      <label className="form-label">Catégorie / Secteur *</label>
                      <input 
                        type="text" className="form-control" required
                        value={newLead.category} onChange={(e) => setNewLead({ ...newLead, category: e.target.value })}
                        placeholder="Ex: Plombier, Menuisier, Peintre"
                      />
                    </div>
                  </div>
                  <div className="col">
                    <div className="form-group">
                      <label className="form-label">Ville</label>
                      <input 
                        type="text" className="form-control"
                        value={newLead.city} onChange={(e) => setNewLead({ ...newLead, city: e.target.value })}
                        placeholder="Ex: Paris"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Adresse complète</label>
                  <input 
                    type="text" className="form-control"
                    value={newLead.address} onChange={(e) => setNewLead({ ...newLead, address: e.target.value })}
                    placeholder="Ex: 12 Rue de la République, 69001 Lyon"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Site Internet (URL)</label>
                  <input 
                    type="text" className="form-control"
                    value={newLead.website} onChange={(e) => setNewLead({ ...newLead, website: e.target.value })}
                    placeholder="http://www.exemple.fr"
                  />
                </div>
                <div className="row">
                  <div className="col">
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input 
                        type="email" className="form-control"
                        value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="col">
                    <div className="form-group">
                      <label className="form-label">Téléphone</label>
                      <input 
                        type="text" className="form-control"
                        value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes initiales</label>
                  <textarea 
                    className="form-control"
                    value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={actionInProgress}>Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HubSpot-style CRM Slide-in Side-Drawer */}
      {activeLeadDetails && (
        <div className="crm-drawer-overlay" onClick={() => setActiveLeadDetails(null)} style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div className="crm-drawer" onClick={(e) => e.stopPropagation()} style={{
            width: '100%',
            maxWidth: '550px',
            background: '#0d0d0d',
            height: '100vh',
            borderLeft: '1px solid var(--glass-border)',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'drawerSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '18px' }}>
                  <Building2 style={{ width: '18px', color: 'var(--primary)' }} />
                  {activeLeadDetails.name}
                </h3>
                <span className={`badge ${getStatusBadgeClass(activeLeadDetails.status)}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left', marginTop: '6px', display: 'inline-flex' }}>
                  {getStatusLabel(activeLeadDetails.status)}
                </span>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                style={{ padding: '4px 8px', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setActiveLeadDetails(null)}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Profile Overview Card */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                  Profil Général
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#555', display: 'block', fontSize: '11px' }}>SECTEUR</span>
                    <strong style={{ color: '#fff' }}>{activeLeadDetails.category}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#555', display: 'block', fontSize: '11px' }}>VILLE / LOCALITÉ</span>
                    <strong style={{ color: '#fff' }}>{activeLeadDetails.city || '—'}</strong>
                  </div>
                  {activeLeadDetails.rating && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#555', display: 'block', fontSize: '11px' }}>NOTES GOOGLE MAPS</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <Star style={{ width: '13px', fill: '#fbbf24', stroke: '#fbbf24' }} />
                        <strong style={{ color: '#fff', fontSize: '14px' }}>{activeLeadDetails.rating}</strong>
                        <span style={{ color: '#666', fontSize: '11px' }}>({activeLeadDetails.review_count || 0} avis)</span>
                      </div>
                    </div>
                  )}
                  {activeLeadDetails.address && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#555', display: 'block', fontSize: '11px' }}>ADRESSE POSTALE</span>
                      <span style={{ color: '#a3a3a3' }}>{activeLeadDetails.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Channels */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                  Coordonnées & Liens
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  
                  {/* Website */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Globe style={{ width: '14px', color: activeLeadDetails.website ? '#87D6C2' : '#444' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>SITE INTERNET</span>
                      {activeLeadDetails.website ? (
                        <a href={activeLeadDetails.website} target="_blank" rel="noreferrer" style={{ color: '#87D6C2', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          {activeLeadDetails.website}
                          <ExternalLink style={{ width: '10px' }} />
                        </a>
                      ) : (
                        <span style={{ color: '#ef4444', fontSize: '11px' }}>Aucun site détecté (Cible Web Design)</span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Mail style={{ width: '14px', color: activeLeadDetails.email ? '#00BC7D' : '#444' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>EMAIL</span>
                      {activeLeadDetails.email ? (
                        <a href={`mailto:${activeLeadDetails.email}`} style={{ color: '#00BC7D', textDecoration: 'none', fontWeight: 600 }}>
                          {activeLeadDetails.email}
                        </a>
                      ) : (
                        <span style={{ color: '#666', fontSize: '11px' }}>Non renseigné</span>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Phone style={{ width: '14px', color: activeLeadDetails.phone ? '#fbbf24' : '#444' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>TÉLÉPHONE</span>
                      {activeLeadDetails.phone ? (
                        <strong style={{ color: '#fff' }}>{activeLeadDetails.phone}</strong>
                      ) : (
                        <span style={{ color: '#666', fontSize: '11px' }}>Non renseigné</span>
                      )}
                    </div>
                  </div>

                  {/* Maps URL */}
                  {activeLeadDetails.google_maps_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <MapPin style={{ width: '14px', color: '#60a5fa' }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>GOOGLE MAPS</span>
                        <a href={activeLeadDetails.google_maps_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Fiche Google Maps
                          <ExternalLink style={{ width: '10px' }} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Crawler trigger inside drawer */}
              {activeLeadDetails.website && !activeLeadDetails.email && (
                <div style={{ padding: '14px', background: 'rgba(0,188,125,0.03)', border: '1px solid rgba(0,188,125,0.1)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h5 style={{ fontSize: '12px', color: '#fff', margin: 0 }}>Crawler & Auditer ce site</h5>
                    <p style={{ fontSize: '10px', color: '#888', margin: '2px 0 0 0' }}>Recherche d'emails et audit de sécurité SSL.</p>
                  </div>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleScrapeContactInfo(activeLeadDetails.id)}
                    disabled={scrapingLeadId === activeLeadDetails.id}
                  >
                    {scrapingLeadId === activeLeadDetails.id ? (
                      <RefreshCw style={{ width: '11px', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      'Lancer'
                    )}
                  </button>
                </div>
              )}

              {/* Digital Maturity Audit */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <h4 style={{ fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#87D6C2', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <Shield style={{ width: '14px' }} />
                  Audit Digital & Maturité
                </h4>
                <div className="enrichment-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="enrichment-card" style={{ padding: '10px' }}>
                    <div className="enrichment-label" style={{ fontSize: '9px' }}>Certificat SSL</div>
                    <div className={`enrichment-value ${activeLeadDetails.has_ssl ? 'positive' : 'negative'}`} style={{ fontSize: '12px' }}>
                      {activeLeadDetails.has_ssl ? '✓ HTTPS Actif' : '✕ Non sécurisé (HTTP)'}
                    </div>
                  </div>
                  <div className="enrichment-card" style={{ padding: '10px' }}>
                    <div className="enrichment-label" style={{ fontSize: '9px' }}>Optimisation Mobile</div>
                    <div className={`enrichment-value ${activeLeadDetails.is_mobile_friendly ? 'positive' : 'negative'}`} style={{ fontSize: '12px' }}>
                      {activeLeadDetails.is_mobile_friendly ? '✓ Responsive' : '✕ Non optimisé'}
                    </div>
                  </div>
                  <div className="enrichment-card" style={{ padding: '10px' }}>
                    <div className="enrichment-label" style={{ fontSize: '9px' }}>Widget Chat / Réservation</div>
                    <div className={`enrichment-value ${activeLeadDetails.has_chat_widget ? 'positive' : 'negative'}`} style={{ fontSize: '12px' }}>
                      {activeLeadDetails.has_chat_widget ? '✓ Présent' : '✕ Absent (Cible n8n)'}
                    </div>
                  </div>
                  <div className="enrichment-card" style={{ padding: '10px' }}>
                    <div className="enrichment-label" style={{ fontSize: '9px' }}>Stack Technique</div>
                    <div className="enrichment-value" style={{ fontSize: '12px', color: activeLeadDetails.tech_stack ? '#fbbf24' : '#666' }}>
                      {activeLeadDetails.tech_stack || 'Non détecté'}
                    </div>
                  </div>
                  {activeLeadDetails.load_time_ms && (
                    <div className="enrichment-card" style={{ padding: '10px', gridColumn: 'span 2' }}>
                      <div className="enrichment-label" style={{ fontSize: '9px' }}>Temps de Chargement</div>
                      <div className={`enrichment-value ${activeLeadDetails.load_time_ms < 2000 ? 'positive' : activeLeadDetails.load_time_ms < 4000 ? 'neutral' : 'negative'}`} style={{ fontSize: '12px' }}>
                        {activeLeadDetails.load_time_ms} ms
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Manager */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                  Statut du Pipeline
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PIPELINE_STATUSES.map((st) => (
                    <button 
                      key={st} type="button" 
                      className={`btn btn-secondary btn-sm ${activeLeadDetails.status === st ? 'active' : ''}`}
                      style={{ 
                        fontSize: '10px', 
                        padding: '4px 8px',
                        background: activeLeadDetails.status === st ? 'rgba(0,188,125,0.12)' : 'transparent',
                        borderColor: activeLeadDetails.status === st ? '#00BC7D' : 'rgba(255,255,255,0.05)'
                      }}
                      onClick={() => handleUpdateStatus(activeLeadDetails.id, st)}
                    >
                      {getStatusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editable Notes Section */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Journal d'activités & Notes</label>
                <textarea 
                  className="form-control" 
                  defaultValue={activeLeadDetails.notes} 
                  onBlur={(e) => handleSaveNotes(activeLeadDetails.id, e.target.value)}
                  placeholder="Notes privées et journal d'échanges (sauvegarde automatique)..."
                  style={{ minHeight: '130px', fontSize: '12px', background: 'rgba(8, 8, 8, 0.4)' }}
                />
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveLeadDetails(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Advanced Lead Import Wizard */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: importStep === 2 ? '850px' : '550px', transition: 'max-width 0.3s ease' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Upload style={{ width: '18px', color: '#00BC7D' }} />
                  Assistant d'importation de cibles
                </h3>
                <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  Étape {importStep} sur 4 : {
                    importStep === 1 ? "Téléversement du fichier" :
                    importStep === 2 ? "Classification & Correspondance des colonnes" :
                    importStep === 3 ? "Importation en cours" : "Rapport d'importation"
                  }
                </p>
              </div>
              {importStep !== 3 && (
                <button className="tab-btn" onClick={() => setShowImportModal(false)}>✕</button>
              )}
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh' }}>
              {/* STEP 1: UPLOAD FILE */}
              {importStep === 1 && (
                <div>
                  <p style={{ color: '#a3a3a3', fontSize: '13px', marginBottom: '16px' }}>
                    Importez votre base de prospects externe au format <strong>JSON</strong>, <strong>CSV (délimiteur virgule ou point-virgule)</strong>, ou <strong>Excel (.xlsx, .xls)</strong>.
                  </p>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileSelection(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => document.getElementById('import-file-input').click()}
                    style={{
                      border: isDragging ? '2px dashed var(--primary)' : '2px dashed rgba(255,255,255,0.1)',
                      borderRadius: '16px',
                      padding: '50px 20px',
                      textAlign: 'center',
                      background: isDragging ? 'rgba(0,188,125,0.04)' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: isDragging ? '0 0 25px rgba(0, 188, 125, 0.15)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px'
                    }}
                  >
                    <input 
                      type="file" 
                      id="import-file-input" 
                      style={{ display: 'none' }} 
                      accept=".json,.csv,.txt,.xlsx,.xls"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileSelection(e.target.files[0]);
                        }
                      }}
                    />
                    <FileText style={{ width: '48px', height: '48px', color: isDragging ? 'var(--primary)' : '#666', transition: 'color 0.2s' }} />
                    <div>
                      <strong style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                        Glissez-déposez votre fichier ici
                      </strong>
                      <span style={{ color: '#666', fontSize: '12px' }}>
                        Ou cliquez pour parcourir vos dossiers (JSON, CSV, XLSX, XLS)
                      </span>
                    </div>
                  </div>

                  {importError && (
                    <div className="glass-panel" style={{ marginTop: '16px', padding: '12px 16px', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <AlertTriangle style={{ width: '20px', height: '20px', color: 'var(--danger)', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: '#f87171' }}>{importError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: COLUMN MAPPING & CLASSIFICATION */}
              {importStep === 2 && (
                <div>
                  <div className="glass-panel mb-20" style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '10px', fontWeight: 600 }}>
                      Paramètres de classification des cibles
                    </span>
                    <div className="row">
                      <div className="col" style={{ padding: '5px' }}>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>Secteur / Catégorie par défaut</label>
                          <input 
                            type="text" 
                            className="form-control form-control-sm" 
                            style={{ height: '34px', fontSize: '12px' }}
                            placeholder="Ex: Plombier, Menuisier..." 
                            value={defaultCategory}
                            onChange={(e) => setDefaultCategory(e.target.value)}
                            required
                          />
                          <span style={{ fontSize: '10px', color: '#555' }}>Attribué si la colonne Secteur est absente ou vide.</span>
                        </div>
                      </div>
                      <div className="col" style={{ padding: '5px' }}>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>Ville par défaut</label>
                          <input 
                            type="text" 
                            className="form-control form-control-sm" 
                            style={{ height: '34px', fontSize: '12px' }}
                            placeholder="Ex: Paris, Lyon..." 
                            value={defaultCity}
                            onChange={(e) => setDefaultCity(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="col" style={{ padding: '5px' }}>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>Pipeline initial</label>
                          <select 
                            className="form-control form-control-sm" 
                            style={{ height: '34px', fontSize: '12px' }}
                            value={defaultStatus}
                            onChange={(e) => setDefaultStatus(e.target.value)}
                          >
                            {PIPELINE_STATUSES.map(st => (
                              <option key={st} value={st}>{getStatusLabel(st)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <h4 style={{ fontSize: '13px', marginBottom: '10px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Correspondance des Colonnes
                  </h4>
                  <p style={{ color: '#a3a3a3', fontSize: '12px', marginBottom: '14px' }}>
                    Associez les colonnes détectées dans votre fichier <strong>({uploadedFileName})</strong> aux attributs de notre système de prospection.
                  </p>

                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', background: 'rgba(8,8,8,0.5)', padding: '10px 16px', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '8px', fontSize: '11px', color: '#666', fontWeight: 600 }}>
                      <span>ATTRIBUT BASE DE DONNÉES</span>
                      <span>COLONNE DU FICHIER</span>
                    </div>
                    {DATABASE_FIELDS.map((field) => (
                      <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: '13px', color: field.required ? '#fff' : '#a3a3a3', fontWeight: field.required ? 600 : 400 }}>
                          {field.label}
                        </span>
                        <select
                          className="form-control form-control-sm"
                          style={{ height: '32px', fontSize: '12px', padding: '4px 8px', borderRadius: '6px' }}
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

                  {/* DATA PREVIEW TABLE */}
                  <h4 style={{ fontSize: '13px', marginBottom: '10px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Aperçu Dynamique de l'import (3 premières lignes)
                  </h4>
                  <div className="table-container" style={{ margin: 0, maxHeight: '150px' }}>
                    <table className="custom-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {DATABASE_FIELDS.filter(f => columnMappings[f.key]).map(f => (
                            <th key={f.key} style={{ padding: '8px 12px' }}>{f.label.replace(' *', '')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 3).map((row, idx) => (
                          <tr key={idx}>
                            {DATABASE_FIELDS.filter(f => columnMappings[f.key]).map(f => {
                              const col = columnMappings[f.key];
                              let displayVal = row[col];
                              if (typeof displayVal === 'object') {
                                displayVal = JSON.stringify(displayVal);
                              }
                              // Fallback display
                              if (f.key === 'category' && !displayVal) {
                                displayVal = defaultCategory;
                              }
                              if (f.key === 'city' && !displayVal) {
                                displayVal = defaultCity || '—';
                              }
                              return (
                                <td key={f.key} style={{ padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                                  {displayVal !== undefined && displayVal !== null && displayVal !== '' ? String(displayVal) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 3: IMPORTING STATE */}
              {importStep === 3 && (
                <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                  <RefreshCw style={{ width: '48px', height: '48px', color: 'var(--primary)', animation: 'spin 1.2s linear infinite' }} />
                  <div style={{ textAlign: 'center' }}>
                    <h4 style={{ fontSize: '15px', color: '#fff' }}>Importation et qualification active...</h4>
                    <p style={{ fontSize: '12px', color: '#a3a3a3', marginTop: '6px' }}>
                      Traitement de {parsedRows.length} prospects en base. De-duplication automatique en cours...
                    </p>
                  </div>
                  
                  <div style={{ width: '100%', maxWidth: '350px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                      <span>Progression</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          background: 'linear-gradient(90deg, #00BC7D, #87D6C2)', 
                          width: `${importProgress}%`, 
                          transition: 'width 0.15s ease' 
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: SUCCESS OVERVIEW */}
              {importStep === 4 && (
                <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                  <div style={{ 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: '50%', 
                    background: 'rgba(0,188,125,0.1)', 
                    border: '2px solid var(--primary)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    boxShadow: '0 0 20px rgba(0,188,125,0.2)'
                  }}>
                    <Check style={{ width: '32px', height: '32px', color: 'var(--primary)' }} />
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ fontSize: '18px', color: '#fff', marginBottom: '6px' }}>Importation complétée avec succès !</h3>
                    <p style={{ fontSize: '13px', color: '#a3a3a3' }}>
                      Votre base de données de cibles a été enrichie et qualifiée sous le secteur "{defaultCategory}".
                    </p>
                  </div>

                  <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '16px 20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '10px', fontWeight: 600 }}>
                      Rapport d'analyse de la base
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a3a3a3' }}>Total prospects traités :</span>
                        <strong style={{ color: '#fff' }}>{importResult.total}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a3a3a3' }}>Prospects importés & classés :</span>
                        <strong style={{ color: '#00BC7D' }}>+{importResult.inserted}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a3a3a3' }}>Doublons ignorés (sécurité) :</span>
                        <strong style={{ color: '#fbbf24' }}>{importResult.skipped}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {importStep === 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Fermer</button>
              )}
              
              {importStep === 2 && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setImportStep(1)}>Précédent</button>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={handleLaunchImport}
                    disabled={!columnMappings.name}
                  >
                    Lancer l'importation ({parsedRows.length} prospects)
                  </button>
                </>
              )}

              {importStep === 4 && (
                <button type="button" className="btn btn-primary" onClick={() => setShowImportModal(false)}>Terminer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animation spin styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .crm-drawer-overlay {
          transition: all 0.25s ease;
        }
        .crm-drawer {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .crm-board-column {
          transition: all 0.2s ease;
        }
        .crm-board-column.drag-over {
          border-color: var(--primary) !important;
          background: rgba(0, 188, 125, 0.08) !important;
          box-shadow: 0 0 15px rgba(0, 188, 125, 0.1) inset;
        }
        .crm-board-card {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .crm-board-card:hover {
          border-color: var(--primary-hover) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 188, 125, 0.2) !important;
          background: rgba(22, 22, 22, 0.95) !important;
        }
        .crm-board-card:active {
          cursor: grabbing;
        }
        .crm-board-card .card-title-hover {
          transition: color 0.15s ease;
        }
        .crm-board-card:hover .card-title-hover {
          color: var(--primary) !important;
        }
      `}</style>
    </div>
  );
}
