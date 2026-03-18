import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from 'recharts'
import { Users, Calendar, TrendingUp, DollarSign, ArrowUpRight } from 'lucide-react'
import api from '../lib/api'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── KPI card — value + sub context + optional mini fill bar ────
// The `fill` prop (0–100) renders a colored progress line at the
// bottom of the card, giving each metric a distinct visual weight.
function KpiCard({ icon: Icon, label, value, sub, color = 'var(--accent)', fill }) {
  const rgb = {
    'var(--accent)':   '37,99,235',
    'var(--success)':  '16,185,129',
    'var(--warning)':  '245,158,11',
    'var(--danger)':   '239,68,68',
  }[color] ?? '37,99,235'

  return (
    <div className="card fade-up" style={{ display: 'flex', gap: 16, alignItems: 'flex-start',
      paddingBottom: fill != null ? 10 : undefined, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: `rgba(${rgb},.15)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.8rem', color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '.72rem', color: 'var(--text-3)', marginTop: 5 }}>{sub}</div>
        )}
      </div>
      {/* Fill bar — encodes a percentage as a colored stripe at the bottom */}
      {fill != null && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'var(--border)' }}>
          <div style={{
            height: '100%', width: `${Math.min(fill, 100)}%`,
            background: color, borderRadius: '0 2px 2px 0',
            transition: 'width .6s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
      )}
    </div>
  )
}

// ── Pipeline chart tooltip ─────────────────────────────────────
function PipelineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: '.8rem',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{d.name}</span>
      </div>
      <div style={{ color: 'var(--text-2)', lineHeight: 1.9 }}>
        {d.value > 0 ? (
          <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '.9rem' }}>
            R$ {Number(d.value).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </div>
        ) : (
          <div style={{ color: 'var(--text-3)' }}>Sem valor registrado</div>
        )}
        <div>
          {d.count} oportunidade{d.count !== 1 ? 's' : ''}
          {d.pct > 0 && <span style={{ color: 'var(--text-3)' }}> · {d.pct}% do funil</span>}
        </div>
        {d.odds > 0 && (
          <div style={{ color: 'var(--text-3)' }}>{Math.round(d.odds)}% win odds médio</div>
        )}
      </div>
    </div>
  )
}

// ── Stage breakdown legend ─────────────────────────────────────
// Renders one row per visible stage: color dot + label + proportional
// mini-bar + percentage + count. Gives data perspective at a glance.
function StageBreakdown({ chartData }) {
  if (!chartData.length) return null
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8,
      display: 'flex', flexDirection: 'column', gap: 7 }}>
      {chartData.map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
          <span style={{ fontSize: '.72rem', color: 'var(--text-2)', width: 76, flexShrink: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.name}
          </span>
          {/* Proportional fill bar */}
          <div style={{ flex: 1, height: 5, borderRadius: 99,
            background: 'var(--bg-hover)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${d.pct}%`, background: d.color,
              borderRadius: 99, transition: 'width .6s cubic-bezier(.4,0,.2,1)',
              opacity: d.count > 0 ? 1 : 0.25,
            }} />
          </div>
          <span style={{ fontSize: '.7rem', color: 'var(--text-3)', width: 32,
            textAlign: 'right', flexShrink: 0 }}>
            {d.pct}%
          </span>
          <span style={{ fontSize: '.7rem', color: 'var(--text-2)', width: 18,
            textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>
            {d.count}
          </span>
          {d.value > 0 && (
            <span style={{ fontSize: '.68rem', color: 'var(--text-3)', width: 54,
              textAlign: 'right', flexShrink: 0 }}>
              R${(d.value / 1000).toFixed(0)}k
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── usePipelineChartData ───────────────────────────────────────
// Single Source of Truth: column config drives labels/colors/order.
// Derives percentage share per stage so bars are proportional.
function usePipelineChartData() {
  const { data: statsData } = useQuery({
    queryKey: ['pipeline', 'stats'],
    queryFn:  () => api.get('/opportunities/stats').then(r => r.data),
  })
  const { data: colData } = useQuery({
    queryKey: ['pipeline-columns'],
    queryFn:  () => api.get('/pipeline/columns').then(r => r.data),
  })

  const statsMap = Object.fromEntries(
    (statsData?.by_stage ?? []).map(s => [s.stage, s])
  )

  const raw = (colData?.columns ?? [])
    .filter(col => col.visible)
    .map(col => {
      const s = statsMap[col.key_name] ?? {}
      return {
        key:   col.key_name,
        name:  col.label,
        color: col.color,
        count: Number(s.count       ?? 0),
        value: Number(s.total_value ?? 0),
        odds:  Number(s.avg_odds    ?? 0),
      }
    })

  const totalCount = raw.reduce((sum, d) => sum + d.count, 0)
  const totalValue = raw.reduce((sum, d) => sum + d.value, 0)

  // avgValue: reference line drawn at the mean deal value per active stage
  const activeStages = raw.filter(d => d.count > 0).length
  const avgValue = activeStages > 1 ? Math.round(totalValue / activeStages) : 0

  const chartData = raw.map(d => ({
    ...d,
    // pct = share of total deal count — used in legend + tooltip
    pct: totalCount > 0 ? Math.round((d.count / totalCount) * 100) : 0,
    // valuePct = share of total R$ — drives bar height (naturally differs per stage)
    valuePct: totalValue > 0 ? Math.round((d.value / totalValue) * 100) : 0,
  }))

  return {
    chartData,
    totalCount,
    totalValue,
    avgValue,
    weighted: statsData?.weighted_pipeline ?? 0,
    wonValue: statsMap['won']?.total_value  ?? 0,
  }
}

// ── Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const { chartData, totalCount, totalValue, avgValue, weighted, wonValue } = usePipelineChartData()

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn:  () => api.get('/contacts?limit=5').then(r => r.data),
  })
  const { data: events } = useQuery({
    queryKey: ['events-soon'],
    queryFn: () => {
      const start = new Date().toISOString()
      const end   = new Date(Date.now() + 7 * 86400000).toISOString()
      return api.get(`/events?start=${start}&end=${end}`).then(r => r.data)
    },
  })

  const totalContacts = contacts?.total ?? 0
  const nextEvents    = events?.data?.slice(0, 4) ?? []

  // Conversion rate: won value vs total weighted pipeline
  const conversionPct = weighted > 0 ? Math.round((wonValue / weighted) * 100) : 0
  // Pipeline fill: proportion of deals past qualification
  const advancedCount = chartData
    .filter(d => !['lead', 'lost'].includes(d.key))
    .reduce((s, d) => s + d.count, 0)
  const pipelineFill = totalCount > 0 ? Math.round((advancedCount / totalCount) * 100) : 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* KPIs — each card has a distinct secondary indicator */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard
          icon={Users}
          label="Contatos"
          value={totalContacts}
          sub="cadastrados no CRM"
          color="var(--accent)"
        />
        <KpiCard
          icon={TrendingUp}
          label="Pipeline (peso)"
          value={`R$ ${(weighted / 1000).toFixed(0)}k`}
          sub={`${totalCount} oportunidade${totalCount !== 1 ? 's' : ''} no funil`}
          color="var(--warning)"
          fill={pipelineFill}
        />
        <KpiCard
          icon={DollarSign}
          label="Receita (ganho)"
          value={`R$ ${(wonValue / 1000).toFixed(0)}k`}
          sub={conversionPct > 0 ? `${conversionPct}% do pipeline convertido` : 'Nenhuma conversão ainda'}
          color="var(--success)"
          fill={conversionPct}
        />
        <KpiCard
          icon={Calendar}
          label="Eventos (7 dias)"
          value={nextEvents.length}
          sub="próximos compromissos"
          color="var(--accent)"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Pipeline chart */}
        <div className="card fade-up-2">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem' }}>
              Pipeline por Estágio
            </h2>
            {totalValue > 0 && (
              <span style={{ fontSize: '.72rem', color: 'var(--text-3)' }}>
                R$ por estágio · {totalCount} oport.
              </span>
            )}
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={28} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 10 }}
                axisLine={false} tickLine={false} />
              {/* width=0 hides the axis visually while still applying domain for correct scaling */}
              <YAxis width={0} axisLine={false} tickLine={false} tick={false} />
              <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />

              {/* Reference line at mean deal value across active stages */}
              {avgValue > 0 && (
                <ReferenceLine
                  y={avgValue}
                  stroke="rgba(255,255,255,.18)"
                  strokeDasharray="4 3"
                  label={{
                    value: 'média',
                    position: 'insideTopRight',
                    fontSize: 9,
                    fill: 'var(--text-3)',
                    dy: -4,
                  }}
                />
              )}

              {/* Bars driven by R$ share per stage — naturally differs between stages */}
              <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: 9, fill: 'var(--text-3)' }}
                  formatter={v => (v > 0 ? v : '')}
                />
                {chartData.map(entry => (
                  <Cell key={entry.key} fill={entry.color} fillOpacity={entry.count > 0 ? 1 : 0.25} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Stage breakdown with proportional mini-bars */}
          <StageBreakdown chartData={chartData} />
        </div>

        {/* Upcoming events */}
        <div className="card fade-up-2">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 16, fontSize: '1rem' }}>
            Próximos Eventos
          </h2>
          {nextEvents.length === 0
            ? <p style={{ color: 'var(--text-3)', fontSize: '.85rem' }}>Nenhum evento nos próximos 7 dias.</p>
            : nextEvents.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '10px 0',
                borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: 'var(--accent-soft)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: '.65rem', color: 'var(--accent)', fontWeight: 700,
                }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{format(parseISO(ev.start_at), 'd')}</span>
                  <span>{format(parseISO(ev.start_at), 'MMM', { locale: ptBR })}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.85rem', fontWeight: 500, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-2)' }}>
                    {format(parseISO(ev.start_at), 'HH:mm')} · {ev.first_name} {ev.last_name}
                  </div>
                </div>
                {ev.win_odds != null && (
                  <div style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--accent)', fontWeight: 600 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem' }}>Contatos Recentes</h2>
          <a href="/contacts" style={{ fontSize: '.8rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
            Ver todos <ArrowUpRight size={13} />
          </a>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>
              <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 500 }}>Nome</th>
              <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 500 }}>Empresa</th>
              <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 500 }}>Temperatura</th>
              <th style={{ textAlign: 'right', padding: '0 0 10px', fontWeight: 500 }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {(contacts?.data || []).map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.75rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                    }}>
                      {c.first_name?.charAt(0)}
                    </div>
                    {c.first_name} {c.last_name}
                  </div>
                </td>
                <td style={{ color: 'var(--text-2)' }}>{c.company_name || '—'}</td>
                <td>
                  <span className={`badge badge-${c.temperature}`}>{c.temperature}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600,
                  color: c.profile_score > 70 ? 'var(--success)' : 'var(--text-2)' }}>
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
