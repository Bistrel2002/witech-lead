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

  // Brand ramp rather than six unrelated hues. The funnel runs violet ->
  // magenta -> pink as a prospect warms up, a reply is the success green and
  // do-not-contact the danger red, so colour carries the same meaning here as
  // everywhere else in the product. Every slice is labelled with its value,
  // so colour is never the only channel.
  const STATUS_COLORS = {
    'New': '#7e22ce',
    'Contacting': '#9333ea',
    'Contacted': '#c026d3',
    'Warm': '#e879f9',
    'Replied': 'var(--wt-success)',
    'Do Not Contact': 'var(--wt-danger)'
  };

  const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name] || 'var(--wt-fg-subtle)'
  }));

  // Activity Feed Generator
  useEffect(() => {
    if (leads.length === 0) return;
    
    const activities = leads
      .slice(0, 4)
      .map((lead, idx) => {
        const actions = [
          { text: `Nouveau prospect importé: "${lead.name}"`, time: 'Il y a 10 min', icon: Users, color: 'var(--wt-accent)', bg: 'bg-accent-soft', textCol: 'text-accent' },
          { text: `Scraping réussi pour ${lead.name}`, time: 'Il y a 2h', icon: Globe, color: 'var(--wt-success)', bg: 'bg-[var(--wt-success-soft)]', textCol: 'text-[var(--wt-success-fg)]' },
          { text: `Lead mis à jour: status "${lead.status}"`, time: 'Il y a 5h', icon: Sparkles, color: 'var(--wt-warning)', bg: 'bg-[var(--wt-warning-soft)]', textCol: 'text-[var(--wt-warning-fg)]' },
          { text: `Email envoyé à ${lead.email || lead.name}`, time: 'Hier', icon: Mail, color: 'var(--wt-accent)', bg: 'bg-accent-soft', textCol: 'text-accent' }
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
    { name: 'New', value: 25, color: '#7e22ce' },
    { name: 'Contacted', value: 18, color: 'var(--wt-accent)' },
    { name: 'Warm', value: 8, color: 'var(--wt-warning)' },
    { name: 'Replied', value: 10, color: 'var(--wt-success)' }
  ];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-fg">Tableau de Bord</h2>
          <p className="text-fg-muted text-sm mt-1">
            Pilotez votre prospection commerciale Witech Lead.
          </p>
        </div>
        <div className="flex items-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--wt-success-soft)] text-[var(--wt-success-fg)] border border-line">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--wt-success)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--wt-success)]"></span>
            </span>
            Sync local active
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="bg-surface border border-line border-l-4 border-l-accent rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Total Prospects</span>
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{totalLeads}</div>
          <div className="text-xs text-fg-muted">Prospects importés dans la base</div>
        </div>

        {/* Metric 2 */}
        <div className="bg-surface border border-line border-l-4 border-l-[var(--wt-success)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Couverture Email</span>
            <Globe className="w-5 h-5 text-[var(--wt-success)]" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{emailCoverage}%</div>
          <div className="text-xs text-fg-muted flex items-center gap-1.5">
            <span className="text-[var(--wt-success)] font-bold">{leadsWithEmail} / {totalLeads}</span>
            <span>avec email</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-surface border border-line border-l-4 border-l-accent rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Total Contactés</span>
            <Mail className="w-5 h-5 text-accent" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{contactedLeads}</div>
          <div className="text-xs text-fg-muted">Campagnes e-mail ou mailto</div>
        </div>

        {/* Metric 4 */}
        <div className="bg-surface border border-line border-l-4 border-l-[var(--wt-success)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Taux de Réponse</span>
            <TrendingUp className="w-5 h-5 text-[var(--wt-success)]" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{replyRate}%</div>
          <div className="text-xs text-fg-muted flex items-center gap-1.5">
            <span className="text-[var(--wt-success)] font-bold">{repliedLeads}</span>
            <span>retours chaleureux</span>
          </div>
        </div>

        {/* Metric 5 */}
        <div className="bg-surface border border-line border-l-4 border-l-[var(--wt-warning)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Sans Site Web</span>
            <AlertTriangle className="w-5 h-5 text-[var(--wt-danger)]" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{noWebsiteCount}</div>
          <div className="text-xs text-fg-muted">Cibles directes Web Design</div>
        </div>

        {/* Metric 6 */}
        <div className="bg-surface border border-line border-l-4 border-l-[var(--wt-warning)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex justify-between items-center text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            <span>Zéro Automatisation</span>
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="font-display text-3xl font-extrabold text-fg leading-none mb-2">{noAutomationCount}</div>
          <div className="text-xs text-fg-muted">Cibles automatisation</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category distribution Chart */}
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[360px] flex flex-col">
          <h3 className="font-display font-extrabold text-fg text-lg mb-4">Répartition par Catégories</h3>
          <div className="w-full h-64 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totalLeads > 0 ? categoryChartData : defaultCategoryData}>
                <XAxis dataKey="name" stroke="var(--wt-fg-subtle)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--wt-fg-subtle)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: 'var(--wt-surface)', borderColor: 'var(--wt-line)', borderRadius: '8px', color: 'var(--wt-fg)' }}
                />
                <Bar dataKey="count" fill="var(--wt-brand-500)" radius={[6, 6, 0, 0]}>
                  {(totalLeads > 0 ? categoryChartData : defaultCategoryData).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'var(--wt-brand-500)' : 'var(--wt-brand-700)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel distribution chart */}
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[360px] flex flex-col">
          <h3 className="font-display font-extrabold text-fg text-lg mb-4">Tunnel de Prospection</h3>
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
                    contentStyle={{ background: 'var(--wt-surface)', borderColor: 'var(--wt-line)', borderRadius: '8px', color: 'var(--wt-fg)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 min-w-[140px]">
              {(totalLeads > 0 ? statusChartData : defaultStatusData).map((entry, index) => (
                <div key={index} className="flex items-center gap-2.5 text-xs text-fg-muted">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }}></span>
                  <span>{entry.name}: <strong className="text-fg font-bold">{entry.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Log */}
      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
        <h3 className="font-display font-extrabold text-fg text-lg mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-accent" />
          Flux d'Activités Récentes
        </h3>
        
        {recentActivities.length === 0 ? (
          <div className="text-center py-12 text-fg-subtle">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40 text-accent" />
            <p className="text-sm">Aucune activité. Importez vos premiers prospects !</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {recentActivities.map((act) => {
              const Icon = act.icon;
              return (
                <div key={act.id} className="flex gap-4 border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${act.bg} border border-line`}>
                    <Icon className="w-4 h-4" style={{ color: act.color }} />
                  </div>
                  <div className="flex-grow">
                    <p className="text-sm font-semibold text-fg">{act.text}</p>
                    <span className="text-xs text-fg-subtle">{act.time}</span>
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
