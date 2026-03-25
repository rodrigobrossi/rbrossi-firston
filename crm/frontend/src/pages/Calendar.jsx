import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
         isSameMonth, isSameDay, parseISO, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import api from '../lib/api'

const TYPE_COLOR = { meeting:'var(--accent)', call:'var(--success)', demo:'var(--warning)',
                     follow_up:'var(--text-2)', contract:'#A78BFA', other:'var(--text-3)' }

function AddEventModal({ selectedDate, onClose }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: contacts } = useQuery({ queryKey:['contacts'], queryFn: () => api.get('/contacts?limit=200').then(r=>r.data) })
  const [form, setForm] = useState({
    title:'', contact_id:'', type:'meeting', win_odds:50, notes:'',
    start_at: selectedDate ? `${format(selectedDate,'yyyy-MM-dd')}T09:00` : '',
    end_at:   selectedDate ? `${format(selectedDate,'yyyy-MM-dd')}T10:00` : '',
  })
  const mut = useMutation({ mutationFn: d => api.post('/events', d), onSuccess: () => { qc.invalidateQueries(['events']); onClose() } })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div className="card" style={{ width:460, padding:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700 }}>{t('calendar.new_event')}</h2>
          <button onClick={onClose} style={{ background:'none', color:'var(--text-2)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('common.title_field')}</label>
            <input value={form.title} onChange={e=>set('title',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('calendar.field_start')}</label>
              <input type="datetime-local" value={form.start_at} onChange={e=>set('start_at',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
            </div>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('calendar.field_end')}</label>
              <input type="datetime-local" value={form.end_at} onChange={e=>set('end_at',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('calendar.field_type')}</label>
              <select value={form.type} onChange={e=>set('type',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
                {Object.keys(TYPE_COLOR).map(tp=><option key={tp} value={tp}>{tp}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>
                {t('calendar.field_win_odds', { value: form.win_odds })}
              </label>
              <input type="range" min={0} max={100} value={form.win_odds} onChange={e=>set('win_odds',Number(e.target.value))}
                style={{ width:'100%', accentColor:'var(--accent)' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('common.contact_field')}</label>
            <select value={form.contact_id} onChange={e=>set('contact_id',e.target.value)} style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem' }}>
              <option value="">{t('common.none_option')}</option>
              {(contacts?.data||[]).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--text-2)', display:'block', marginBottom:4 }}>{t('calendar.field_notes')}</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2}
              style={{ width:'100%', padding:'8px 12px', fontSize:'.875rem', resize:'vertical' }} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={mut.isPending || !form.title || !form.start_at || !form.end_at}
            onClick={()=>mut.mutate(form)}>
            {mut.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Calendar() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const start = format(startOfMonth(current), 'yyyy-MM-dd')
  const end   = format(endOfMonth(current),   'yyyy-MM-dd')

  const { data } = useQuery({
    queryKey: ['events', start, end],
    queryFn: () => api.get(`/events?start=${start}&end=${end}`).then(r=>r.data)
  })
  const events = data?.data || []

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(current), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(current),     { weekStartsOn: 0 }),
  })

  const eventsOn = day => events.filter(ev => isSameDay(parseISO(ev.start_at), day))

  const dayHeaders = t('calendar.days', { returnObjects: true })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('calendar.title')}</h1>
          <p className="page-sub">{format(current, "MMMM 'de' yyyy", { locale:ptBR })}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={()=>setCurrent(d=>subMonths(d,1))}><ChevronLeft size={16}/></button>
          <button className="btn btn-ghost" onClick={()=>setCurrent(new Date())}>{t('calendar.today')}</button>
          <button className="btn btn-ghost" onClick={()=>setCurrent(d=>addMonths(d,1))}><ChevronRight size={16}/></button>
          <button className="btn btn-primary" onClick={()=>{ setSelected(new Date()); setShowAdd(true) }}>
            <Plus size={15}/> {t('calendar.new_event')}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {/* Day headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
          {(Array.isArray(dayHeaders) ? dayHeaders : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']).map(d => (
            <div key={d} style={{ padding:'10px 0', textAlign:'center', fontSize:'.75rem', color:'var(--text-3)', fontWeight:600 }}>{d}</div>
          ))}
        </div>
        {/* Weeks */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {days.map((day, i) => {
            const dayEvs = eventsOn(day)
            const isToday = isSameDay(day, new Date())
            const inMonth = isSameMonth(day, current)
            return (
              <div key={i} onClick={()=>{ setSelected(day); setShowAdd(true) }}
                style={{
                  minHeight: 90, padding:8,
                  borderRight: (i+1)%7!==0 ? '1px solid var(--border)' : 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor:'pointer', transition:'background .15s',
                  background: !inMonth ? 'rgba(0,0,0,.15)' : 'transparent',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                onMouseLeave={e=>e.currentTarget.style.background=!inMonth?'rgba(0,0,0,.15)':'transparent'}
              >
                <div style={{
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                  width:26, height:26, borderRadius:'50%', fontSize:'.8rem', fontWeight:500,
                  color: isToday ? '#fff' : inMonth ? 'var(--text)' : 'var(--text-3)',
                  background: isToday ? 'var(--accent)' : 'transparent',
                  marginBottom:4,
                }}>{format(day,'d')}</div>
                {dayEvs.slice(0,3).map(ev => (
                  <div key={ev.id} style={{
                    fontSize:'.7rem', padding:'2px 6px', borderRadius:4,
                    background: `${TYPE_COLOR[ev.type]}22`,
                    color: TYPE_COLOR[ev.type],
                    marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {format(parseISO(ev.start_at),'HH:mm')} {ev.title}
                  </div>
                ))}
                {dayEvs.length > 3 && (
                  <div style={{ fontSize:'.68rem', color:'var(--text-3)', paddingLeft:2 }}>
                    {t('calendar.more', { count: dayEvs.length - 3 })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showAdd && <AddEventModal selectedDate={selected} onClose={()=>setShowAdd(false)} />}
    </div>
  )
}
