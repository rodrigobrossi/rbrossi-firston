import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Shield, Bell, Palette, Database, Kanban, Check, Eye, EyeOff, ChevronUp, ChevronDown, User } from 'lucide-react'
import api from '../lib/api'

// ── Submenu tabs ───────────────────────────────────────────────
const TABS = [
  { id: 'account',  label: 'Conta',    icon: User },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban },
]

// ── Color palette ──────────────────────────────────────────────
const COLOR_PALETTE = [
  '#60A5FA', '#818CF8', '#A78BFA', '#EC4899',
  '#F59E0B', '#10B981', '#EF4444', '#34D399',
  '#F97316', '#06B6D4', '#84CC16', '#8B5CF6',
]

// ── Pipeline columns editor ───────────────────────────────────
function PipelineTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-columns'],
    queryFn: () => api.get('/pipeline/columns').then(r => r.data),
  })

  const [local, setLocal] = useState(null)
  const [openPicker, setOpenPicker] = useState(null)
  const [saved, setSaved] = useState(false)

  const cols = local ?? data?.columns ?? []

  const saveMut = useMutation({
    mutationFn: columns => api.put('/pipeline/columns', { columns }),
    onSuccess: ({ data: saved }) => {
      qc.setQueryData(['pipeline-columns'], saved)
      setLocal(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const update = (key_name, patch) =>
    setLocal(prev => (prev ?? data?.columns ?? []).map(c =>
      c.key_name === key_name ? { ...c, ...patch } : c
    ))

  const move = (key_name, dir) => {
    const arr  = [...(local ?? data?.columns ?? [])]
    const idx  = arr.findIndex(c => c.key_name === key_name)
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setLocal(arr.map((c, i) => ({ ...c, position: i })))
  }

  const isDirty = local !== null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>
          Colunas do Pipeline
        </h2>
        <p style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>
          Personalize o nome, cor, ordem e visibilidade de cada estágio do Kanban.
        </p>
      </div>

      {isLoading ? (
        <p style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>Carregando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {cols.map((col, idx) => (
            <div
              key={col.key_name}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                opacity: col.visible ? 1 : 0.45, transition: 'opacity .15s',
              }}
            >
              {/* Reorder arrows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button onClick={() => move(col.key_name, -1)} disabled={idx === 0}
                  style={{ background: 'none', color: 'var(--text-3)', padding: '1px 3px',
                    opacity: idx === 0 ? 0.25 : 1 }}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => move(col.key_name, 1)} disabled={idx === cols.length - 1}
                  style={{ background: 'none', color: 'var(--text-3)', padding: '1px 3px',
                    opacity: idx === cols.length - 1 ? 0.25 : 1 }}>
                  <ChevronDown size={12} />
                </button>
              </div>

              {/* Color picker */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setOpenPicker(openPicker === col.key_name ? null : col.key_name)}
                  title="Alterar cor"
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: col.color,
                    border: '2px solid rgba(255,255,255,.2)', cursor: 'pointer', flexShrink: 0,
                  }}
                />
                {openPicker === col.key_name && (
                  <div style={{
                    position: 'absolute', top: 28, left: 0, zIndex: 50,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 8,
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5,
                    boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                  }}>
                    {COLOR_PALETTE.map(c => (
                      <button key={c}
                        onClick={() => { update(col.key_name, { color: c }); setOpenPicker(null) }}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: c,
                          border: col.color === c ? '2px solid #fff' : '2px solid transparent',
                          cursor: 'pointer',
                        }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Label */}
              <input
                value={col.label}
                onChange={e => update(col.key_name, { label: e.target.value })}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)', color: 'var(--text-1)',
                  fontSize: '.875rem', padding: '2px 4px', outline: 'none',
                }}
              />

              {/* Stage key badge */}
              <span style={{
                fontSize: '.68rem', color: 'var(--text-3)', background: 'var(--bg-card)',
                padding: '2px 7px', borderRadius: 99, fontFamily: 'monospace', flexShrink: 0,
              }}>
                {col.key_name}
              </span>

              {/* Visibility toggle */}
              <button
                onClick={() => update(col.key_name, { visible: !col.visible })}
                title={col.visible ? 'Ocultar coluna' : 'Exibir coluna'}
                style={{ background: 'none', padding: 4, flexShrink: 0,
                  color: col.visible ? 'var(--accent)' : 'var(--text-3)' }}>
                {col.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" disabled={!isDirty || saveMut.isPending}
          style={{ fontSize: '.8rem', padding: '7px 16px' }}
          onClick={() => saveMut.mutate(cols)}>
          {saveMut.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
        {isDirty && (
          <button className="btn btn-ghost" style={{ fontSize: '.8rem', padding: '7px 14px' }}
            onClick={() => setLocal(null)}>
            Descartar
          </button>
        )}
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4,
            fontSize: '.8rem', color: 'var(--success)' }}>
            <Check size={13} /> Salvo
          </span>
        )}
        {saveMut.isError && (
          <span style={{ fontSize: '.8rem', color: 'var(--danger)' }}>Erro ao salvar</span>
        )}
      </div>
    </div>
  )
}

// ── Account tab ────────────────────────────────────────────────
function AccountTab({ user, logout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Profile card */}
      <div className="card fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-soft)',
            border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)',
          }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{user?.name || 'Usuário'}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-2)' }}>Plano Pro · {user?.sub?.slice(0, 8)}</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={logout}
          style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,.3)' }}>
          <LogOut size={14} /> Sair da conta
        </button>
      </div>

      {/* Info sections */}
      {[
        { icon: Shield,   title: 'Segurança & LGPD',   items: ['Seus dados são armazenados criptografados (AES-256-GCM)', 'E-mail e telefone são protegidos por hash', 'Chave PIX armazenada no AWS Secrets Manager (produção)', 'Conformidade com a Lei 13.709/2018 (LGPD)'] },
        { icon: Bell,     title: 'Notificações',        items: ['Lembretes de eventos: 30 min antes (e-mail)', 'Confirmação de pagamento PIX (e-mail)', 'Alertas de estresse alto em conversas'] },
        { icon: Database, title: 'Ambiente local',      items: ['API Gateway: http://localhost:8080', 'MySQL: localhost:3306 (firston / firstonpass)', 'LocalStack (S3/KMS): http://localhost:4566', 'Mailhog (e-mails): http://localhost:8025'] },
        { icon: Palette,  title: 'Interface',           items: ['Tema: Dark Navy + Electric Blue', 'Fontes: Syne (display) + DM Sans (corpo)', 'Idioma: Português (Brasil)'] },
      ].map(({ icon: Icon, title, items }) => (
        <div key={title} className="card fade-up-2">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Icon size={16} color="var(--accent)" />
            <h3 style={{ fontWeight: 600, fontSize: '.95rem' }}>{title}</h3>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <li key={item} style={{ fontSize: '.85rem', color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('account')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-sub">Conta e preferências</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Sidebar submenu */}
        <nav style={{
          flexShrink: 0, width: 180,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 12px', borderRadius: 7, width: '100%',
                  background: active ? 'var(--accent-soft)' : 'none',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: active ? 600 : 400, fontSize: '.875rem',
                  textAlign: 'left', transition: 'all .12s',
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Tab content */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 560 }}>
          {activeTab === 'account'  && <AccountTab user={user} logout={logout} />}
          {activeTab === 'pipeline' && (
            <div className="card">
              <PipelineTab />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
