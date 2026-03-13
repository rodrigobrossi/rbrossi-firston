import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, MessageSquare } from 'lucide-react'
import api from '../lib/api'

function StressGauge({ score }) {
  if (score == null) return null
  const color = score < 20 ? 'var(--stress-calm)' : score < 40 ? 'var(--stress-mild)'
              : score < 65 ? 'var(--stress-tense)' : score < 85 ? 'var(--stress-high)' : 'var(--stress-critical)'
  const label = score < 20 ? 'Calmo' : score < 40 ? 'Leve tensão' : score < 65 ? 'Tenso' : score < 85 ? 'Alto estresse' : 'Crítico'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)' }}>
      <span style={{ fontSize:'.75rem', color:'var(--text-2)' }}>Estresse</span>
      <div className="stress-bar" style={{ flex:1 }}>
        <div className="stress-fill" style={{ width:`${score}%`, background:color }} />
      </div>
      <span style={{ fontSize:'.75rem', fontWeight:700, color, minWidth:70, textAlign:'right' }}>
        {score} — {label}
      </span>
    </div>
  )
}

function ChatPanel({ conv }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [stress, setStress] = useState(null)
  const bottomRef = useRef(null)

  const { data } = useQuery({
    queryKey: ['messages', conv.id],
    queryFn: () => api.get(`/conversations/${conv.id}/messages`).then(r=>r.data),
    refetchInterval: 5000,
  })
  const messages = data?.data || []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages.length])

  const send = useMutation({
    mutationFn: () => api.post('/messages', {
      contact_id: conv.contact_id, channel: conv.channel,
      body: text, phone: conv.phone
    }),
    onSuccess: () => { setText(''); qc.invalidateQueries(['messages', conv.id]) }
  })

  async function analyzeAndSend(e) {
    e.preventDefault()
    if (!text.trim()) return
    // Analyze before sending
    try {
      const { data } = await api.post('/sentiment/analyze', { text })
      setStress(data.stress_score)
    } catch {}
    send.mutate()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'var(--accent)' }}>
          {conv.first_name?.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight:600 }}>{conv.first_name} {conv.last_name}</div>
          <div style={{ fontSize:'.75rem', color:'var(--text-2)' }}>{conv.channel} · {conv.company_name}</div>
        </div>
      </div>

      {/* Stress gauge */}
      <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)' }}>
        <StressGauge score={stress ?? conv.stress_level} />
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:10 }}>
        {messages.map(m => (
          <div key={m.id} style={{ display:'flex', justifyContent: m.direction==='out' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth:'72%', padding:'10px 14px', borderRadius:12, fontSize:'.875rem', lineHeight:1.5,
              background: m.direction==='out' ? 'var(--accent)' : 'var(--bg-card)',
              color: m.direction==='out' ? '#fff' : 'var(--text)',
              border: m.direction==='in' ? '1px solid var(--border)' : 'none',
              borderBottomRightRadius: m.direction==='out' ? 2 : 12,
              borderBottomLeftRadius:  m.direction==='in'  ? 2 : 12,
            }}>
              {m.body}
              {m.stress_level != null && m.direction==='in' && (
                <div style={{ fontSize:'.65rem', marginTop:4, opacity:.6 }}>
                  estresse: {Math.round(m.stress_level)}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={analyzeAndSend} style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
        <input
          value={text} onChange={e=>setText(e.target.value)}
          placeholder="Digite a mensagem…"
          style={{ flex:1, padding:'10px 14px', fontSize:'.875rem', borderRadius:99 }}
        />
        <button type="submit" className="btn btn-primary"
          style={{ borderRadius:'50%', width:40, height:40, padding:0, justifyContent:'center' }}
          disabled={!text.trim() || send.isPending}>
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}

export default function Messages() {
  const [activeConv, setActiveConv] = useState(null)

  const { data, isLoading } = useQuery({ queryKey:['conversations'], queryFn:()=>api.get('/conversations').then(r=>r.data), refetchInterval:10000 })
  const convs = data?.data || []

  return (
    <div style={{ height:'calc(100vh - 60px)', display:'flex', gap:0, background:'var(--bg-card)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:280, borderRight:'1px solid var(--border)', overflowY:'auto', flexShrink:0 }}>
        <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)' }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'.95rem' }}>Mensagens</h2>
        </div>
        {isLoading
          ? <p style={{ padding:16, color:'var(--text-3)', fontSize:'.85rem' }}>Carregando…</p>
          : convs.length === 0
          ? <div style={{ padding:24, textAlign:'center', color:'var(--text-3)' }}>
              <MessageSquare size={32} style={{ margin:'0 auto 8px', display:'block', opacity:.3 }} />
              <p style={{ fontSize:'.85rem' }}>Sem conversas ainda.</p>
            </div>
          : convs.map(c => (
            <div key={c.id} onClick={()=>setActiveConv(c)}
              style={{
                padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                background: activeConv?.id===c.id ? 'var(--accent-soft)' : 'transparent',
                borderLeft: activeConv?.id===c.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition:'background .15s',
              }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <span style={{ fontWeight:600, fontSize:'.85rem' }}>{c.first_name} {c.last_name}</span>
                <span style={{ fontSize:'.7rem', padding:'1px 7px', borderRadius:99, background:'var(--bg-hover)', color:'var(--text-2)' }}>{c.channel}</span>
              </div>
              <p style={{ fontSize:'.78rem', color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {c.last_message || 'Nenhuma mensagem'}
              </p>
              {c.stress_level > 50 && (
                <div style={{ fontSize:'.7rem', color:'var(--danger)', marginTop:4 }}>⚠ Estresse alto</div>
              )}
            </div>
          ))
        }
      </div>

      {/* Chat area */}
      <div style={{ flex:1 }}>
        {activeConv
          ? <ChatPanel key={activeConv.id} conv={activeConv} />
          : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-3)' }}>
              <MessageSquare size={48} style={{ marginBottom:12, opacity:.2 }} />
              <p>Selecione uma conversa</p>
            </div>
          )
        }
      </div>
    </div>
  )
}
