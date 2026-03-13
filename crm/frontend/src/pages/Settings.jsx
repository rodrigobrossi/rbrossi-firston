import { useAuth } from '../hooks/useAuth'
import { LogOut, Shield, Bell, Palette, Database } from 'lucide-react'

export default function Settings() {
  const { user, logout } = useAuth()

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Configurações</h1><p className="page-sub">Conta e preferências</p></div>
      </div>

      <div style={{ maxWidth:640, display:'flex', flexDirection:'column', gap:16 }}>

        {/* Profile */}
        <div className="card fade-up">
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
            <div style={{
              width:52, height:52, borderRadius:'50%', background:'var(--accent-soft)',
              border:'2px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.3rem', color:'var(--accent)',
            }}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:'1rem' }}>{user?.name || 'Usuário'}</div>
              <div style={{ fontSize:'.8rem', color:'var(--text-2)' }}>Plano Pro · {user?.sub?.slice(0,8)}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ color:'var(--danger)', borderColor:'rgba(239,68,68,.3)' }}>
            <LogOut size={14}/> Sair da conta
          </button>
        </div>

        {/* Sections */}
        {[
          { icon:Shield,   title:'Segurança & LGPD',   items:['Seus dados são armazenados criptografados (AES-256-GCM)', 'E-mail e telefone são protegidos por hash', 'Chave PIX armazenada no AWS Secrets Manager (produção)', 'Conformidade com a Lei 13.709/2018 (LGPD)'] },
          { icon:Bell,     title:'Notificações',        items:['Lembretes de eventos: 30 min antes (e-mail)', 'Confirmação de pagamento PIX (e-mail)', 'Alertas de estresse alto em conversas'] },
          { icon:Database, title:'Ambiente local',      items:['API Gateway: http://localhost:8080', 'MySQL: localhost:3306 (firston / firstonpass)', 'LocalStack (S3/KMS): http://localhost:4566', 'Mailhog (e-mails): http://localhost:8025'] },
          { icon:Palette,  title:'Interface',           items:['Tema: Dark Navy + Electric Blue', 'Fontes: Syne (display) + DM Sans (corpo)', 'Idioma: Português (Brasil)'] },
        ].map(({ icon: Icon, title, items }) => (
          <div key={title} className="card fade-up-2">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <Icon size={16} color="var(--accent)"/>
              <h3 style={{ fontWeight:600, fontSize:'.95rem' }}>{title}</h3>
            </div>
            <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:8 }}>
              {items.map(item=>(
                <li key={item} style={{ fontSize:'.85rem', color:'var(--text-2)', display:'flex', alignItems:'flex-start', gap:8 }}>
                  <span style={{ color:'var(--accent)', marginTop:1, flexShrink:0 }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
