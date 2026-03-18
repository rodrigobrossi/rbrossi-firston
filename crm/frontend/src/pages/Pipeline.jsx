/**
 * Pipeline — Kanban board with:
 *  - Configurable columns (label, color, order, visibility) stored in DB
 *  - Drag & drop cards between columns (HTML5 DnD API, Command pattern)
 *  - Optimistic updates via React Query cache mutation
 *  - OddsRing SVG for win probability
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ChevronRight } from 'lucide-react'
import api from '../lib/api'

// ── Win-odds ring ──────────────────────────────────────────────
function OddsRing({ value }) {
  const r = 14, circ = 2 * Math.PI * r, dash = (value / 100) * circ
  const color = value >= 70 ? 'var(--success)' : value >= 40 ? 'var(--warning)' : 'var(--text-3)'
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx={18} cy={18} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray .5s' }} />
      <text x={18} y={22} textAnchor="middle" fontSize={9} fill={color} fontWeight={700}>{value}%</text>
    </svg>
  )
}

// ── Kanban card (draggable) ────────────────────────────────────
// Design: Command pattern — drag start captures the "move command" payload
// in DataTransfer; the column executes it on drop.
function KanbanCard({ opp, onMove, isDragging, onDragStart, onDragEnd }) {
  return (
    <div
      className="card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        padding: 14, marginBottom: 10,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity .15s, box-shadow .15s',
        userSelect: 'none',
        ...(isDragging ? {} : { ':hover': { boxShadow: '0 4px 16px rgba(0,0,0,.3)' } }),
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <OddsRing value={opp.win_odds || 0} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: '.85rem', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {opp.title}
          </div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-2)' }}>
            {opp.first_name} {opp.last_name}
          </div>
          {opp.value_brl && (
            <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--success)', marginTop: 4 }}>
              R$ {Number(opp.value_brl).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      {/* Quick-action buttons */}
      <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
        {opp.stage !== 'won' && (
          <button className="btn" onClick={e => { e.stopPropagation(); onMove(opp.id, 'won') }}
            style={{ fontSize: '.7rem', padding: '3px 8px', background: 'rgba(16,185,129,.15)', color: 'var(--success)', borderRadius: 6 }}>
            ✓ Ganho
          </button>
        )}
        {opp.stage !== 'lost' && (
          <button className="btn" onClick={e => { e.stopPropagation(); onMove(opp.id, 'lost') }}
            style={{ fontSize: '.7rem', padding: '3px 8px', background: 'rgba(239,68,68,.1)', color: 'var(--danger)', borderRadius: 6 }}>
            ✗ Perdido
          </button>
        )}
        {['lead','qualification','proposal','negotiation'].includes(opp.stage) && (() => {
          const FLOW = ['lead','qualification','proposal','negotiation']
          const idx  = FLOW.indexOf(opp.stage)
          const next = FLOW[idx + 1]
          return next ? (
            <button className="btn" onClick={e => { e.stopPropagation(); onMove(opp.id, next) }}
              style={{ fontSize: '.7rem', padding: '3px 8px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 6 }}>
              Avançar <ChevronRight size={10} />
            </button>
          ) : null
        })()}
      </div>
    </div>
  )
}

// ── Kanban column (droppable) ──────────────────────────────────
function KanbanColumn({ column, cards, draggingId, draggingStage, onDrop, onMove, onStartDrag, onEndDrag }) {
  const [over, setOver] = useState(false)
  const total = cards.reduce((s, c) => s + (Number(c.value_brl) || 0), 0)
  const isTarget = over && draggingStage !== column.key_name

  return (
    <div
      style={{ minWidth: 220, flex: '0 0 220px' }}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        const id    = e.dataTransfer.getData('opportunityId')
        const from  = e.dataTransfer.getData('fromStage')
        if (id && from !== column.key_name) onDrop(id, from, column.key_name)
      }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: column.color }} />
          <span style={{ fontWeight: 600, fontSize: '.85rem' }}>{column.label}</span>
          <span style={{ fontSize: '.75rem', color: 'var(--text-3)', background: 'var(--bg-hover)',
            padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
        </div>
        {total > 0 && (
          <span style={{ fontSize: '.7rem', color: 'var(--text-2)' }}>
            R${(total / 1000).toFixed(0)}k
          </span>
        )}
      </div>

      {/* Cards + drop zone */}
      <div style={{
        minHeight: 80, borderRadius: 8, padding: isTarget ? 4 : 0,
        border: isTarget ? `2px dashed ${column.color}` : '2px solid transparent',
        background: isTarget ? `${column.color}10` : 'transparent',
        transition: 'all .15s',
      }}>
        {cards.map(opp => (
          <KanbanCard
            key={opp.id}
            opp={opp}
            onMove={onMove}
            isDragging={draggingId === opp.id}
            onDragStart={e => {
              e.dataTransfer.setData('opportunityId', opp.id)
              e.dataTransfer.setData('fromStage', opp.stage)
              e.dataTransfer.effectAllowed = 'move'
              onStartDrag(opp.id, opp.stage)
            }}
            onDragEnd={onEndDrag}
          />
        ))}
      </div>
    </div>
  )
}

