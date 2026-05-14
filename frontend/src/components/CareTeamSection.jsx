import { useState, useEffect } from 'react'
import axios from 'axios'
import { useConfirm } from './ConfirmDialog'

const ROLES = [
  { value: 'oncologist',        label: 'אונקולוג' },
  { value: 'navigator',         label: 'מתאמת שירות / רכזת' },
  { value: 'pain_doctor',       label: 'רופא כאב / פליאטיבי' },
  { value: 'nutritionist',      label: 'תזונאית אונקולוגית' },
  { value: 'psycho_oncologist', label: 'ליווי רגשי' },
  { value: 'rights_advisor',    label: 'יועץ מיצוי זכויות' },
  { value: 'social_worker',     label: 'עובד סוציאלי' },
  { value: 'other',             label: 'אחר' },
]

const ROLE_ICONS = {
  oncologist: '👨‍⚕️', navigator: '🧭', pain_doctor: '💊',
  nutritionist: '🥗', psycho_oncologist: '🧠', rights_advisor: '⚖️',
  social_worker: '🤝', other: '👤',
}

const EMPTY = { role: 'oncologist', name: '', phone: '', email: '', organization: '', notes: '', is_primary: false }

function MemberModal({ patientId, member, onClose, onSaved }) {
  const [form, setForm] = useState(member || EMPTY)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (member?.id) {
        await axios.put(`/api/patients/${patientId}/care-team/${member.id}`, form)
      } else {
        await axios.post(`/api/patients/${patientId}/care-team`, form)
      }
      onSaved()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">{member ? 'עריכת איש צוות' : 'הוספת איש צוות'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-2 -m-2 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">תפקיד</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם מלא *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ד״ר / גב׳ ..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">טלפון</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">אימייל</label>
              <input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">ארגון / מוסד</label>
            <input className="input" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} />
          </div>
          <div>
            <label className="label">הערות</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} />
            <span className="text-sm text-slate-700">איש קשר ראשי</span>
          </label>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-40">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CareTeamSection({ patientId }) {
  const [members, setMembers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, ConfirmUI] = useConfirm()

  const load = () => axios.get(`/api/patients/${patientId}/care-team`).then(r => setMembers(r.data)).catch(() => {})
  useEffect(() => { load() }, [patientId])

  const remove = async (id) => {
    const ok = await confirm({ title: 'הסרת איש צוות', message: 'להסיר איש צוות זה?', confirmLabel: 'הסר', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${patientId}/care-team/${id}`)
    load()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-800">צוות המטפלים</h2>
        <button onClick={() => { setEditing(null); setShowModal(true) }}
          className="text-sm text-blue-600 hover:underline">+ הוסף</button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-slate-600 text-center py-4">לא הוגדר צוות מטפלים עדיין</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors
              ${m.is_primary ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
              <span className="text-2xl mt-0.5">{ROLE_ICONS[m.role] || '👤'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-800">{m.name}</span>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{m.role_label}</span>
                  {m.is_primary && <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">ראשי</span>}
                </div>
                {m.organization && <p className="text-xs text-slate-500 mt-0.5">{m.organization}</p>}
                <div className="flex gap-3 mt-1 flex-wrap">
                  {m.phone && <a href={`tel:${m.phone}`} className="text-xs text-blue-600 hover:underline">{m.phone}</a>}
                  {m.email && <a href={`mailto:${m.email}`} className="text-xs text-blue-600 hover:underline">{m.email}</a>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditing(m); setShowModal(true) }} className="text-xs text-slate-600 hover:text-blue-600">עריכה</button>
                <button onClick={() => remove(m.id)} className="text-xs text-slate-600 hover:text-red-500">הסר</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <MemberModal patientId={patientId} member={editing}
          onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}
