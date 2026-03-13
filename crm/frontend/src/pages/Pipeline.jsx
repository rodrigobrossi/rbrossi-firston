import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ChevronRight } from 'lucide-react'
import api from '../lib/api'

const STAGES = ['lead','qualification','proposal','negotiation','won','lost']
const STAGE_PT = { lead:'Lead', qualification:'Qualificação', proposal:'Proposta', negotiation:'Negociação', won:'Ganho', lost:'Perdido' }
const STAGE_COLOR = { lead:'#60A5FA', qualification:'#818CF8', proposal:'#A78BFA', negotiation:'#F59E0B', won:'#10B981', lost:'#EF4444' }

function OddsRing({ value }) {
  const r = 14, circ = 2*Math.PI*r
  const dash = (value/100)*circ
  const color = value>=70 ? 'var(--success)' : value>=40 ? 'var(--warning)' : 'var(--text-3)'
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" style={{ flexShrink:0 }}>
      <circle cx={18} cy={18} r={r} fill="none" stroke="var(--border)" strokeWidth={3}/>
      <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition:'stroke-dasharray .5s' }}/>
      <text x={18} y={22} textAnchor="middle" fontSize={9} fill={color} fontWeight={700}>{value}%</text>
    </svg>
  )
}

function Card({ opp, onMove }) {
  const stages = STAGES.filter(s=>s!==opp.stage && s!=='lost')
  return (
    <div className="card" style={{ padding:14, marginBottom:10, cursor:'default' }}>
      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
        <OddsRing value={opp.win_odds||0} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {opp.title}
          </div>
          <div style={{ fontSize:'.75rem', color:'var(--text-2)' }}>{opp.first_name} {opp.last_name}</div>
          {opp.value_brl && (
            <div style={{ fontSize:'.8rem', fontWeight:600, color:'var(--success)', marginTop:4 }}>
              R$ {Number(opp.value_brl).toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      </div>
      {/* Move buttons */}
      <div style={{ display:'flex', gap:4, marginTop:10, flexWrap:'wrap' }}>
        {opp.stage !== 'won' && (
          <button className="btn" style={{ fontSize:'.7rem', padding:'3px 8px', background:'rgba(16,185,129,.15)', color:'var(--success)', borderRadius:6 }}
            onClick={()=>onMove(opp.id,'won')}>✓ Ganho</button>
        )}
        {opp.stage !== 'lost' && (
          <button className="btn" style={{ fontSize:'.7rem', padding:'3px 8px', background:'rgba(239,68,68,.1)', color:'var(--danger)', borderRadius:6 }}
            onClick={()=>onMove(opp.id,'lost')}>✗ Perdido</button>
        )}
        {STAGES.indexOf(opp.stage) < STAGES.indexOf('negotiation') && (
          <button className="btn" style={{ fontSize:'.7rem', padding:'3px 8px', background:'var(--accent-soft)', color:'var(--accent)', borderRadius:6 }}
            onClick={()=>onMove(opp.id, STAGES[STAGES.indexOf(opp.stage)+1])}>
            Avançar <ChevronRight size={10}/>
          </button>
        )}
      </div>
    </div>
  )
}

function AddModal({ onClose }) {
  const qc = useQueryClient()
  const { data: contacts } = useQuery({ queryKey:['contacts'], queryFn:()=>api.get('/contacts?limit=200').then(r=>r.data) })
  const [form, setForm] = useState({ contact_id:'', title:'', stage:'lead', value_brl:'', win_odds:10 })
  const mut = useMutation({ mutationFn:d=>api.post('/opportunities',d), onSuccess:()=>{ qc.invalidateQueries(['pipeline']); onClose() } })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div className="card" style={{ width:440, padding:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700 }}>Nova Oportunidade</h2>
          <button onClick={onClose} style={{ background:'none', color:'var(--text-2)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Título *</label>
            <input value={form.title} onChange={e=>set('title',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Contato *</label>
            <select value={form.contact_id} onChange={e=>set('contact_id',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              <option value="">— Selecione —</option>
              {(contacts?.data||[]).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Estágio</label>
              <select value={form.stage} onChange={e=>set('stage',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
                {STAGES.filter(s=>s!=='won'&&s!=='lost').map(s=><option key={s} value={s}>{STAGE_PT[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Valor (R$)</label>
              <input type="number" value={form.value_brl} onChange={e=>set('value_brl',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={mut.isPending || !form.title || !form.contact_id}
            onClick={()=>mut.mutate(form)}>{mut.isPending?'Salvando…':'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Pipeline() {
  const [showAdd, setShowAdd] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey:['pipeline'], queryFn:()=>api.get('/opportunities').then(r=>r.data) })
  const board = data?.board || {}

  const move = useMutation({
    mutationFn: ({id, stage}) => api.patch(`/opportunities/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries(['pipeline'])
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">Kanban de oportunidades</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Nova Oportunidade</button>
      </div>

      {isLoading
        ? <p style={{ color:'var(--text-3)', padding:20 }}>Carregando…</p>
        : (
          <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:16 }}>
            {STAGES.map(stage => {
              const cards = board[stage] || []
              const total = cards.reduce((s,c)=>s+(Number(c.value_brl)||0),0)
              return (
                <div key={stage} style={{ minWidth:220, flex:'0 0 220px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'0 2px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:STAGE_COLOR[stage] }}/>
                      <span style={{ fontWeight:600, fontSize:'.85rem' }}>{STAGE_PT[stage]}</span>
                      <span style={{ fontSize:'.75rem', color:'var(--text-3)', background:'var(--bg-hover)', padding:'1px 7px', borderRadius:99 }}>
                        {cards.length}
                      </span>
                    </div>
                    {total>0 && <span style={{ fontSize:'.7rem', color:'var(--text-2)' }}>R${(total/1000).toFixed(0)}k</span>}
                  </div>
                  <div style={{ minHeight:80 }}>
                    {cards.map(opp => (
                      <Card key={opp.id} opp={opp} onMove={(id,stage)=>move.mutate({id,stage})} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
      {showAdd && <AddModal onClose={()=>setShowAdd(false)} />}
    </div>
  )
}
