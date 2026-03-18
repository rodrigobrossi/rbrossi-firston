/**
 * Contacts page
 *
 * Features:
 *  - Contact list with expandable detail row
 *  - Photo upload → S3 via BFF → contact-service (AWS-compatible)
 *  - Google Maps Places Autocomplete for address + lat/lng capture
 *    → create crm/frontend/.env.local with VITE_GOOGLE_MAPS_KEY=<your_key>
 *    → without a key, address falls back to plain text input
 *  - All PII (phone, phone2, DOB, address, preferred_name) encrypted
 *    server-side with AES-256-GCM (AWS KMS data key in prod)
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, ChevronDown, ChevronRight, Camera, MapPin, Phone, Mail, Edit2 } from 'lucide-react'
import api from '../lib/api'

// ── Constants ─────────────────────────────────────────────────
const TEMPS = ['', 'hot', 'warm', 'cold', 'customer']
const TEMP_LABEL = { hot: '🔥 Hot', warm: '☀️ Warm', cold: '❄️ Cold', customer: '✅ Cliente' }

const SEX_OPTIONS = [
  { value: '',             label: 'Não informado' },
  { value: 'male',         label: 'Masculino' },
  { value: 'female',       label: 'Feminino' },
  { value: 'intersex',     label: 'Intersexo' },
  { value: 'not_informed', label: 'Prefiro não informar' },
]

const CHANNELS = ['whatsapp', 'email', 'phone', 'sms']

const EMPTY_FORM = {
  first_name: '', last_name: '', preferred_name: '', email: '',
  phone: '', phone2: '', cpf: '', date_of_birth: '',
  sex: '', gender: '', address: '', address_lat: null, address_lng: null,
  title: '', linkedin_url: '', sector: '', temperature: 'cold',
  preferred_channel: 'whatsapp', budget_brl: '', company_id: '',
}

// ── Google Maps loader ────────────────────────────────────────
function useGoogleMaps() {
  const [ready, setReady] = useState(!!(window.google?.maps?.places))
  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
    if (!key) return
    if (window.google?.maps?.places) { setReady(true); return }
    const cbName = `__gmInit_${Date.now()}`
    window[cbName] = () => { setReady(true); delete window[cbName] }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=${cbName}`
    s.async = true
    document.head.appendChild(s)
  }, [])
  return ready
}

// ── Score bar ─────────────────────────────────────────────────
function ScoreBar({ score }) {
  const color = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div className="stress-bar" style={{ width: 60 }}>
        <div className="stress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontSize: '.75rem', color, fontWeight: 600 }}>{score}</span>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ contact, size = 32 }) {
  const [imgErr, setImgErr] = useState(false)
  const hasPhoto = contact.photo_url && !imgErr
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      overflow: 'hidden', background: 'var(--accent-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: 'var(--accent)',
    }}>
      {hasPhoto
        ? <img src={contact.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgErr(true)} />
        : (contact.first_name?.charAt(0) || '?').toUpperCase()
      }
    </div>
  )
}

// ── Address input with Google Maps Autocomplete ───────────────
function AddressInput({ value, onChange, onPlaceSelect, googleReady }) {
  const ref   = useRef(null)
  const acRef = useRef(null)

  useEffect(() => {
    if (!ref.current || !googleReady || acRef.current) return
    acRef.current = new window.google.maps.places.Autocomplete(ref.current, { types: ['address'] })
    acRef.current.addListener('place_changed', () => {
      const place = acRef.current.getPlace()
      if (place.formatted_address) {
        onPlaceSelect({
          address:     place.formatted_address,
          address_lat: place.geometry?.location?.lat() ?? null,
          address_lng: place.geometry?.location?.lng() ?? null,
        })
      }
    })
  }, [googleReady])

  return (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={googleReady ? 'Digite para buscar endereço…' : 'Endereço completo'}
      style={{ width: '100%', padding: '8px 12px', fontSize: '.875rem' }}
    />
  )
}

// ── Contact detail panel (expanded row) ──────────────────────
function ContactDetail({ contact, onEdit, onPhotoUploaded }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)

  const photoMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('photo', file)
      return api.post(`/contacts/${contact.id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => { qc.invalidateQueries(['contacts']); onPhotoUploaded?.() },
  })

  const Field = ({ label, value }) => value ? (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: '.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: '.85rem', color: 'var(--text-1)', marginTop: 2 }}>{value}</div>
    </div>
  ) : null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 24,
      padding: '20px 24px', background: 'var(--bg-hover)', borderTop: '1px solid var(--border)',
    }}>

      {/* Photo + edit */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Avatar contact={contact} size={88} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoMut.isPending}
            title="Trocar foto"
            style={{
              position: 'absolute', bottom: -4, right: -4, width: 26, height: 26,
              borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            <Camera size={12} color="#fff" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => e.target.files[0] && photoMut.mutate(e.target.files[0])} />
        {photoMut.isPending && <span style={{ fontSize: '.7rem', color: 'var(--text-3)' }}>Enviando…</span>}
        {photoMut.isError   && <span style={{ fontSize: '.7rem', color: 'var(--danger)' }}>Erro no upload</span>}
        <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '5px 12px' }} onClick={onEdit}>
          <Edit2 size={12} /> Editar
        </button>
      </div>

      {/* Identity */}
      <div>
        <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
          letterSpacing: '.08em', marginBottom: 10 }}>Identidade</div>
        <Field label="Nome completo" value={[contact.first_name, contact.last_name].filter(Boolean).join(' ')} />
        <Field label="Chamado(a) como" value={contact.preferred_name} />
        <Field label="Data de nascimento" value={contact.date_of_birth} />
        <Field label="Sexo" value={SEX_OPTIONS.find(o => o.value === (contact.sex || ''))?.label} />
        <Field label="Gênero" value={contact.gender} />
        <Field label="CPF" value={contact.cpf ? '••• ocultado (criptografado) •••' : null} />
        <Field label="Cargo" value={contact.title} />
        <Field label="Empresa" value={contact.company_name} />
      </div>

      {/* Contact + location */}
      <div>
        <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
          letterSpacing: '.08em', marginBottom: 10 }}>Contato & Localização</div>
        {contact.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <Mail size={13} color="var(--text-3)" />
            <span style={{ fontSize: '.85rem' }}>{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <Phone size={13} color="var(--text-3)" />
            <span style={{ fontSize: '.85rem' }}>{contact.phone}</span>
          </div>
        )}
        {contact.phone2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <Phone size={13} color="var(--text-3)" />
            <span style={{ fontSize: '.85rem' }}>{contact.phone2}
              <span style={{ fontSize: '.72rem', color: 'var(--text-3)', marginLeft: 4 }}>(2º)</span>
            </span>
          </div>
        )}
        {contact.address && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 7 }}>
            <MapPin size={13} color="var(--text-3)" style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: '.85rem' }}>{contact.address}</div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.75rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
            padding: '2px 8px', borderRadius: 99, color: 'var(--text-2)' }}>
            {contact.preferred_channel}
          </span>
          <span className={`badge badge-${contact.temperature}`}>{TEMP_LABEL[contact.temperature]}</span>
        </div>
      </div>
    </div>
  )
}

