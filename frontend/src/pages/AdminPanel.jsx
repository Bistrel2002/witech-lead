import React, { useState, useEffect } from 'react';
import { Shield, Lock, Trash2, Database, Download, RefreshCw, Key, LogOut, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminPanel({ apiHost }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  
  // Dashboard states
  const [users, setUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(null);
  const [opMessage, setOpMessage] = useState(null);

  // Check if already authenticated on load
  useEffect(() => {
    // If VITE_MOCK_AUTH is active, we can bypass immediately
    if (import.meta.env.VITE_MOCK_AUTH === 'true') {
      setIsAuthenticated(true);
    } else if (localStorage.getItem('witech_admin_portal_token')) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      fetchBackups();
    }
  }, [isAuthenticated]);

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setVerifying(true);

    try {
      const res = await fetch(`${apiHost}/api/auth/verify-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal: 'admin', password })
      });
      const data = await res.json();

      if (res.ok) {
        if (data.token) {
          localStorage.setItem('witech_admin_portal_token', data.token);
        }
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || 'Mot de passe incorrect.');
      }
    } catch (err) {
      setAuthError('Erreur de communication avec le serveur.');
    } finally {
      setVerifying(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${apiHost}/api/portal/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await fetch(`${apiHost}/api/portal/admin/backups`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return;

    try {
      const res = await fetch(`${apiHost}/api/portal/admin/users/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setUsers(users.filter(u => u.id !== userId));
        setOpMessage({ type: 'success', text: 'Utilisateur supprimé avec succès.' });
      }
    } catch (err) {
      setOpMessage({ type: 'error', text: 'Échec de la suppression de l\'utilisateur.' });
    }
  };

  const handleRunBackup = async () => {
    setBackupRunning(true);
    setOpMessage(null);
    try {
      const res = await fetch(`${apiHost}/api/portal/admin/backups/run`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setOpMessage({ 
          type: 'success', 
          text: `Sauvegarde sécurisée réussie ! Archive : ${data.backupName}. Fichiers plaintext détruits de la mémoire locale.` 
        });
        fetchBackups();
      } else {
        setOpMessage({ type: 'error', text: data.error || 'Erreur lors de la sauvegarde.' });
      }
    } catch (err) {
      setOpMessage({ type: 'error', text: 'Erreur réseau lors du déclenchement de la sauvegarde.' });
    } finally {
      setBackupRunning(false);
    }
  };

  const handleRestoreBackup = async (backupName) => {
    if (!window.confirm(`Voulez-vous restaurer la sauvegarde "${backupName}" ? Les données actuelles seront écrasées et auditées en 3 étapes.`)) return;

    setRestoringBackup(backupName);
    setOpMessage(null);
    try {
      const res = await fetch(`${apiHost}/api/portal/admin/backups/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupName })
      });
      const data = await res.json();
      if (res.ok) {
        setOpMessage({ 
          type: 'success', 
          text: `Restauration complétée avec succès ! Les signatures SHA-256 avant chiffrement, après téléchargement et le nombre de lignes (${data.currentRows}) ont été validés.` 
        });
      } else {
        setOpMessage({ type: 'error', text: data.error || 'Erreur lors de la restauration.' });
      }
    } catch (err) {
      setOpMessage({ type: 'error', text: 'Erreur réseau lors de la restauration.' });
    } finally {
      setRestoringBackup(null);
    }
  };

  const handlePortalLogout = async () => {
    await fetch(`${apiHost}/api/auth/logout-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'admin' })
    });
    localStorage.removeItem('witech_admin_portal_token');
    setIsAuthenticated(false);
  };

  // PASSWORD GATE COMPONENT (Secure Dark HUD)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 font-sans text-slate-100">
        <div className="max-w-md w-full space-y-6 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 text-red-400 mb-4 border border-red-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Espace Admin Sécurisé</h2>
            <p className="mt-2 text-sm text-slate-400">
              Veuillez saisir le mot de passe d'administration pour accéder au portail
            </p>
          </div>

          {authError && (
            <div className="bg-red-950/40 border border-red-800 text-red-200 p-3 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/80 transition-all placeholder:text-slate-700"
                placeholder="Mot de passe d'administration"
              />
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold text-sm shadow-lg shadow-red-900/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Vérification...' : 'Déverrouiller l\'Espace'}
            </button>
          </form>

          <div className="text-center">
            <a href="/" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">Retour à l'accueil</a>
          </div>
        </div>
      </div>
    );
  }

  // MAIN ADMIN CONSOLE VIEW
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-6 lg:p-10">
      
      {/* Top Console Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase tracking-wider">
            <Shield className="w-4 h-4 text-red-500" />
            Console d'Administration
          </div>
          <h1 className="text-3xl font-heading font-extrabold text-slate-900 mt-1">
            Witech CRM System Panel
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchUsers(); fetchBackups(); }}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button
            onClick={handlePortalLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <LogOut className="w-4 h-4" />
            Quitter la Console
          </button>
        </div>
      </div>

      {opMessage && (
        <div className={`p-4 rounded-xl border mb-8 flex items-start gap-3 text-sm ${opMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {opMessage.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />}
          <div>
            <p className="font-semibold">{opMessage.type === 'success' ? 'Opération réussie' : 'Erreur Système'}</p>
            <p className="mt-0.5">{opMessage.text}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Database backup controls & audit logs */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Backup Pipeline Control Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-slate-900">Database Security Pipeline</h3>
                  <p className="text-xs text-slate-500">Backups symétriques chiffrés via Fernet / SHA-256</p>
                </div>
              </div>
              
              <button
                onClick={handleRunBackup}
                disabled={backupRunning}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg active:translate-y-0.5 cursor-pointer transition-all"
              >
                {backupRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Chiffrement & Export...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Lancer une Sauvegarde
                  </>
                )}
              </button>
            </div>

            {/* Backups List */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700">Archives de Sauvegardes Disponibles</h4>
              
              {loadingBackups ? (
                <div className="py-8 text-center text-slate-400 text-sm">Chargement des archives de sauvegarde...</div>
              ) : backups.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                  Aucune archive locale détectée. Lancez votre première sauvegarde sécurisée !
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="p-3 pl-4">Nom de la sauvegarde</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Type DB</th>
                        <th className="p-3">Lignes</th>
                        <th className="p-3 text-right pr-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                      {backups.map((bk) => (
                        <tr key={bk.backup_name} className="hover:bg-slate-50/50">
                          <td className="p-3 pl-4 font-mono text-xs">{bk.backup_name}</td>
                          <td className="p-3 text-xs">{new Date(bk.timestamp).toLocaleString()}</td>
                          <td className="p-3 text-xs"><span className="px-2 py-0.5 rounded-full bg-slate-100 font-semibold">{bk.db_type}</span></td>
                          <td className="p-3 text-xs font-bold">{bk.total_rows}</td>
                          <td className="p-3 text-right pr-4">
                            <button
                              onClick={() => handleRestoreBackup(bk.backup_name)}
                              disabled={!!restoringBackup}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold rounded-md cursor-pointer transition-colors"
                            >
                              {restoringBackup === bk.backup_name ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              Restaurer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: User Management card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900">Gestion des Comptes</h3>
              <p className="text-xs text-slate-500">Rôles utilisateurs et droits du CRM</p>
            </div>
          </div>

          <div className="space-y-4">
            {loadingUsers ? (
              <div className="py-8 text-center text-slate-400 text-sm">Chargement des comptes...</div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Aucun utilisateur enregistré.</div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3.5 border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-600'}`}>
                          {u.role}
                        </span>
                        {u.google_id && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">Google</span>}
                        {u.apple_id && <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded-full font-semibold">Apple</span>}
                      </div>
                    </div>
                    
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