// ── Add opportunity modal ──────────────────────────────────────
function AddModal({ columns, onClose }) {
  const qc = useQueryClient()
  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts?limit=200').then(r => r.data),
  })
  const activeStages = columns.filter(c => c.visible && c.key_name !== 'won' && c.key_name !== 'lost')
  const [form, setForm] = useState({ contact_id: '', title: '', stage: activeStages[0]?.key_name || 'lead', value_brl: '', win_odds: 10 })
  const mut = useMutation({
    mutationFn: d => api.post('/opportunities', d),
    onSuccess: () => { qc.invalidateQueries(['pipeline']); onClose() },
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="card" style={{ width: 440, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Nova Oportunidade</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-2)', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Título *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '.875rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Contato *</label>
            <select value={form.contact_id} onChange={e => set('contact_id', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '.875rem' }}>
              <option value="">— Selecione —</option>
              {(contacts?.data || []).map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Estágio</label>
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '.875rem' }}>
                {activeStages.map(c => (
                  <option key={c.key_name} value={c.key_name}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Valor (R$)</label>
              <input type="number" value={form.value_brl} onChange={e => set('value_brl', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '.875rem' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={mut.isPending || !form.title || !form.contact_id}
            onClick={() => mut.mutate(form)}>
            {mut.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function Pipeline() {
  const [showAdd, setShowAdd]   = useState(false)
  const [draggingId, setDragging] = useState(null)
  const [draggingStage, setDraggingStage] = useState(null)
  const qc = useQueryClient()

  // Fetch column config (seeds defaults on first call)
  const { data: colData } = useQuery({
    queryKey: ['pipeline-columns'],
    queryFn: () => api.get('/pipeline/columns').then(r => r.data),
  })
  const columns = (colData?.columns || []).filter(c => c.visible)

  // Fetch board data
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get('/opportunities').then(r => r.data),
  })

  // Move mutation with optimistic update (Command pattern execution)
  const move = useMutation({
    mutationFn: ({ id, stage }) => api.patch(`/opportunities/${id}`, { stage }),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ['pipeline'] })
      const previous = qc.getQueryData(['pipeline'])
      qc.setQueryData(['pipeline'], old => {
        if (!old) return old
        const allCards = Object.values(old.board).flat()
        const card = allCards.find(c => c.id === id)
        if (!card) return old
        const newBoard = {}
        for (const [s, cards] of Object.entries(old.board)) {
          newBoard[s] = cards.filter(c => c.id !== id)
        }
        newBoard[stage] = [...(newBoard[stage] || []), { ...card, stage }]
        return { ...old, board: newBoard }
      })
      return { previous }
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous) qc.setQueryData(['pipeline'], ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  })

  const handleDrop = (id, from, to) => {
    setDragging(null)
    setDraggingStage(null)
    move.mutate({ id, stage: to })
  }

  const board = data?.board || {}

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">Kanban de oportunidades</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Nova Oportunidade
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text-3)', padding: 20 }}>Carregando…</p>
      ) : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16 }}>
          {columns.map(col => (
            <KanbanColumn
              key={col.key_name}
              column={col}
              cards={board[col.key_name] || []}
              draggingId={draggingId}
              draggingStage={draggingStage}
              onDrop={handleDrop}
              onMove={(id, stage) => move.mutate({ id, stage })}
              onStartDrag={(id, stage) => { setDragging(id); setDraggingStage(stage) }}
              onEndDrag={() => { setDragging(null); setDraggingStage(null) }}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddModal columns={colData?.columns || []} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}
