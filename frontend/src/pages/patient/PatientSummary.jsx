import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useTranslation } from 'react-i18next'

// ── helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => n != null ? `₪${Math.round(n).toLocaleString('he-IL')}` : '—'

const fmtDate = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CLAIM_STATUS = {
  pending:   { label: 'ממתין',         bg: 'bg-slate-100',   text: 'text-slate-600' },
  submitted: { label: 'הוגש',          bg: 'bg-blue-100',    text: 'text-blue-700'  },
  approved:  { label: 'אושר ✓',        bg: 'bg-green-100',   text: 'text-green-700' },
  partial:   { label: 'אושר חלקית',   bg: 'bg-yellow-100',  text: 'text-yellow-700'},
  rejected:  { label: 'נדחה',          bg: 'bg-red-100',     text: 'text-red-700'   },
}

const STEP_DOT = {
  completed: 'bg-green-500',
  active:    'bg-blue-500 ring-2 ring-blue-200',
  skipped:   'bg-slate-300',
  pending:   'bg-slate-200',
}

const FLAG_COLORS = {
  medical:   { bg: 'bg-red-50',    border: 'border-red-200',    icon: '🔴', text: 'text-red-800'   },
  financial: { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: '🟡', text: 'text-amber-800' },
  caregiver: { bg: 'bg-purple-50', border: 'border-purple-200', icon: '🟣', text: 'text-purple-800'},
}

const REQUEST_CATEGORIES = [
  { key: 'general',   label: 'כללי' },
  { key: 'question',  label: 'שאלה' },
  { key: 'document',  label: 'בקשת מסמך' },
  { key: 'meeting',   label: 'בקשת פגישה' },
  { key: 'financial', label: 'עניין כספי' },
]

const REQUEST_STATUS = {
  pending:  { label: 'ממתינה',  bg: 'bg-amber-100',  text: 'text-amber-700'  },
  read:     { label: 'נקראה',   bg: 'bg-blue-100',   text: 'text-blue-700'   },
  resolved: { label: 'טופלה ✓', bg: 'bg-green-100',  text: 'text-green-700'  },
}

const DOC_CATEGORY = {
  'רפואי': '🏥', 'ביטוחי': '📋', 'משפטי': '⚖️', 'דוח': '📊', 'אחר': '📄'
}

