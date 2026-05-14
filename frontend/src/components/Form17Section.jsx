import { useState, useEffect } from 'react'
import axios from 'axios'
import { useConfirm } from './ConfirmDialog'

const STATUSES = [
  { value: 'pending',   label: 'טרם הוגש',    color: 'bg-slate-100 text-slate-600' },
  { value: 'requested', label: 'הוגשה בקשה',  color: 'bg-blue-100 text-blue-700' },
  { value: 'approved',  label: 'אושר',         color: 'bg-emerald-100 text-emerald-700' },
  { value: 'denied',    label: 'נדחה',          color: 'bg-red-100 text-red-700' },
]

const statusColor = (s) => STATUSES.find(x => x.value === s)?.color || ''
const statusLabel = (s) => STATUSES.find(x => x.value === s)?.label || s

function Form17Modal({ patientId, entry, sources, onClose, onSaved }) {
  const [form, setForm] = useState(entry || {
    procedure_name: '', insurance_source_id: '', status: 'pending',
    requested_date: '', approved_date: '', amount_approved: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.procedure_name.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        insurance_source_id: form.insurance_source_id ? +form.insurance_source_id : null,
        amount_approved: form.amount_approved ? +form.amount_approved : null,
      }
      if (entry?.id) {
        await axios.put(`/api/patients/${patientId}/form17/${entry.id}`, payload)
      } else {
        await axios.post(`/api/patients/${patientId}/form17`, payload)
      }
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">{entry ? 'עריכת טופס 17' : 'טופס 17 חדש'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-2 -m-2 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">שם הבדיקה / הטיפול *</label>
            <input className="input" value={form.procedure_name}
              onChange={e => set('procedure_name', e.target.value)}
              placeholder="למשל: MRI ראש, ניתוח ברך..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">מקור ביטוח</label>
              <select className="input" value={form.insurance_source_id}
                onChange={e => set('insurance_source_id', e.target.value)}>
                <option value="">— כל המקורות —</option>
                {sources.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.hmo_name || s.company_name || s.source_type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">סטטוס</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">תאריך הגשה</label>
              <input type="date" className="input" value={form.requested_date}
                onChange={e => set('requested_date', e.target.value)} />
            </div>
            <div>
              <label className="label">תאריך אישור</label>
              <input type="date" className="input" value={form.approved_date}
                onChange={e => set('approved_date', e.target.value)} />
            </div>
          </div>
          {form.status === 'approved' && (
            <div>
              <label className="label">סכום מאושר (₪)</label>
              <input type="number" className="input" value={form.amount_approved}
                onChange={e => set('amount_approved', e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">הערות</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={saving || !form.procedure_name.trim()} className="btn-primary disabled:opacity-40">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Form17Section({ patientId }) {
  const [entries, setEntries] = useState([])
  const [sources, setSources] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, ConfirmUI] = useConfirm()

  const load = (signal) => {
    axios.get(`/api/patients/${patientId}/form17`, { signal }).then(r => setEntries(r.data)).catch(e => { if (axios.isCancel(e)) return })
    axios.get(`/api/patients/${patientId}/insurance`, { signal }).then(r => setSources(r.data)).catch(e => { if (axios.isCancel(e)) return })
  }
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [patientId])

  const remove = async (id) => {
    const ok = await confirm({ title: 'מחיקה', message: 'האם למחוק?', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${patientId}/form17/${id}`)
    load()
  }

  const pending = entries.filter(e => e.status === 'pending' || e.status === 'requested')
  const done    = entries.filter(e => e.status === 'approved' || e.status === 'denied')

  return (
    <div className="mt-6">
      {ConfirmUI}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">מעקב טופס 17</h3>
        <button onClick={() => { setEditing(null); setShowModal(true) }}
          className="text-sm text-blue-600 hover:underline">+ הוסף</button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-600 py-3 text-center">לא הוגדרו התחייבויות קופה עדיין</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-800">{e.procedure_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(e.status)}`}>
                    {statusLabel(e.status)}
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                  {e.insurance_source && <span>{e.insurance_source}</span>}
                  {e.requested_date && <span>הוגש: {e.requested_date}</span>}
                  {e.approved_date && <span>אושר: {e.approved_date}</span>}
                  {e.amount_approved && <span className="text-emerald-600 font-medium">₪{e.amount_approved.toLocaleString('he-IL')}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditing(e); setShowModal(true) }} className="text-xs text-blue-500 hover:text-blue-700">עריכה</button>
                <button onClick={() => remove(e.id)} className="text-xs text-red-400 hover:text-red-600">מחק</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Form17Modal patientId={patientId} entry={editing} sources={sources}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={load} />
      )}
    </div>
  )
}
