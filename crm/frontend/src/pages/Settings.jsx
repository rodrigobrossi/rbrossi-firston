import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Shield, Bell, Palette, Database, Kanban, Check, Eye, EyeOff, ChevronUp, ChevronDown, User, Globe } from 'lucide-react'
import api from '../lib/api'
import i18n from '../i18n'

// ── Color palette ──────────────────────────────────────────────
const COLOR_PALETTE = [
  '#60A5FA', '#818CF8', '#A78BFA', '#EC4899',
  '#F59E0B', '#10B981', '#EF4444', '#34D399',
  '#F97316', '#06B6D4', '#84CC16', '#8B5CF6',
]

const LANGUAGES = [
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en',    name: 'English',            flag: '🇺🇸', fallback: true },
]

// ── I18n tab ───────────────────────────────────────────────────
function I18nTab() {
  const { t, i18n: i18nInstance } = useTranslation()
  const current = i18nInstance.language

  const switchLang = (code) => {
    i18nInstance.changeLanguage(code)
    localStorage.setItem('i18n_lang', code)
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>
          {t('settings.i18n_tab.title')}
        </h2>
        <p style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>
          {t('settings.i18n_tab.subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {LANGUAGES.map(lang => {
          const isActive = current === lang.code
          return (
            <button
              key={lang.code}
              onClick={() => switchLang(lang.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 8, textAlign: 'left',
                background: isActive ? 'var(--accent-soft)' : 'var(--bg-hover)',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                cursor: 'pointer', transition: 'all .12s',
              }}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{lang.flag}</span>
              <span style={{ flex: 1, fontWeight: isActive ? 600 : 400, fontSize: '.9rem', color: isActive ? 'var(--accent)' : 'var(--text-1)' }}>
                {lang.name}
              </span>
              {isActive && (
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--accent)', background: 'rgba(37,99,235,.15)', padding: '2px 8px', borderRadius: 99 }}>
                  {t('settings.i18n_tab.active_badge')}
                </span>
              )}
              {lang.fallback && (
                <span style={{ fontSize: '.7rem', color: 'var(--text-3)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border)' }}>
                  {t('settings.i18n_tab.fallback_badge')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <button className="btn btn-ghost" style={{ fontSize: '.85rem', padding: '8px 16px', marginBottom: 8 }}>
          <Globe size={14} /> {t('settings.i18n_tab.add_language')}
        </button>
        <p style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>
          {t('settings.i18n_tab.add_language_note')}
        </p>
      </div>
    </div>
  )
}

// ── Pipeline columns editor ───────────────────────────────────
function PipelineTab() {
  const { t } = useTranslation()
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
          {t('settings.pipeline_tab.title')}
        </h2>
        <p style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>
          {t('settings.pipeline_tab.subtitle')}
        </p>
      </div>

      {isLoading ? (
        <p style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>{t('common.loading')}</p>
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
                  title={t('settings.pipeline_tab.change_color')}
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
                title={col.visible ? t('settings.pipeline_tab.hide_column') : t('settings.pipeline_tab.show_column')}
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
          {saveMut.isPending ? t('common.saving') : t('common.save')}
        </button>
        {isDirty && (
          <button className="btn btn-ghost" style={{ fontSize: '.8rem', padding: '7px 14px' }}
            onClick={() => setLocal(null)}>
            {t('common.discard')}
          </button>
        )}
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4,
            fontSize: '.8rem', color: 'var(--success)' }}>
            <Check size={13} /> {t('common.saved')}
          </span>
        )}
        {saveMut.isError && (
          <span style={{ fontSize: '.8rem', color: 'var(--danger)' }}>{t('common.error_save')}</span>
        )}
      </div>
    </div>
  )
}

// ── Generic info tab (Security, Notifications, Local Env, Interface) ──
function InfoTab({ icon: Icon, titleKey, itemsKey }) {
  const { t } = useTranslation()
  const title = t(titleKey)
  const items = t(itemsKey, { returnObjects: true })
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Icon size={16} color="var(--accent)" />
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem' }}>{title}</h2>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.isArray(items) && items.map(item => (
          <li key={item} style={{ fontSize: '.875rem', color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Account tab ────────────────────────────────────────────────
function AccountTab({ user, logout }) {
  const { t } = useTranslation()
  return (
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
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{user?.name || t('settings.account.user_fallback')}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-2)' }}>{t('settings.account.pro_plan')} · {user?.sub?.slice(0, 8)}</div>
        </div>
      </div>
      <button className="btn btn-ghost" onClick={logout}
        style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,.3)' }}>
        <LogOut size={14} /> {t('settings.account.sign_out')}
      </button>
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────
export default function Settings() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('account')

  const TABS = [
    { id: 'account',       label: t('settings.tab_account'),       icon: User     },
    { id: 'pipeline',      label: t('settings.tab_pipeline'),      icon: Kanban   },
    { id: 'i18n',          label: t('settings.tab_i18n'),          icon: Globe    },
    { id: 'security',      label: t('settings.tab_security'),      icon: Shield   },
    { id: 'notifications', label: t('settings.tab_notifications'), icon: Bell     },
    { id: 'local_env',     label: t('settings.tab_local_env'),     icon: Database },
    { id: 'interface',     label: t('settings.tab_interface'),     icon: Palette  },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
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
          {activeTab === 'account'       && <AccountTab user={user} logout={logout} />}
          {activeTab === 'pipeline'      && <div className="card"><PipelineTab /></div>}
          {activeTab === 'i18n'          && <div className="card"><I18nTab /></div>}
          {activeTab === 'security'      && <InfoTab icon={Shield}   titleKey="settings.account.security_title"      itemsKey="settings.account.security_items" />}
          {activeTab === 'notifications' && <InfoTab icon={Bell}     titleKey="settings.account.notifications_title" itemsKey="settings.account.notifications_items" />}
          {activeTab === 'local_env'     && <InfoTab icon={Database} titleKey="settings.account.local_env_title"     itemsKey="settings.account.local_env_items" />}
          {activeTab === 'interface'     && <InfoTab icon={Palette}  titleKey="settings.account.interface_title"     itemsKey="settings.account.interface_items" />}
        </div>
      </div>
    </div>
  )
}