// ── Modal helpers (defined OUTSIDE ContactModal to preserve identity) ────
// Defining these inside the component causes React to create a new component
// type on every render, unmounting inputs and losing focus after each keystroke.

const MODAL_INPUT  = { width: '100%', padding: '8px 12px', fontSize: '.875rem' }
const MODAL_LABEL  = { fontSize: '.75rem', color: 'var(--text-2)', display: 'block', marginBottom: 4 }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
        letterSpacing: '.08em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, type = 'text', full = false, value, onChange, error }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : {}}>
      <label style={MODAL_LABEL}>{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        style={{
          ...MODAL_INPUT,
          ...(error ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 3px rgba(239,68,68,.12)' } : {}),
        }}
      />
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginTop: 4, fontSize: '.72rem', color: 'var(--danger)',
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 3.5v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}

// ── Field error decorator (for non-Field elements like selects) ─
function FieldError({ error, children }) {
  return (
    <div>
      <div style={error ? { position: 'relative' } : {}}>
        {error && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 6,
            border: '1px solid var(--danger)',
            boxShadow: '0 0 0 3px rgba(239,68,68,.12)',
            pointerEvents: 'none', zIndex: 1,
          }} />
        )}
        {children}
      </div>
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginTop: 4, fontSize: '.72rem', color: 'var(--danger)',
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 3.5v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────
function ContactModal({ initial, onClose }) {
  const qc         = useQueryClient()
  const isEdit     = !!initial?.id
  const googleReady = useGoogleMaps()

  const [form, setForm] = useState(() => isEdit ? {
    first_name:        initial.first_name        || '',
    last_name:         initial.last_name         || '',
    preferred_name:    initial.preferred_name    || '',
    email:             initial.email             || '',
    phone:             initial.phone             || '',
    phone2:            initial.phone2            || '',
    cpf:               initial.cpf               || '',
    date_of_birth:     initial.date_of_birth     || '',
    sex:               initial.sex               || '',
    gender:            initial.gender            || '',
    address:           initial.address           || '',
    address_lat:       initial.address_lat       ?? null,
    address_lng:       initial.address_lng       ?? null,
    title:             initial.title             || '',
    linkedin_url:      initial.linkedin_url      || '',
    sector:            initial.sector            || '',
    temperature:       initial.temperature       || 'cold',
    preferred_channel: initial.preferred_channel || 'whatsapp',
    budget_brl:        initial.budget_brl        || '',
    company_id:        initial.company_id        || '',
  } : { ...EMPTY_FORM })

  const [photoFile,    setPhotoFile]    = useState(null)
  const [photoPreview, setPhotoPreview] = useState(initial?.photo_url || null)
  const [errors,       setErrors]       = useState({})
  const fileRef = useRef(null)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const validate = (f) => {
    const e = {}
    if (!f.first_name?.trim())
      e.first_name = 'Nome é obrigatório'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
      e.email = 'E-mail inválido'
    if (f.phone && f.phone.replace(/\D/g, '').length < 8)
      e.phone = 'Telefone deve ter ao menos 8 dígitos'
    if (f.phone2 && f.phone2.replace(/\D/g, '').length < 8)
      e.phone2 = 'Telefone deve ter ao menos 8 dígitos'
    if (f.cpf && f.cpf.replace(/\D/g, '').length !== 11)
      e.cpf = 'CPF deve ter 11 dígitos'
    if (f.linkedin_url && !/^https?:\/\/.+/.test(f.linkedin_url))
      e.linkedin_url = 'URL deve começar com http:// ou https://'
    if (f.budget_brl !== '' && f.budget_brl !== null && Number(f.budget_brl) < 0)
      e.budget_brl = 'Budget não pode ser negativo'
    if (f.date_of_birth && new Date(f.date_of_birth) > new Date())
      e.date_of_birth = 'Data de nascimento não pode ser no futuro'
    return e
  }

  const saveMut = useMutation({
    mutationFn: async (formData) => {
      if (isEdit) {
        await api.patch(`/contacts/${initial.id}`, formData)
        return { id: initial.id }
      }
      const { data } = await api.post('/contacts', formData)
      return data
    },
    onSuccess: async ({ id }) => {
      if (photoFile) {
        const fd = new FormData()
        fd.append('photo', photoFile)
        await api.post(`/contacts/${id}/photo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch(() => {}) // photo upload failure is non-fatal
      }
      qc.invalidateQueries(['contacts'])
      onClose()
    },
  })

  const handlePhotoSelect = (file) => {
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = e => setPhotoPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div className="card" style={{ width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>
            {isEdit ? 'Editar Contato' : 'Novo Contato'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-2)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>

          {/* Photo upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => fileRef.current?.click()}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-soft)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)',
                border: '2px dashed var(--accent)',
              }}>
                {photoPreview
                  ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (form.first_name?.charAt(0)?.toUpperCase() || <Camera size={22} />)
                }
              </div>
              <div style={{
                position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%',
                background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Camera size={11} color="#fff" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '.875rem', fontWeight: 500 }}>Foto do contato</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-3)', marginTop: 2 }}>JPG, PNG ou WebP · máx. 5 MB</div>
              <button className="btn btn-ghost" style={{ marginTop: 6, fontSize: '.75rem', padding: '4px 10px' }}
                type="button" onClick={() => fileRef.current?.click()}>
                {photoPreview ? 'Trocar foto' : 'Selecionar foto'}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handlePhotoSelect(e.target.files[0])} />
          </div>

          {/* Identidade */}
          <Section title="Identidade">
            <Field label="Nome *"            value={form.first_name}    onChange={e => set('first_name', e.target.value)}    error={errors.first_name} />
            <Field label="Sobrenome"          value={form.last_name}     onChange={e => set('last_name', e.target.value)} />
            <Field label="Chamado(a) como"    value={form.preferred_name} onChange={e => set('preferred_name', e.target.value)} />
            <Field label="Data de nascimento" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} error={errors.date_of_birth} />
            <div>
              <label style={MODAL_LABEL}>Sexo biológico</label>
              <select value={form.sex} onChange={e => set('sex', e.target.value)} style={MODAL_INPUT}>
                {SEX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Field label="Identidade de gênero" value={form.gender} onChange={e => set('gender', e.target.value)} />
            <Field label="CPF (criptografado)"   value={form.cpf}    onChange={e => set('cpf', e.target.value)} error={errors.cpf} />
          </Section>

          {/* Contato */}
          <Section title="Contato">
            <Field label="E-mail"     type="email" value={form.email}  onChange={e => set('email', e.target.value)}  error={errors.email} />
            <Field label="Telefone 1"              value={form.phone}  onChange={e => set('phone', e.target.value)}  error={errors.phone} />
            <Field label="Telefone 2"              value={form.phone2} onChange={e => set('phone2', e.target.value)} error={errors.phone2} />
            <div>
              <label style={MODAL_LABEL}>Canal preferido</label>
              <select value={form.preferred_channel} onChange={e => set('preferred_channel', e.target.value)} style={MODAL_INPUT}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </Section>

          {/* Localização */}
          <Section title="Localização">
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={MODAL_LABEL}>Endereço</label>
              <FieldError error={errors.address}>
                <AddressInput
                  value={form.address}
                  onChange={v => set('address', v)}
                  onPlaceSelect={({ address, address_lat, address_lng }) =>
                    setForm(f => ({ ...f, address, address_lat, address_lng }))}
                  googleReady={googleReady}
                />
              </FieldError>
              {!import.meta.env.VITE_GOOGLE_MAPS_KEY && (
                <div style={{ fontSize: '.7rem', color: 'var(--text-3)', marginTop: 4 }}>
                  Adicione <code>VITE_GOOGLE_MAPS_KEY=sua_chave</code> em <code>crm/frontend/.env.local</code> para autocompletar
                </div>
              )}
            </div>
          </Section>

          {/* CRM */}
          <Section title="CRM">
            <Field label="Cargo"        value={form.title}        onChange={e => set('title', e.target.value)} />
            <Field label="Setor"        value={form.sector}       onChange={e => set('sector', e.target.value)} />
            <Field label="LinkedIn URL" value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} full error={errors.linkedin_url} />
            <Field label="Budget (R$)"  value={form.budget_brl}   onChange={e => set('budget_brl', e.target.value)} type="number" error={errors.budget_brl} />
            <div>
              <label style={MODAL_LABEL}>Temperatura</label>
              <select value={form.temperature} onChange={e => set('temperature', e.target.value)} style={MODAL_INPUT}>
                {['hot', 'warm', 'cold', 'customer'].map(t => (
                  <option key={t} value={t}>{TEMP_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {saveMut.error && (
            <span style={{ color: 'var(--danger)', fontSize: '.8rem', alignSelf: 'center', marginRight: 'auto' }}>
              {saveMut.error.response?.data?.error || 'Erro ao salvar'}
            </span>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saveMut.isPending}
            onClick={() => {
              const e = validate(form)
              if (Object.keys(e).length) { setErrors(e); return }
              saveMut.mutate(form)
            }}>
            {saveMut.isPending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar contato'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function Contacts() {
  const [q, setQ]                   = useState('')
  const [temp, setTemp]             = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [expandedId, setExpanded]   = useState(null)
  const [editContact, setEditContact] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', temp],
    queryFn:  () => api.get(`/contacts?limit=100${temp ? `&temperature=${temp}` : ''}`).then(r => r.data),
  })

  const filtered = (data?.data || []).filter(c =>
    !q || `${c.first_name} ${c.last_name} ${c.email} ${c.phone} ${c.phone2}`
      .toLowerCase().includes(q.toLowerCase())
  )

  const toggle = (id) => setExpanded(prev => prev === id ? null : id)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contatos</h1>
          <p className="page-sub">{data?.total || 0} contatos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Novo Contato
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome, e-mail, telefone…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: '.875rem' }} />
        </div>
        {TEMPS.map(t => (
          <button key={t} className={`btn ${temp === t ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.8rem', padding: '7px 14px' }} onClick={() => setTemp(t)}>
            {t ? TEMP_LABEL[t] : 'Todos'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-3)', fontSize: '.75rem' }}>
              <th style={{ width: 36 }} />
              {['Contato', 'Empresa', 'Telefones', 'Canal', 'Temperatura', 'Score'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Nenhum contato encontrado.</td></tr>
            ) : filtered.flatMap(c => {
              const isOpen = expandedId === c.id
              return [
                <tr key={c.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer',
                    background: isOpen ? 'rgba(37,99,235,.04)' : 'transparent' }}
                  onClick={() => toggle(c.id)}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}>

                  {/* Chevron */}
                  <td style={{ padding: '12px 0 12px 16px', color: 'var(--text-3)' }}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>

                  {/* Name + avatar */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar contact={c} size={34} />
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {c.first_name} {c.last_name}
                          {c.preferred_name && (
                            <span style={{ fontSize: '.72rem', color: 'var(--text-3)', marginLeft: 6 }}>
                              ({c.preferred_name})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-2)' }}>{c.email}</div>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>{c.company_name || '—'}</td>

                  <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                    {c.phone  && <div style={{ fontSize: '.82rem' }}>{c.phone}</div>}
                    {c.phone2 && <div style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>{c.phone2}</div>}
                    {!c.phone && !c.phone2 && '—'}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-2)', background: 'var(--bg-hover)',
                      padding: '2px 8px', borderRadius: 99 }}>
                      {c.preferred_channel}
                    </span>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge badge-${c.temperature}`}>{TEMP_LABEL[c.temperature] || c.temperature}</span>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <ScoreBar score={c.profile_score} />
                  </td>
                </tr>,

                // Expanded detail row
                isOpen && (
                  <tr key={`${c.id}-detail`}>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <ContactDetail
                        contact={c}
                        onEdit={() => { setEditContact(c); setExpanded(null) }}
                        onPhotoUploaded={() => {}}
                      />
                    </td>
                  </tr>
                ),
              ].filter(Boolean)
            })}
          </tbody>
        </table>
      </div>

      {showAdd    && <ContactModal onClose={() => setShowAdd(false)} />}
      {editContact && <ContactModal initial={editContact} onClose={() => setEditContact(null)} />}
    </div>
  )
}
