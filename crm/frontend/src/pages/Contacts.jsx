import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, Thermometer, Star } from 'lucide-react'
import api from '../lib/api'

const TEMPS = ['', 'hot', 'warm', 'cold', 'customer']
const TEMP_LABEL = { hot:'🔥 Hot', warm:'☀️ Warm', cold:'❄️ Cold', customer:'✅ Cliente' }

function ScoreBar({ score }) {
  const color = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div className="stress-bar" style={{ width:60 }}>
        <div className="stress-fill" style={{ width:`${score}%`, background:color }} />
      </div>
      <span style={{ fontSize:'.75rem', color, fontWeight:600 }}>{score}</span>
    </div>
  )
}

function AddModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ first_name:'', last_name:'', email:'', phone:'', temperature:'cold', preferred_channel:'whatsapp' })
  const mut = useMutation({
    mutationFn: d => api.post('/contacts', d),
    onSuccess: () => { qc.invalidateQueries(['contacts']); onClose() }
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div className="card" style={{ width:480, padding:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700 }}>Novo Contato</h2>
          <button onClick={onClose} style={{ background:'none', color:'var(--text-2)', padding:4 }}><X size={18} /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {[['first_name','Nome *'],['last_name','Sobrenome'],['email','E-mail'],['phone','Telefone']].map(([k,l]) => (
            <div key={k}>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{l}</label>
              <input value={form[k]} onChange={e=>set(k,e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Temperatura</label>
            <select value={form.temperature} onChange={e=>set('temperature',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              {['hot','warm','cold'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Canal preferido</label>
            <select value={form.preferred_channel} onChange={e=>set('preferred_channel',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              {['whatsapp','email','phone','sms'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {mut.error && <p style={{ color:'var(--danger)', fontSize:'.8rem', marginTop:10 }}>{mut.error.response?.data?.error}</p>}
        <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={mut.isPending || !form.first_name}
            onClick={() => mut.mutate(form)}>
            {mut.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Contacts() {
  const [q, setQ] = useState('')
  const [temp, setTemp] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', temp],
    queryFn: () => api.get(`/contacts?limit=100${temp ? `&temperature=${temp}` : ''}`).then(r => r.data)
  })

  const filtered = (data?.data || []).filter(c =>
    !q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contatos</h1>
          <p className="page-sub">{data?.total || 0} contatos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Novo Contato
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        <div style={{ position:'relative', flex:1, maxWidth:320 }}>
          <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)' }} />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar contato…"
            style={{ width:'100%', padding:'8px 12px 8px 32px', fontSize:'.875rem' }} />
        </div>
        {TEMPS.map(t => (
          <button key={t} className={`btn ${temp===t ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize:'.8rem', padding:'7px 14px' }}
            onClick={() => setTemp(t)}>
            {t ? TEMP_LABEL[t] : 'Todos'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)', color:'var(--text-3)', fontSize:'.75rem' }}>
              {['Nome','Empresa','Contato','Canal','Temperatura','Score'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'12px 16px', fontWeight:500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:'var(--text-3)' }}>Carregando…</td></tr>
              : filtered.length === 0
              ? <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:'var(--text-3)' }}>Nenhum contato encontrado.</td></tr>
              : filtered.map(c => (
                <tr key={c.id} style={{ borderTop:'1px solid var(--border)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{
                        width:32, height:32, borderRadius:'50%', background:'var(--accent-soft)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'.8rem', fontWeight:700, color:'var(--accent)', flexShrink:0,
                      }}>{c.first_name?.charAt(0)}</div>
                      <div>
                        <div style={{ fontWeight:500 }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize:'.75rem', color:'var(--text-2)' }}>{c.title}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', color:'var(--text-2)' }}>{c.company_name || '—'}</td>
                  <td style={{ padding:'12px 16px', color:'var(--text-2)' }}>
                    <div>{c.email}</div>
                    <div style={{ fontSize:'.75rem' }}>{c.phone}</div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:'.75rem', color:'var(--text-2)', background:'var(--bg-hover)', padding:'2px 8px', borderRadius:99 }}>
                      {c.preferred_channel}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span className={`badge badge-${c.temperature}`}>{TEMP_LABEL[c.temperature] || c.temperature}</span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <ScoreBar score={c.profile_score} />
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
