import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  LayoutDashboard, Users, Calendar, Kanban,
  MessageSquare, FileText, CreditCard, Settings, LogOut, Zap
} from 'lucide-react'

const NAV = [
  { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard'  },
  { to:'/contacts',  icon:Users,           label:'Contatos'   },
  { to:'/calendar',  icon:Calendar,        label:'Calendário' },
  { to:'/pipeline',  icon:Kanban,          label:'Pipeline'   },
  { to:'/messages',  icon:MessageSquare,   label:'Mensagens'  },
  { to:'/contracts', icon:FileText,        label:'Contratos'  },
  { to:'/billing',   icon:CreditCard,      label:'Assinatura' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="layout">
      <aside style={{
        position:'fixed', top:0, left:0, bottom:0,
        width:'var(--sidebar-w)',
        background:'var(--bg-card)',
        borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        padding:'20px 12px', zIndex:100,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px 24px' }}>
          <div style={{
            width:32, height:32, borderRadius:8,
            background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 16px rgba(37,99,235,.5)',
          }}>
            <Zap size={16} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', letterSpacing:'-.02em' }}>
            FirstOn
          </span>
        </div>

        <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 12px', borderRadius:'var(--radius)',
              fontSize:'.875rem', fontWeight:500,
              color: isActive ? '#fff' : 'var(--text-2)',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              transition:'all .15s',
            })}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
          <NavLink to="/settings" style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:10,
            padding:'9px 12px', borderRadius:'var(--radius)',
            fontSize:'.875rem', color: isActive ? '#fff' : 'var(--text-2)', marginBottom:4,
          })}>
            <Settings size={16} /> Configurações
          </NavLink>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px' }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background:'var(--accent-soft)', border:'1px solid var(--accent)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'.75rem', fontWeight:700, color:'var(--accent)',
            }}>
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'.8rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.name || 'Usuário'}
              </div>
              <div style={{ fontSize:'.7rem', color:'var(--text-2)' }}>Pro</div>
            </div>
            <button onClick={logout} style={{ background:'none', padding:4, color:'var(--text-3)' }} title="Sair">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}
