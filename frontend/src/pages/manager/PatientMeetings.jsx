import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { fmtDate } from '../../utils/formatters'
import { useConfirm } from '../../components/ConfirmDialog'

// ── Patient Requests Panel ─────────────────────────────────────────────────────
const REQ_STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700',
  read:     'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}
const REQ_STATUS_LABELS = { pending: 'ממתינה', read: 'נקראה', resolved: 'טופלה' }
const REQ_CAT_LABELS = { general: 'כללי', document: 'בקשת מסמך', meeting: 'בקשת פגישה', question: 'שאלה', financial: 'עניין כספי' }

function PatientRequestsPanel({ patientId }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [open, setOpen]         = useState(true)
  const [replyId, setReplyId]   = useState(null)
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)

  const load = useCallback((signal) => {
    axios.get(`/api/patients/${patientId}/requests`, { signal })
      .then(r => setRequests(r.data))
      .catch(e => { if (axios.isCancel(e)) return })
      .finally(() => setLoading(false))
  }, [patientId])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const resolve = async (req, newStatus) => {
    setSaving(true)
    await axios.put(`/api/patients/${patientId}/requests/${req.id}`, {
      status: newStatus,
      manager_note: replyId === req.id ? note : undefined,
    }).catch(() => {})
    setReplyId(null); setNote(''); setSaving(false)
    load()
  }

  const pending = requests.filter(r => r.status === 'pending').length

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden mt-6">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-lg">{open ? '▾' : '▸'}</span>
          {pending > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending}</span>
          )}
        </div>
        <span className="font-semibold text-slate-800">פניות מהמטופל</span>
      </button>

      {open && (
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="py-6 text-center text-slate-600 text-sm">טוען...</div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-slate-600 text-sm">אין פניות ממטופל זה</div>
          ) : (
            requests.map(r => (
              <div key={r.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REQ_STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {REQ_STATUS_LABELS[r.status] || r.status}
                    </span>
                    <span className="text-xs text-slate-600">{fmtDate(r.created_at)}</span>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {REQ_CAT_LABELS[r.category] || r.category}
                  </span>
                </div>

                <p className="text-sm text-slate-700 text-right leading-relaxed">{r.message}</p>

                {r.manager_note && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1 text-right">תגובה שנשלחה</p>
                    <p className="text-sm text-blue-800 text-right">{r.manager_note}</p>
                  </div>
                )}

                {r.status !== 'resolved' && (
                  replyId === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right resize-none focus:outline-none focus:border-blue-400"
                        rows={2}
                        placeholder="כתוב תגובה למטופל (אופציונלי)..."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setReplyId(null); setNote('') }}
                          className="text-xs text-slate-500 px-3 py-1.5 hover:text-slate-700">ביטול</button>
                        <button onClick={() => resolve(r, 'resolved')} disabled={saving}
                          className="text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
                          {saving ? 'שומר...' : 'סמן כטופל'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setReplyId(r.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                        הגב וסגור
                      </button>
                      <button onClick={() => resolve(r, 'resolved')} disabled={saving}
                        className="text-xs font-medium text-green-700 hover:text-green-800 px-3 py-1.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                        טפול ✓
                      </button>
                    </div>
                  )
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const TYPES = [
  { value: 'oncologist',      label: 'אונקולוג' },
  { value: 'insurance_agent', label: 'סוכן ביטוח' },
  { value: 'social_worker',   label: 'עו״ס / מתאמת' },
  { value: 'pain_doctor',     label: 'רופא כאב' },
  { value: 'hmo',             label: 'קופת חולים' },
  { value: 'other',           label: 'אחר' },
]

const TYPE_ICONS = { oncologist: '👨‍⚕️', insurance_agent: '📋', social_worker: '🤝', pain_doctor: '💊', hmo: '🏥', other: '📝' }

const REIMBURSE = [
  { value: '',             label: '— לא רלוונטי —' },
  { value: 'kupat_holim', label: 'קופת חולים' },
  { value: 'private',     label: 'ביטוח פרטי' },
  { value: 'both',        label: 'שניהם' },
]

const EMPTY_MEETING = {
  meeting_type: 'oncologist', meeting_date: '', professional_name: '',
  status_summary: '', action_items: [],
  has_visit_summary: false, has_referrals: false, has_prescriptions: false,
  has_lab_results: false, has_insurance_approval: false,
  meeting_cost: '', reimbursement_entity: '', receipt_received: false,
  reimbursement_submitted: false, caregiver_notes: '',
}

function MeetingForm({ patientId, meeting, onClose, onSaved }) {
  const [form, setForm] = useState(meeting ? {
    ...meeting,
    action_items: meeting.action_items || [],
    meeting_cost: meeting.meeting_cost ?? '',
  } : EMPTY_MEETING)
  const [saving, setSaving] = useState(false)
  const [newTask, setNewTask] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addTask = () => {
    if (!newTask.trim()) return
    set('action_items', [...form.action_items, { task: newTask.trim(), responsible: '', done: false }])
    setNewTask('')
  }

  const toggleTask = i => {
    const updated = form.action_items.map((t, idx) => idx === i ? { ...t, done: !t.done } : t)
    set('action_items', updated)
  }

  const removeTask = i => set('action_items', form.action_items.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form, meeting_cost: form.meeting_cost ? +form.meeting_cost : null }
      if (meeting?.id) {
        await axios.put(`/api/patients/${patientId}/meetings/${meeting.id}`, payload)
      } else {
        await axios.post(`/api/patients/${patientId}/meetings`, payload)
      }
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const DOCS = [
    ['has_visit_summary', 'סיכום ביקור חתום'],
    ['has_referrals', 'הפניות לבדיקות / טפסי 17'],
    ['has_prescriptions', 'מרשמים (כולל תרופות תופעות לוואי)'],
    ['has_lab_results', 'תוצאות מעבדה / דימות'],
    ['has_insurance_approval', 'אישור ביטוחי'],
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{meeting ? 'עריכת פגישה' : 'תיעוד פגישה חדשה'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl p-2 -m-2 rounded-lg">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Type + Date + Name */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">סוג פגישה</label>
              <select className="input" value={form.meeting_type} onChange={e => set('meeting_type', e.target.value)}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">תאריך</label>
              <input type="date" className="input" value={form.meeting_date} onChange={e => set('meeting_date', e.target.value)} />
            </div>
            <div>
              <label className="label">שם איש המקצוע</label>
              <input className="input" value={form.professional_name} onChange={e => set('professional_name', e.target.value)} placeholder="ד״ר / גב׳ ..." />
            </div>
          </div>

          {/* Status summary */}
          <div>
            <label className="label">סיכום סטטוס (2 משפטים)</label>
            <textarea className="input resize-none" rows={3} value={form.status_summary}
              onChange={e => set('status_summary', e.target.value)}
              placeholder="מה המצב לפי דברי איש המקצוע?" />
          </div>

          {/* Action items */}
          <div>
            <label className="label">פעולות נדרשות (Action Items)</label>
            <div className="space-y-1 mb-2">
              {form.action_items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={item.done} onChange={() => toggleTask(i)} />
                  <span className={`flex-1 text-sm ${item.done ? 'line-through text-slate-500' : 'text-slate-700'}`}>{item.task}</span>
                  {item.responsible && <span className="text-xs text-slate-600">{item.responsible}</span>}
                  <button onClick={() => removeTask(i)} className="text-slate-500 hover:text-red-400 text-xs p-1.5 -m-1.5 rounded">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="הוסף משימה..." />
              <button onClick={addTask} className="btn-secondary text-sm px-3">הוסף</button>
            </div>
          </div>

          {/* Documents checklist */}
          <div>
            <label className="label">מסמכים שהתקבלו / יש לבקש</label>
            <div className="grid grid-cols-2 gap-2">
              {DOCS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Financial */}
          <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            <div>
              <label className="label">עלות הפגישה (₪)</label>
              <input type="number" className="input" value={form.meeting_cost}
                onChange={e => set('meeting_cost', e.target.value)} />
            </div>
            <div>
              <label className="label">גוף לתביעת החזר</label>
              <select className="input" value={form.reimbursement_entity}
                onChange={e => set('reimbursement_entity', e.target.value)}>
                {REIMBURSE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.receipt_received} onChange={e => set('receipt_received', e.target.checked)} />
                <span className="text-sm">קבלה התקבלה</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.reimbursement_submitted} onChange={e => set('reimbursement_submitted', e.target.checked)} />
                <span className="text-sm">בקשת החזר הוגשה</span>
              </label>
            </div>
          </div>

          {/* Caregiver notes */}
          <div>
            <label className="label">הערות אישיות (לא מוצגות למטופל)</label>
            <textarea className="input resize-none" rows={2} value={form.caregiver_notes}
              onChange={e => set('caregiver_notes', e.target.value)}
              placeholder="איך המטופל הרגיש? משהו שלא נאמר?" />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-40">
            {saving ? 'שומר...' : 'שמור פגישה'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MeetingCard({ meeting, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const hasActions = meeting.action_items?.length > 0
  const doneTasks = meeting.action_items?.filter(t => t.done).length || 0
  const docs = [
    [meeting.has_visit_summary, 'סיכום ביקור'],
    [meeting.has_referrals, 'הפניות'],
    [meeting.has_prescriptions, 'מרשמים'],
    [meeting.has_lab_results, 'תוצאות'],
    [meeting.has_insurance_approval, 'אישור ביטוח'],
  ].filter(([v]) => v).map(([, l]) => l)

  return (
    <div className="card border border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{TYPE_ICONS[meeting.meeting_type] || '📝'}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm">{meeting.meeting_type_label}</span>
              {meeting.professional_name && <span className="text-sm text-slate-500">— {meeting.professional_name}</span>}
              {meeting.meeting_date && <span className="text-xs text-slate-600">{meeting.meeting_date}</span>}
            </div>
            {meeting.status_summary && (
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{meeting.status_summary}</p>
            )}
            <div className="flex gap-3 mt-1 flex-wrap">
              {hasActions && (
                <span className="text-xs text-slate-500">{doneTasks}/{meeting.action_items.length} משימות</span>
              )}
              {docs.length > 0 && (
                <span className="text-xs text-emerald-600">✓ {docs.join(', ')}</span>
              )}
              {meeting.meeting_cost > 0 && (
                <span className="text-xs text-slate-500">
                  ₪{meeting.meeting_cost.toLocaleString('he-IL')}
                  {meeting.receipt_received ? ' · קבלה ✓' : ' · ❌ קבלה'}
                  {meeting.reimbursement_submitted ? ' · הוגש ✓' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-slate-600 hover:text-slate-800">
            {expanded ? '▲' : '▼'}
          </button>
          <button onClick={() => onEdit(meeting)} className="text-xs text-blue-500 hover:text-blue-700">עריכה</button>
          <button onClick={() => onDelete(meeting.id)} className="text-xs text-red-400 hover:text-red-600">מחק</button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {hasActions && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">משימות</p>
              {meeting.action_items.map((t, i) => (
                <div key={i} className={`text-sm flex items-center gap-2 ${t.done ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                  <span>{t.done ? '✅' : '☐'}</span>
                  <span>{t.task}</span>
                  {t.responsible && <span className="text-xs text-slate-600">({t.responsible})</span>}
                </div>
              ))}
            </div>
          )}
          {meeting.caregiver_notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">הערות אישיות</p>
              <p className="text-sm text-slate-600 italic">{meeting.caregiver_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PatientMeetings() {
  const { id } = useParams()
  const [meetings, setMeetings] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirm, ConfirmUI] = useConfirm()

  const load = useCallback((signal) => {
    setLoading(true)
    axios.get(`/api/patients/${id}/meetings`, { signal })
      .then(r => setMeetings(r.data))
      .catch(e => { if (axios.isCancel(e)) return })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const deleteMeeting = async (mid) => {
    const ok = await confirm({ title: 'מחיקת פגישה', message: 'למחוק פגישה זו?', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${id}/meetings/${mid}`)
    load()
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">מעקב פגישות</h2>
          <p className="text-sm text-slate-500">תיעוד כל פגישה עם גורם רפואי, ביטוחי או סוציאלי</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-primary">
          + תיעוד פגישה
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-600">טוען...</div>
      ) : meetings.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-600 mb-3">לא תועדו פגישות עדיין</p>
          <button onClick={() => setShowForm(true)} className="btn-secondary">תעד את הפגישה הראשונה</button>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => (
            <MeetingCard key={m.id} meeting={m}
              onEdit={m => { setEditing(m); setShowForm(true) }}
              onDelete={deleteMeeting} />
          ))}
        </div>
      )}

      {showForm && (
        <MeetingForm patientId={id} meeting={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={load} />
      )}

      <PatientRequestsPanel patientId={id} />
    </div>
  )
}