// ── sub-components ─────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-none gap-0.5">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
            ${active === t.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          {t.icon && <span>{t.icon}</span>}
          <span>{t.label}</span>
          {t.badge != null && t.badge > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-10">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  )
}

// ── Timeline tab ───────────────────────────────────────────────────────────────
function TimelineTab({ workflows, redFlags }) {
  return (
    <div className="space-y-4">

      {/* Red flags */}
      {redFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">הודעות חשובות</p>
          {redFlags.map(f => {
            const c = FLAG_COLORS[f.flag_type] || FLAG_COLORS.medical
            return (
              <div key={f.id} className={`rounded-xl border p-3 flex gap-3 ${c.bg} ${c.border}`}>
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div>
                  <p className={`font-semibold text-sm ${c.text}`}>{f.title}</p>
                  {f.description && <p className={`text-xs mt-0.5 ${c.text} opacity-80`}>{f.description}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {workflows.length === 0 ? (
        <EmptyState icon="🗓️" text="אין תהליכי טיפול פעילים כרגע" />
      ) : (
        workflows.map(wf => (
          <div key={wf.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="text-right">
                <h3 className="font-bold text-slate-800">{wf.title}</h3>
                {wf.template_name && <p className="text-xs text-slate-400 mt-0.5">{wf.template_name}</p>}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
                wf.status === 'active'    ? 'bg-blue-100 text-blue-700'  :
                wf.status === 'completed' ? 'bg-green-100 text-green-700':
                wf.status === 'paused'    ? 'bg-amber-100 text-amber-700':
                'bg-slate-100 text-slate-500'
              }`}>
                {wf.status === 'active' ? 'פעיל' : wf.status === 'completed' ? 'הושלם' :
                 wf.status === 'paused' ? 'מושהה' : wf.status}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{wf.progress}%</span>
                <span>התקדמות</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all"
                     style={{ width: `${wf.progress}%` }} />
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-2.5">
              {wf.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${STEP_DOT[step.status] || 'bg-slate-200'}`} />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${
                      step.status === 'completed' ? 'line-through text-slate-400' :
                      step.status === 'active'    ? 'font-semibold text-slate-800' :
                      step.status === 'skipped'   ? 'text-slate-300' :
                      'text-slate-500'
                    }`}>{step.name}</p>
                    {step.due_date && step.status === 'active' && (
                      <span className="text-xs text-blue-600 flex-shrink-0 font-medium">
                        {fmtDate(step.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Claims tab ─────────────────────────────────────────────────────────────────
function ClaimsTab({ claims }) {
  if (claims.length === 0) return <EmptyState icon="📋" text="אין תביעות עדיין" />

  return (
    <div className="space-y-2">
      {claims.map(c => {
        const st = CLAIM_STATUS[c.status] || { label: c.status, bg: 'bg-slate-100', text: 'text-slate-600' }
        return (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-right">
                <p className="font-semibold text-sm text-slate-800 truncate">{c.source_label}</p>
                {c.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>}
                {c.created_at && <p className="text-xs text-slate-400 mt-1">{fmtDate(c.created_at)}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${st.bg} ${st.text}`}>
                  {st.label}
                </span>
                {c.amount && (
                  <span className="text-xs font-bold text-slate-700">{fmt(c.amount)}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Documents tab ──────────────────────────────────────────────────────────────
function DocumentsTab({ documents, patientId }) {
  const token = localStorage.getItem('token')

  if (documents.length === 0) return <EmptyState icon="📁" text="אין מסמכים עדיין" />

  return (
    <div className="space-y-2">
      {documents.map(doc => {
        const icon = DOC_CATEGORY[doc.category] || '📄'
        return (
          <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border border-slate-200">
              {icon}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="font-medium text-sm text-slate-800 truncate">{doc.original_name}</p>
              <div className="flex items-center gap-2 mt-0.5 justify-end">
                {doc.category && <span className="text-xs text-slate-400">{doc.category}</span>}
                {doc.created_at && <span className="text-xs text-slate-400">{fmtDate(doc.created_at)}</span>}
              </div>
            </div>
            <a
              href={`/api/patients/${patientId}/documents/${doc.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              הורד
            </a>
          </div>
        )
      })}
    </div>
  )
}

// ── Financial tab ──────────────────────────────────────────────────────────────
function FinancialTab({ financial }) {
  const { total_cost, total_covered, ext_funding, gap, cov_pct } = financial
  const hasCost = total_cost > 0

  const cards = [
    { label: 'עלות כוללת מוערכת', value: fmt(total_cost),    bg: 'bg-slate-50',   border: 'border-slate-200', val_color: 'text-slate-800' },
    { label: 'כיסוי ביטוחי',      value: fmt(total_covered),  bg: 'bg-green-50',   border: 'border-green-200', val_color: 'text-green-700', sub: hasCost ? `${cov_pct}% מהעלות` : null },
    { label: 'מימון נוסף',         value: fmt(ext_funding),    bg: 'bg-blue-50',    border: 'border-blue-200',  val_color: 'text-blue-700'  },
    { label: 'חלק שלך',            value: fmt(gap),            bg: gap > 0 ? 'bg-red-50' : 'bg-green-50', border: gap > 0 ? 'border-red-200' : 'border-green-200', val_color: gap > 0 ? 'text-red-700' : 'text-green-700' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div key={i} className={`rounded-2xl border p-4 ${c.bg} ${c.border}`}>
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.val_color}`}>{c.value}</p>
            {c.sub && <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {hasCost && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2 text-right">התפלגות מימון</p>
          <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
            {cov_pct > 0 && <div className="bg-green-400" style={{ width: `${Math.min(100, cov_pct)}%` }} />}
            {ext_funding > 0 && total_cost > 0 && (
              <div className="bg-blue-400" style={{ width: `${Math.min(100 - cov_pct, ext_funding / total_cost * 100)}%` }} />
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-500 justify-end mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />כיסוי ביטוחי</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />מימון נוסף</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" />חלק שלך</span>
          </div>
        </div>
      )}

      {!hasCost && (
        <div className="text-center py-6 text-slate-400 text-sm">
          המפה הפיננסית תעודכן על ידי מנהל האירוע שלך
        </div>
      )}
    </div>
  )
}

// ── Requests tab ───────────────────────────────────────────────────────────────
function RequestsTab({ patientId }) {
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [sending, setSending]     = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [category, setCategory]   = useState('general')
  const [message, setMessage]     = useState('')
  const [sentOk, setSentOk]       = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/patient/requests')
      setRequests(r.data)
    } catch (_) {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      await axios.post('/api/patient/requests', { category, message: message.trim() })
      setMessage('')
      setShowForm(false)
      setSentOk(true)
      setTimeout(() => setSentOk(false), 3000)
      load()
    } catch (_) {}
    setSending(false)
  }

  if (loading) return <div className="py-10 text-center text-slate-400 text-sm">טוען...</div>

  return (
    <div className="space-y-4">

      {/* Success toast */}
      {sentOk && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl p-3 text-right">
          ✅ הפנייה נשלחה למנהל האירוע שלך
        </div>
      )}

      {/* Send button / form */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m8-8H4" />
          </svg>
          שלח פנייה חדשה
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="font-semibold text-slate-800 text-right">פנייה חדשה</p>

          {/* Category */}
          <div>
            <label className="block text-xs text-slate-500 mb-1 text-right">נושא</label>
            <div className="flex flex-wrap gap-2 justify-end">
              {REQUEST_CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    category === c.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs text-slate-500 mb-1 text-right">הודעה</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-right resize-none focus:outline-none focus:border-blue-400"
              rows={4}
              placeholder="כתוב את הפנייה שלך כאן..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setMessage('') }}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              ביטול
            </button>
            <button onClick={submit} disabled={sending || !message.trim()}
              className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-40 transition-colors">
              {sending ? 'שולח...' : 'שלח'}
            </button>
          </div>
        </div>
      )}

      {/* Request list */}
      {requests.length === 0 && !showForm ? (
        <EmptyState icon="💬" text="לא שלחת פניות עדיין" />
      ) : (
        <div className="space-y-2">
          {requests.map(r => {
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-400">{fmtDate(r.created_at)}</span>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {r.category_label}
                  </span>
                </div>
                <p className="text-sm text-slate-700 text-right leading-relaxed">{r.message}</p>
                {r.manager_note && (
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1 text-right">תגובת המנהל</p>
                    <p className="text-sm text-blue-800 text-right">{r.manager_note}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PatientSummary() {
  const { t } = useTranslation()
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]     = useState('timeline')

  useEffect(() => {
    axios.get('/api/patient/summary')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">טוען...</p>
      </div>
    </div>
  )

  if (!data?.patient) return (
    <div className="text-center py-20 space-y-2">
      <div className="text-5xl">🏥</div>
      <p className="text-slate-600 font-medium">{t('patient_portal:no_file')}</p>
      <p className="text-slate-400 text-sm">{t('patient_portal:no_file_hint')}</p>
    </div>
  )

  const { patient, manager, claims, documents, workflows, financial, red_flags } = data

  const pendingRequests = 0  // could add badge from API later

  const tabs = [
    { key: 'timeline',  label: 'ציר זמן',   icon: '🗓️',  badge: null },
    { key: 'claims',    label: 'תביעות',    icon: '📋',  badge: claims.length || null },
    { key: 'documents', label: 'מסמכים',    icon: '📁',  badge: documents.length || null },
    { key: 'financial', label: 'מצב כספי',  icon: '💰',  badge: null },
    { key: 'requests',  label: 'פניות',     icon: '💬',  badge: null },
  ]

  return (
    <div className="space-y-4">

      {/* Patient header */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-500 text-white rounded-2xl p-5 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <p className="text-blue-200 text-xs font-medium mb-0.5">מסע מטופל</p>
            <h1 className="text-2xl font-bold">{patient.full_name}</h1>
            {patient.diagnosis_details && (
              <p className="text-blue-100 text-sm mt-1 font-medium">{patient.diagnosis_details}</p>
            )}
            {patient.hmo_name && (
              <p className="text-blue-200 text-xs mt-1">
                קופ"ח {patient.hmo_name}{patient.hmo_level ? ` — ${patient.hmo_level}` : ''}
              </p>
            )}
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

        {/* Manager chip */}
        {manager?.name && (
          <div className="mt-3 flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 w-fit mr-auto">
            <svg className="w-4 h-4 text-blue-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-xs text-blue-100">מנהל האירוע: <span className="font-semibold text-white">{manager.name}</span></span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Tab content */}
      <div className="pb-6">
        {tab === 'timeline'  && <TimelineTab  workflows={workflows} redFlags={red_flags} />}
        {tab === 'claims'    && <ClaimsTab    claims={claims} />}
        {tab === 'documents' && <DocumentsTab documents={documents} patientId={patient.id} />}
        {tab === 'financial' && <FinancialTab financial={financial} />}
        {tab === 'requests'  && <RequestsTab  patientId={patient.id} />}
      </div>
    </div>
  )
}
