import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Mail, 
  CheckCircle, 
  TrendingUp, 
  Search, 
  Plus, 
  Globe,
  MapPin,
  Clock,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell
} from 'recharts';

export default function Dashboard({ apiHost, leads = [], reloadLeads }) {

  const [recentActivities, setRecentActivities] = useState([]);

  // Calculate Metrics
  const totalLeads = leads.length;
  const leadsWithEmail = leads.filter(l => l.email && l.email.trim() !== '').length;
  const emailCoverage = totalLeads > 0 ? Math.round((leadsWithEmail / totalLeads) * 100) : 0;
  
  const contactedLeads = leads.filter(l => ['Contacted', 'Warm', 'Replied'].includes(l.status)).length;
  const repliedLeads = leads.filter(l => l.status === 'Replied').length;
  const replyRate = contactedLeads > 0 ? Math.round((repliedLeads / contactedLeads) * 100) : 0;

  // New opportunity metrics
  const noWebsiteCount = leads.filter(l => !l.website || l.website.trim() === '').length;
  const noAutomationCount = leads.filter(l => l.website && l.website.trim() !== '' && l.has_chat_widget === 0).length;

  // Chart Data: Category Distribution
  const categoryCounts = leads.reduce((acc, lead) => {
    acc[lead.category] = (acc[lead.category] || 0) + 1;
    return acc;
  }, {});
  
  const categoryChartData = Object.entries(categoryCounts).map(([name, count]) => ({
    name,
    count
  })).slice(0, 5);

  // Chart Data: Status Distribution
  const statusCounts = leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const STATUS_COLORS = {
    'New': '#64748b',            // slate-500
    'Contacting': '#0d9488',     // teal-600
    'Contacted': '#2563eb',      // blue-600
    'Warm': '#d97706',           // amber-600
    'Replied': '#10b981',        // emerald-500
    'Do Not Contact': '#dc2626'  // red-600
  };

  const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name] || '#64748b'
  }));

  // Activity Feed Generator
  useEffect(() => {
    if (leads.length === 0) return;
    
    const activities = leads
      .slice(0, 4)
      .map((lead, idx) => {
        const actions = [
          { text: `Nouveau prospect importé: "${lead.name}"`, time: 'Il y a 10 min', icon: Users, color: '#0d9488', bg: 'bg-teal-50', textCol: 'text-teal-700' },
          { text: `Scraping réussi pour ${lead.name}`, time: 'Il y a 2h', icon: Globe, color: '#10b981', bg: 'bg-emerald-50', textCol: 'text-emerald-700' },
          { text: `Lead mis à jour: status "${lead.status}"`, time: 'Il y a 5h', icon: Sparkles, color: '#d97706', bg: 'bg-amber-50', textCol: 'text-amber-700' },
          { text: `Email envoyé à ${lead.email || lead.name}`, time: 'Hier', icon: Mail, color: '#2563eb', bg: 'bg-blue-50', textCol: 'text-blue-700' }
        ];
        return {
          id: lead.id + '-' + idx,
          ...actions[idx % actions.length]
        };
      });
    setRecentActivities(activities);
  }, [leads]);

  // Fallback Charts if database is empty
  const defaultCategoryData = [
    { name: 'Plombiers', count: 12 },
    { name: 'Menuisiers', count: 8 },
    { name: 'Coiffeurs', count: 15 },
    { name: 'Restaurants', count: 20 },
    { name: 'Solo-preneurs', count: 6 }
  ];

  const defaultStatusData = [
    { name: 'New', value: 25, color: '#64748b' },
    { name: 'Contacted', value: 18, color: '#2563eb' },
    { name: 'Warm', value: 8, color: '#d97706' },
    { name: 'Replied', value: 10, color: '#10b981' }
  ];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-heading font-extrabold text-slate-800">Tableau de Bord</h2>
          <p className="text-slate-500 text-sm mt-1">
            Pilotez votre prospection commerciale Witech Lead.
          </p>
        </div>
        <div className="flex items-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Sync local active
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-teal-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Total Prospects</span>
            <Users className="w-5 h-5 text-teal-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{totalLeads}</div>
          <div className="text-xs text-slate-500">Prospects importés dans la base</div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Couverture Email</span>
            <Globe className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{emailCoverage}%</div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-600 font-bold">{leadsWithEmail} / {totalLeads}</span>
            <span>avec email</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Total Contactés</span>
            <Mail className="w-5 h-5 text-blue-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{contactedLeads}</div>
          <div className="text-xs text-slate-500">Campagnes SMTP ou mailto</div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Taux de Réponse</span>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{replyRate}%</div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-600 font-bold">{repliedLeads}</span>
            <span>retours chaleureux</span>
          </div>
        </div>

        {/* Metric 5 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Sans Site Web</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{noWebsiteCount}</div>
          <div className="text-xs text-slate-500">Cibles directes Web Design</div>
        </div>

        {/* Metric 6 */}
        <div className="bg-white border border-slate-200 border-l-4 border-l-purple-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            <span>Zéro Automatisation</span>
            <Sparkles className="w-5 h-5 text-purple-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-slate-800 leading-none mb-2">{noAutomationCount}</div>
          <div className="text-xs text-slate-500">Cibles automatisation</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category distribution Chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[360px] flex flex-col">
          <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4">Répartition par Catégories</h3>
          <div className="w-full h-64 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totalLeads > 0 ? categoryChartData : defaultCategoryData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#1e293b' }}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]}>
                  {(totalLeads > 0 ? categoryChartData : defaultCategoryData).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#0d9488' : '#87D6C2'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel distribution chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[360px] flex flex-col">
          <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4">Tunnel de Prospection</h3>
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-6 mt-auto py-2">
            <div className="w-40 h-40 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalLeads > 0 ? statusChartData : defaultStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(totalLeads > 0 ? statusChartData : defaultStatusData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#1e293b' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 min-w-[140px]">
              {(totalLeads > 0 ? statusChartData : defaultStatusData).map((entry, index) => (
                <div key={index} className="flex items-center gap-2.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }}></span>
                  <span>{entry.name}: <strong className="text-slate-800 font-bold">{entry.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
        <h3 className="font-heading font-extrabold text-slate-800 text-lg mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-teal-600" />
          Flux d'Activités Récentes
        </h3>
        
        {recentActivities.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40 text-teal-500" />
            <p className="text-sm">Aucune activité. Importez vos premiers prospects !</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {recentActivities.map((act) => {
              const Icon = act.icon;
              return (
                <div key={act.id} className="flex gap-4 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${act.bg} border border-slate-200`}>
                    <Icon className="w-4 h-4" style={{ color: act.color }} />
                  </div>
                  <div className="flex-grow">
                    <p className="text-sm font-semibold text-slate-800">{act.text}</p>
                    <span className="text-xs text-slate-400">{act.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
