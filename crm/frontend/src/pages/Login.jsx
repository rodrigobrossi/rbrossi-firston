import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { Zap, Mail } from 'lucide-react'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [email, setEmail] = useState('demo@firston.com.br')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleDevLogin(e) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setErr('')
    try {
      const { data } = await axios.post('/auth/dev-login', { email, name: email.split('@')[0] })
      login(data.accessToken, data.refreshToken)
      window.location.replace('/dashboard')
    } catch (e) {
      setErr(e.response?.data?.error || t('login.error'))
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)',
      backgroundImage:'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,.18) 0%, transparent 60%)',
    }}>
      <div style={{ width:'100%', maxWidth:400, padding:'0 24px' }}>
        <div className="fade-up" style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{
            width:56, height:56, borderRadius:14, background:'var(--accent)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 16px', boxShadow:'0 0 40px rgba(37,99,235,.5)',
          }}>
            <Zap size={24} color="#fff" fill="#fff" />
          </div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.75rem', fontWeight:800, letterSpacing:'-.03em' }}>
            FirstOn CRM
          </h1>
          <p style={{ color:'var(--text-2)', marginTop:6, fontSize:'.9rem' }}>{t('login.welcome_back')}</p>
        </div>

        <div className="card fade-up-2" style={{ padding:28 }}>
          <a href="/auth/google" style={{ display:'block' }}>
            <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginBottom:10, padding:'11px' }}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              {t('login.sign_in_google')}
            </button>
          </a>
          <a href="/auth/microsoft" style={{ display:'block' }}>
            <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', padding:'11px' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="0" y="0" width="7.5" height="7.5" fill="#F25022"/>
                <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7FBA00"/>
                <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00A4EF"/>
                <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#FFB900"/>
              </svg>
              {t('login.sign_in_microsoft')}
            </button>
          </a>
          <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0', color:'var(--text-3)', fontSize:'.8rem' }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
            {t('login.dev_login')}
            <div style={{ flex:1, height:1, background:'var(--border)' }}/>
          </div>
          <form onSubmit={handleDevLogin} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <input type="email" placeholder="seu@email.com" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding:'10px 14px', fontSize:'.875rem' }} required />
            {err && <p style={{ color:'var(--danger)', fontSize:'.8rem' }}>{err}</p>}
            <button type="submit" className="btn btn-primary"
              style={{ justifyContent:'center', padding:'11px' }} disabled={loading}>
              <Mail size={15} />
              {loading ? t('login.signing_in') : t('login.sign_in_email')}
            </button>
          </form>
        </div>
        <p className="fade-up-3" style={{ textAlign:'center', color:'var(--text-3)', fontSize:'.75rem', marginTop:20 }}>
          {t('login.local_dev')}
        </p>
      </div>
    </div>
  )
}
