import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FileText, Plus, X, CheckCircle, Send } from 'lucide-react'
import api from '../lib/api'

const STATUS_LABEL = { draft:'Rascunho', sent:'Enviado', signed:'Assinado', cancelled:'Cancelado' }
const STATUS_COLOR = { draft:'var(--text-2)', sent:'var(--warning)', signed:'var(--success)', cancelled:'var(--danger)' }

function AddContractModal({ onClose }) {
  const qc = useQueryClient()
  const { data: opps } = useQuery({ queryKey:['pipeline'], queryFn:()=>api.get('/opportunities').then(r=>r.data) })
  const { data: tmpls } = useQuery({ queryKey:['templates'], queryFn:()=>api.get('/contracts/templates').then(r=>r.data) })
  const allOpps = Object.values(opps?.board || {}).flat()
  const [form, setForm] = useState({ opportunity_id:'', title:'', template_id:'' })
  const mut = useMutation({ mutationFn:d=>api.post('/contracts',d), onSuccess:()=>{ qc.invalidateQueries(['contracts']); onClose() } })
  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div className="card" style={{ width:440, padding:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700 }}>Novo Contrato</h2>
          <button onClick={onClose} style={{ background:'none', color:'var(--text-2)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Título *</label>
            <input value={form.title} onChange={e=>set('title',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Oportunidade *</label>
            <select value={form.opportunity_id} onChange={e=>set('opportunity_id',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              <option value="">— Selecione —</option>
              {allOpps.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>Template</label>
            <select value={form.template_id} onChange={e=>set('template_id',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              <option value="">— Sem template —</option>
              {(tmpls?.data||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={mut.isPending||!form.title||!form.opportunity_id}
            onClick={()=>mut.mutate(form)}>{mut.isPending?'Gerando…':'Gerar Contrato'}</button>
        </div>
      </div>
    </div>
  )
}

export function Contracts() {
  const [showAdd, setShowAdd] = useState(false)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey:['contracts'], queryFn:()=>api.get('/contracts').then(r=>r.data) })
  const updateStatus = useMutation({
    mutationFn:({id,status})=>api.patch(`/contracts/${id}`,{status}),
    onSuccess:()=>qc.invalidateQueries(['contracts'])
  })

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Contratos</h1><p className="page-sub">{data?.data?.length||0} contratos</p></div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> Novo Contrato</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {isLoading
          ? <p style={{ color:'var(--text-3)', padding:20 }}>Carregando…</p>
          : (data?.data||[]).length===0
          ? <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-3)' }}>
              <FileText size={40} style={{ margin:'0 auto 12px', display:'block', opacity:.2 }}/>
              <p>Nenhum contrato ainda. Crie o primeiro!</p>
            </div>
          : (data?.data||[]).map(c=>(
            <div key={c.id} className="card" style={{ display:'flex', alignItems:'center', gap:16 }}>
              <FileText size={20} color="var(--accent)" style={{ flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'.9rem' }}>{c.title}</div>
                <div style={{ fontSize:'.75rem', color:'var(--text-2)', marginTop:2 }}>
                  {c.first_name} {c.last_name} · {c.company_name}
                </div>
              </div>
              <span style={{ fontSize:'.8rem', fontWeight:600, color:STATUS_COLOR[c.status], padding:'3px 12px', background:`${STATUS_COLOR[c.status]}18`, borderRadius:99 }}>
                {STATUS_LABEL[c.status]}
              </span>
              {c.status==='draft' && (
                <button className="btn btn-ghost" style={{ fontSize:'.8rem', padding:'6px 12px' }}
                  onClick={()=>updateStatus.mutate({id:c.id,status:'sent'})}>
                  <Send size={13}/> Enviar
                </button>
              )}
              {c.status==='sent' && (
                <button className="btn" style={{ fontSize:'.8rem', padding:'6px 12px', background:'rgba(16,185,129,.15)', color:'var(--success)' }}
                  onClick={()=>updateStatus.mutate({id:c.id,status:'signed'})}>
                  <CheckCircle size={13}/> Marcar Assinado
                </button>
              )}
            </div>
          ))
        }
      </div>
      {showAdd && <AddContractModal onClose={()=>setShowAdd(false)}/>}
    </div>
  )
}
export default Contracts
