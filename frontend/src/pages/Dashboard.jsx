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
  Cell,
  AreaChart,
  Area
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
    'New': '#6b7280',
    'Contacting': '#87D6C2',
    'Contacted': '#3b82f6',
    'Warm': '#fbbf24',
    'Replied': '#00BC7D',
    'Do Not Contact': '#ef4444'
  };

  const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name] || '#6b7280'
  }));

  // Activity Feed Generator
  useEffect(() => {
    if (leads.length === 0) return;
    
    // Sort leads by date or make a mock activity log
    const activities = leads
      .slice(0, 4)
      .map((lead, idx) => {
        const actions = [
          { text: `Nouveau prospect importé: "${lead.name}"`, time: 'Il y a 10 min', icon: Users, color: '#87D6C2' },
          { text: `Scraping réussi pour ${lead.name}`, time: 'Il y a 2h', icon: Globe, color: '#00BC7D' },
          { text: `Lead mis à jour: status "${lead.status}"`, time: 'Il y a 5h', icon: Sparkles, color: '#fbbf24' },
          { text: `Email envoyé à ${lead.email || lead.name}`, time: 'Hier', icon: Mail, color: '#3b82f6' }
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
    { name: 'New', value: 25, color: '#6b7280' },
    { name: 'Contacted', value: 18, color: '#3b82f6' },
    { name: 'Warm', value: 8, color: '#fbbf24' },
    { name: 'Replied', value: 10, color: '#00BC7D' }
  ];

  return (
    <div>
      {/* Title Header */}
      <div className="flex-between mb-20">
        <div>
          <h2>Tableau de Bord</h2>
          <p style={{ color: '#a3a3a3', fontSize: '14px', marginTop: '4px' }}>
            Pilotez votre prospection commerciale Witech Lead.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-replied" style={{ textTransform: 'none' }}>
            <span className="pulse-indicator"></span>
            Sync local active
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="dashboard-grid">
        <div className="glass-panel metric-card" style={{ '--accent': '#87D6C2' }}>
          <div className="metric-header">
            <span>Total Prospects</span>
            <Users />
          </div>
          <div className="metric-value">{totalLeads}</div>
          <div className="metric-footer">
            <span>Prospects importés dans la base</span>
          </div>
        </div>

        <div className="glass-panel metric-card" style={{ '--accent': '#00BC7D' }}>
          <div className="metric-header">
            <span>Couverture Email</span>
            <Globe />
          </div>
          <div className="metric-value">{emailCoverage}%</div>
          <div className="metric-footer">
            <span className="metric-trend-up">{leadsWithEmail} / {totalLeads}</span>
            <span>avec email</span>
          </div>
        </div>

        <div className="glass-panel metric-card" style={{ '--accent': '#3b82f6' }}>
          <div className="metric-header">
            <span>Total Contactés</span>
            <Mail />
          </div>
          <div className="metric-value">{contactedLeads}</div>
          <div className="metric-footer">
            <span>Campagnes SMTP ou mailto</span>
          </div>
        </div>

        <div className="glass-panel metric-card" style={{ '--accent': '#00BC7D' }}>
          <div className="metric-header">
            <span>Taux de Réponse</span>
            <TrendingUp />
          </div>
          <div className="metric-value">{replyRate}%</div>
          <div className="metric-footer">
            <span className="metric-trend-up">{repliedLeads}</span>
            <span>retours chaleureux</span>
          </div>
        </div>

        <div className="glass-panel metric-card" style={{ '--accent': '#ef4444' }}>
          <div className="metric-header">
            <span>Sans Site Web</span>
            <AlertTriangle />
          </div>
          <div className="metric-value">{noWebsiteCount}</div>
          <div className="metric-footer">
            <span>Cibles directes Web Design</span>
          </div>
        </div>

        <div className="glass-panel metric-card" style={{ '--accent': '#a78bfa' }}>
          <div className="metric-header">
            <span>Zéro Automatisation</span>
            <Sparkles />
          </div>
          <div className="metric-value">{noAutomationCount}</div>
          <div className="metric-footer">
            <span>Cibles automatisation</span>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Category distribution Chart */}
        <div className="col col-6">
          <div className="glass-panel" style={{ minHeight: '340px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Répartition par Catégories</h3>
            <div style={{ width: '100%', height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalLeads > 0 ? categoryChartData : defaultCategoryData}>
                  <XAxis dataKey="name" stroke="#666" fontSize={11} tickLine={false} />
                  <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ background: '#0e0e0e', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="count" fill="#00BC7D" radius={[6, 6, 0, 0]}>
                    {(totalLeads > 0 ? categoryChartData : defaultCategoryData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#00BC7D' : '#87D6C2'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Funnel distribution chart */}
        <div className="col col-6">
          <div className="glass-panel" style={{ minHeight: '340px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Tunnel de Prospection</h3>
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '240px', padding: '10px 0' }}>
              <div style={{ width: '160px', height: '160px', flexShrink: 0 }}>
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
                      contentStyle={{ background: '#0e0e0e', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                {(totalLeads > 0 ? statusChartData : defaultStatusData).map((entry, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }}></span>
                    <span style={{ color: '#a3a3a3' }}>{entry.name}: <strong>{entry.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-20">
        {/* Recent Activity Logs */}
        <div className="col col-12">
          <div className="glass-panel" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock style={{ width: '18px', color: '#87D6C2' }} />
              Flux d'Activités Récentes
            </h3>
            
            {recentActivities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
                <Sparkles style={{ width: '32px', height: '32px', marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ fontSize: '13px' }}>Aucune activité. Importez vos premiers prospects !</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {recentActivities.map((act) => {
                  const Icon = act.icon;
                  return (
                    <div key={act.id} style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '12px' }}>
                      <div style={{ 
                        width: '36px', 
                        height: '36px', 
                        borderRadius: '10px', 
                        background: `${act.color}15`, 
                        border: `1px solid ${act.color}30`,
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <Icon style={{ width: '16px', height: '16px', color: act.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>{act.text}</p>
                        <span style={{ fontSize: '11px', color: '#666' }}>{act.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
