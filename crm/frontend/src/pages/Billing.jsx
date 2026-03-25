// ── Billing.jsx ───────────────────────────────────────────────
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CreditCard, CheckCircle, Clock, QrCode } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

export function Billing() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [qr, setQr] = useState(null)
  const [charging, setCharging] = useState(false)

  const { data: sub } = useQuery({
    queryKey: ['subscription', user?.sub],
    queryFn: () => user?.sub ? api.get(`/billing/subscription/${user.sub}`).then(r=>r.data) : null,
    enabled: !!user?.sub,
  })

  async function handleCharge() {
    if (!user?.sub) return
    setCharging(true)
    try {
      const { data } = await api.post('/billing/charge', { user_id: user.sub })
      setQr(data)
    } catch(e) { console.error(e) }
    finally { setCharging(false) }
  }

  const statusInfo = {
    active:   { label: t('billing.status_active'),   color:'var(--success)', icon:CheckCircle },
    trialing: { label: t('billing.status_trialing'), color:'var(--warning)', icon:Clock },
    pending:  { label: t('billing.status_pending'),  color:'var(--warning)', icon:Clock },
    none:     { label: t('billing.status_none'),     color:'var(--text-3)',  icon:CreditCard },
    past_due: { label: t('billing.status_past_due'), color:'var(--danger)',  icon:CreditCard },
  }
  const info = statusInfo[sub?.status || 'none']
  const Icon = info.icon

  const features = t('billing.features', { returnObjects: true })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('billing.title')}</h1>
          <p className="page-sub">{t('billing.subtitle')}</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:800 }}>
        {/* Status card */}
        <div className="card" style={{ padding:28 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <Icon size={24} color={info.color} />
            <span style={{ fontWeight:700, color:info.color, fontSize:'1rem' }}>{info.label}</span>
          </div>
          <div style={{ fontSize:'2.5rem', fontWeight:800, fontFamily:'var(--font-display)', letterSpacing:'-.03em', marginBottom:4 }}>
            R$ 39<span style={{ fontSize:'1.2rem', fontWeight:500 }}>,90</span>
          </div>
          <div style={{ color:'var(--text-2)', fontSize:'.85rem', marginBottom:24 }}>{t('billing.per_user_month')}</div>
          {sub?.next_billing && (
            <div style={{ fontSize:'.8rem', color:'var(--text-2)', marginBottom:20 }}>
              {t('billing.next_billing', { date: new Date(sub.next_billing).toLocaleDateString('pt-BR') })}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleCharge} disabled={charging} style={{ width:'100%', justifyContent:'center' }}>
            {charging ? t('billing.generating_pix') : <><QrCode size={15}/> {t('billing.pay_pix')}</>}
          </button>
        </div>

        {/* QR code / instructions */}
        <div className="card" style={{ padding:28 }}>
          {qr ? (
            <div style={{ textAlign:'center' }}>
              <p style={{ color:'var(--success)', fontWeight:600, marginBottom:16 }}>{t('billing.pix_generated')}</p>
              <img src={qr.qr_code_url} alt="QR PIX" style={{ width:180, height:180, borderRadius:12, marginBottom:16, border:'4px solid var(--border)' }} />
              <p style={{ fontSize:'.75rem', color:'var(--text-2)', marginBottom:12 }}>{t('billing.copy_paste')}</p>
              <div style={{ background:'var(--bg-input)', borderRadius:8, padding:'10px 12px', fontSize:'.7rem', wordBreak:'break-all', color:'var(--text-2)', userSelect:'all' }}>
                {qr.pix_copy_paste?.slice(0,80)}…
              </div>
              <p style={{ fontSize:'.72rem', color:'var(--text-3)', marginTop:12 }}>
                {t('billing.auto_activate')}
              </p>
            </div>
          ) : (
            <div style={{ textAlign:'center', color:'var(--text-3)', paddingTop:20 }}>
              <QrCode size={48} style={{ margin:'0 auto 16px', display:'block', opacity:.2 }} />
              <p style={{ fontSize:'.85rem' }}>{t('billing.pix_instructions')}</p>
              <p style={{ fontSize:'.75rem', marginTop:8 }}>{t('billing.payment_confirmed')}</p>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="card" style={{ gridColumn:'1/-1', padding:24 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, marginBottom:16 }}>{t('billing.features_title')}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {(Array.isArray(features) ? features : []).map(f=>(
              <div key={f} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem' }}>
                <CheckCircle size={14} color="var(--success)" style={{ flexShrink:0 }}/>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
export default Billing
