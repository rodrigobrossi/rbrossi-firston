import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Shield, Bell, Palette, Database, Kanban, Check, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import api from '../lib/api'

// ── Color palette for column customization ────────────────────
const COLOR_PALETTE = [
  '#60A5FA', '#818CF8', '#A78BFA', '#EC4899',
  '#F59E0B', '#10B981', '#EF4444', '#34D399',
  '#F97316', '#06B6D4', '#84CC16', '#8B5CF6',
]

// ── Pipeline columns editor ───────────────────────────────────
function PipelineColumnsSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-columns'],
    queryFn: () => api.get('/pipeline/columns').then(r => r.data),
  })

  const [local, setLocal] = useState(null)
  const [openPicker, setOpenPicker] = useState(null) // key_name of column with open picker
  const [saved, setSaved] = useState(false)

  // Use local state once loaded, fall back to server data
  const cols = local ?? data?.columns ?? []

  const saveMut = useMutation({
    mutationFn: columns => api.put('/pipeline/columns', { columns }),
    onSuccess: ({ data }) => {
      qc.setQueryData(['pipeline-columns'], data)
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
    const arr   = [...(local ?? data?.columns ?? [])]
    const idx   = arr.findIndex(c => c.key_name === key_name)
    const swap  = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setLocal(arr.map((c, i) => ({ ...c, position: i })))
  }

  const isDirty = local !== null

  if (isLoading) return (
    <div style={{ fontSize: '.85rem', color: 'var(--text-3)', padding: '8px 0' }}>
      Carregando colunas…
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {cols.map((col, idx) => (
          <div
            key={col.key_name}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              opacity: col.visible ? 1 : 0.5,
              transition: 'opacity .15s',
            }}
          >
            {/* Reorder */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => move(col.key_name, -1)} disabled={idx === 0}
                style={{ background: 'none', color: 'var(--text-3)', padding: '1px 3px',
                  opacity: idx === 0 ? 0.3 : 1 }}>
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(col.key_name, 1)} disabled={idx === cols.length - 1}
                style={{ background: 'none', color: 'var(--text-3)', padding: '1px 3px',
                  opacity: idx === cols.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={12} />
              </button>
            </div>

            {/* Color picker trigger */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOpenPicker(openPicker === col.key_name ? null : col.key_name)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: col.color,
                  border: '2px solid rgba(255,255,255,.2)', cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Alterar cor"
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
                    <button
                      key={c}
                      onClick={() => { update(col.key_name, { color: c }); setOpenPicker(null) }}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: c,
                        border: col.color === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
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

            {/* Key name badge */}
            <span style={{ fontSize: '.68rem', color: 'var(--text-3)', background: 'var(--bg-card)',
              padding: '2px 7px', borderRadius: 99, fontFamily: 'monospace', flexShrink: 0 }}>
              {col.key_name}
            </span>

            {/* Visibility toggle */}
            <button
              onClick={() => update(col.key_name, { visible: !col.visible })}
              title={col.visible ? 'Ocultar coluna' : 'Exibir coluna'}
              style={{ background: 'none', color: col.visible ? 'var(--accent)' : 'var(--text-3)',
                padding: '4px', flexShrink: 0 }}>
              {col.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="btn btn-primary"
          disabled={!isDirty || saveMut.isPending}
          style={{ fontSize: '.8rem', padding: '7px 16px' }}
          onClick={() => saveMut.mutate(cols)}
        >
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

// ── Settings page ─────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth()

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Configurações</h1><p className="page-sub">Conta e preferências</p></div>
      </div>

      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Profile */}
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

        {/* Pipeline columns */}
        <div className="card fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Kanban size={16} color="var(--accent)" />
            <h3 style={{ fontWeight: 600, fontSize: '.95rem' }}>Colunas do Pipeline</h3>
          </div>
          <p style={{ fontSize: '.8rem', color: 'var(--text-3)', marginBottom: 16 }}>
            Personalize o nome, cor, ordem e visibilidade de cada estágio do seu Kanban.
          </p>
          <PipelineColumnsSection />
        </div>

        {/* Static sections */}
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
    </div>
  )
}
