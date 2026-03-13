import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users, Calendar, TrendingUp, DollarSign, ArrowUpRight } from 'lucide-react'
import api from '../lib/api'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function KpiCard({ icon: Icon, label, value, sub, color = 'var(--accent)' }) {
  return (
    <div className="card fade-up" style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
      <div style={{
        width:44, height:44, borderRadius:10,
        background:`rgba(${color === 'var(--accent)' ? '37,99,235' : color === 'var(--success)' ? '16,185,129' : color === 'var(--warning)' ? '245,158,11' : '239,68,68'},.15)`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize:'.8rem', color:'var(--text-2)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:700, lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:'.75rem', color:'var(--text-3)', marginTop:4 }}>{sub}</div>}
      </div>
    </div>
  )
}

const STAGE_LABELS = { lead:'Lead', qualification:'Qualif.', proposal:'Proposta', negotiation:'Neg.', won:'Ganho', lost:'Perdido' }
const STAGE_COLORS = { lead:'#60A5FA', qualification:'#818CF8', proposal:'#A78BFA', negotiation:'#F59E0B', won:'#10B981', lost:'#EF4444' }

export default function Dashboard() {
  const { data: opp } = useQuery({ queryKey:['opp-stats'], queryFn: () => api.get('/opportunities/stats').then(r=>r.data) })
  const { data: contacts } = useQuery({ queryKey:['contacts'], queryFn: () => api.get('/contacts?limit=5').then(r=>r.data) })
  const { data: events } = useQuery({
    queryKey:['events-soon'],
    queryFn: () => {
      const start = new Date().toISOString()
      const end = new Date(Date.now() + 7*86400000).toISOString()
      return api.get(`/events?start=${start}&end=${end}`).then(r=>r.data)
    }
  })

  const stages = opp?.by_stage || []
  const chartData = stages.map(s => ({ name: STAGE_LABELS[s.stage]||s.stage, value: s.count, total: s.total_value||0 }))
  const totalContacts = contacts?.total || 0
  const totalRevenue = stages.find(s=>s.stage==='won')?.total_value || 0
  const pipeline = opp?.weighted_pipeline || 0
  const nextEvents = events?.data?.slice(0,4) || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KpiCard icon={Users}       label="Contatos"        value={totalContacts}  color="var(--accent)" />
        <KpiCard icon={TrendingUp}  label="Pipeline (peso)" value={`R$ ${(pipeline/1000).toFixed(0)}k`} color="var(--warning)" />
        <KpiCard icon={DollarSign}  label="Receita (ganho)" value={`R$ ${(totalRevenue/1000).toFixed(0)}k`} color="var(--success)" />
        <KpiCard icon={Calendar}    label="Eventos (7 dias)" value={nextEvents.length} color="var(--accent)" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, marginBottom:24 }}>
        {/* Pipeline chart */}
        <div className="card fade-up-2">
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:600, marginBottom:20, fontSize:'1rem' }}>
            Pipeline por Estágio
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={32}>
              <XAxis dataKey="name" tick={{ fill:'var(--text-2)', fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)' }}
                formatter={(v, name) => [v, 'Oportunidades']}
              />
              <Bar dataKey="value" radius={[6,6,0,0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={STAGE_COLORS[stages[i]?.stage] || 'var(--accent)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming events */}
        <div className="card fade-up-2">
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:600, marginBottom:16, fontSize:'1rem' }}>
            Próximos Eventos
          </h2>
          {nextEvents.length === 0
            ? <p style={{ color:'var(--text-3)', fontSize:'.85rem' }}>Nenhum evento nos próximos 7 dias.</p>
            : nextEvents.map(ev => (
              <div key={ev.id} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{
                  width:36, height:36, borderRadius:8, background:'var(--accent-soft)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  flexShrink:0, fontSize:'.65rem', color:'var(--accent)', fontWeight:700,
                }}>
                  <span style={{ fontSize:'1rem', lineHeight:1 }}>{format(parseISO(ev.start_at),'d')}</span>
                  <span>{format(parseISO(ev.start_at),'MMM',{locale:ptBR})}</span>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:'.85rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</div>
                  <div style={{ fontSize:'.75rem', color:'var(--text-2)' }}>
                    {format(parseISO(ev.start_at),'HH:mm')} · {ev.first_name} {ev.last_name}
                  </div>
                </div>
                {ev.win_odds != null && (
                  <div style={{ marginLeft:'auto', fontSize:'.75rem', color:'var(--accent)', fontWeight:600 }}>
                    {ev.win_odds}%
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>

      {/* Recent contacts */}
      <div className="card fade-up-3">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:'1rem' }}>Contatos Recentes</h2>
          <a href="/contacts" style={{ fontSize:'.8rem', color:'var(--accent)', display:'flex', alignItems:'center', gap:4 }}>
            Ver todos <ArrowUpRight size={13} />
          </a>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.85rem' }}>
          <thead>
            <tr style={{ color:'var(--text-3)', fontSize:'.75rem' }}>
              <th style={{ textAlign:'left', padding:'0 0 10px', fontWeight:500 }}>Nome</th>
              <th style={{ textAlign:'left', padding:'0 0 10px', fontWeight:500 }}>Empresa</th>
              <th style={{ textAlign:'left', padding:'0 0 10px', fontWeight:500 }}>Temperatura</th>
              <th style={{ textAlign:'right', padding:'0 0 10px', fontWeight:500 }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {(contacts?.data || []).map(c => (
              <tr key={c.id} style={{ borderTop:'1px solid var(--border)' }}>
                <td style={{ padding:'10px 0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'.75rem', fontWeight:700, color:'var(--accent)', flexShrink:0,
                    }}>
                      {c.first_name?.charAt(0)}
                    </div>
                    {c.first_name} {c.last_name}
                  </div>
                </td>
                <td style={{ color:'var(--text-2)' }}>{c.company_name || '—'}</td>
                <td>
                  <span className={`badge badge-${c.temperature}`}>{c.temperature}</span>
                </td>
                <td style={{ textAlign:'right', fontWeight:600, color: c.profile_score > 70 ? 'var(--success)' : 'var(--text-2)' }}>
                  {c.profile_score}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
