import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import DocViewerModal, { canView } from '../../components/DocViewerModal'
import { useSimple } from '../../context/SimpleContext'

// ── helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => n != null ? `₪${Math.round(n).toLocaleString('he-IL')}` : '—'
const fmtDate = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// שפה פשוטה — תרגומים
const CLAIM_STATUS = {
  pending:   { label: 'ממתינה לטיפול',   bg: 'bg-slate-100',  text: 'text-slate-700' },
  submitted: { label: 'הוגשה ✓',          bg: 'bg-blue-100',   text: 'text-blue-700'  },
  approved:  { label: 'אושרה ✓',          bg: 'bg-green-100',  text: 'text-green-700' },
  partial:   { label: 'אושרה חלקית',     bg: 'bg-yellow-100', text: 'text-yellow-700'},
  rejected:  { label: 'נדחתה',            bg: 'bg-red-100',    text: 'text-red-700'   },
}

const STEP_DOT = {
  completed: 'bg-green-500',
  active:    'bg-blue-500 ring-4 ring-blue-100',
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
  { key: 'question',  label: 'שאלה רפואית' },
  { key: 'document',  label: 'בקשת מסמך' },
  { key: 'meeting',   label: 'בקשת פגישה' },
  { key: 'financial', label: 'עניין כספי' },
]

const REQUEST_STATUS = {
  pending:  { label: 'ממתינה לטיפול', bg: 'bg-amber-100',  text: 'text-amber-800'  },
  read:     { label: 'נקראה',          bg: 'bg-blue-100',   text: 'text-blue-800'   },
  resolved: { label: 'טופלה ✓',       bg: 'bg-green-100',  text: 'text-green-800'  },
}

const DOC_CATEGORY = {
  'רפואי': '🏥', 'ביטוחי': '📋', 'משפטי': '⚖️', 'דוח': '📊', 'אחר': '📄'
}

// ── Section header with back button ──────────────────────────────────────────
function SectionHeader({ title, subtitle, onBack }) {
  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4 text-base font-medium py-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        חזרה לדף הבית
      </button>
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-slate-600 mt-1">{subtitle}</p>}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ icon, text, sub }) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-slate-700 font-medium text-lg">{text}</p>
      {sub && <p className="text-slate-500 mt-2">{sub}</p>}
    </div>
  )
}

// ── Timeline section ──────────────────────────────────────────────────────────
function TimelineSection({ workflows, redFlags, onBack }) {
  return (
    <div>
      <SectionHeader
        title="הטיפול שלי"
        subtitle="מסע הטיפול הרפואי שלך שלב אחרי שלב"
        onBack={onBack}
      />

      {redFlags.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="font-semibold text-slate-700">הודעות חשובות</p>
          {redFlags.map(f => {
            const c = FLAG_COLORS[f.flag_type] || FLAG_COLORS.medical
            return (
              <div key={f.id} className={`rounded-2xl border p-4 flex gap-3 ${c.bg} ${c.border}`}>
                <span className="text-2xl flex-shrink-0">{c.icon}</span>
                <div>
                  <p className={`font-bold ${c.text}`}>{f.title}</p>
                  {f.description && <p className={`mt-1 leading-relaxed ${c.text} opacity-80`}>{f.description}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {workflows.length === 0 ? (
        <EmptyState icon="🗓️" text="אין תהליכי טיפול פעילים כרגע" sub="מנהל האירוע שלך יעדכן בקרוב" />
      ) : (
        <div className="space-y-4">
          {workflows.map(wf => (
            <div key={wf.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="text-right">
                  <h3 className="font-bold text-slate-800 text-lg">{wf.title}</h3>
                  {wf.template_name && <p className="text-slate-500 mt-0.5">{wf.template_name}</p>}
                </div>
                <span className={`text-sm px-3 py-1 rounded-full font-semibold flex-shrink-0 ${
                  wf.status === 'active'    ? 'bg-blue-100 text-blue-700'  :
                  wf.status === 'completed' ? 'bg-green-100 text-green-700':
                  wf.status === 'paused'    ? 'bg-amber-100 text-amber-700':
                  'bg-slate-100 text-slate-600'
                }`}>
                  {wf.status === 'active' ? 'פעיל' : wf.status === 'completed' ? 'הושלם' :
                   wf.status === 'paused' ? 'מושהה' : wf.status}
                </span>
              </div>

              <div className="mb-5">
                <div className="flex justify-between text-slate-500 mb-2">
                  <span>{wf.progress}% הושלם</span>
                  <span>התקדמות</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all"
                       style={{ width: `${wf.progress}%` }} />
                </div>
              </div>

              <div className="space-y-3">
                {wf.steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-4">
                    <div className={`w-4 h-4 rounded-full mt-1 flex-shrink-0 ${STEP_DOT[step.status] || 'bg-slate-200'}`} />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <p className={`leading-relaxed ${
                        step.status === 'completed' ? 'line-through text-slate-400' :
                        step.status === 'active'    ? 'font-bold text-slate-800' :
                        step.status === 'skipped'   ? 'text-slate-400' :
                        'text-slate-600'
                      }`}>{step.name}</p>
                      {step.due_date && step.status === 'active' && (
                        <span className="text-blue-600 flex-shrink-0 font-semibold whitespace-nowrap">
                          עד {fmtDate(step.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Claims section ────────────────────────────────────────────────────────────
function ClaimsSection({ claims, onBack }) {
  return (
    <div>
      <SectionHeader
        title="בקשות לתשלום מהביטוח"
        subtitle="כאן תוכל לראות את כל הבקשות שהוגשו לחברות הביטוח"
        onBack={onBack}
      />
      {claims.length === 0 ? (
        <EmptyState icon="📋" text="אין בקשות לתשלום עדיין" sub="מנהל האירוע שלך יטפל בכך" />
      ) : (
        <div className="space-y-3">
          {claims.map(c => {
            const st = CLAIM_STATUS[c.status] || { label: c.status, bg: 'bg-slate-100', text: 'text-slate-700' }
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-right">
                    <p className="font-bold text-slate-800">{c.source_label}</p>
                    {c.description && <p className="text-slate-600 mt-1 leading-relaxed">{c.description}</p>}
                    {c.created_at && <p className="text-slate-500 mt-2">{fmtDate(c.created_at)}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`px-3 py-1 rounded-full font-semibold ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                    {c.amount && (
                      <span className="font-bold text-slate-800 text-lg">{fmt(c.amount)}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Documents section ─────────────────────────────────────────────────────────
function DocumentsSection({ documents, patientId, onBack }) {
  const [viewingDoc, setViewingDoc] = useState(null)

  return (
    <div>
      <SectionHeader
        title="המסמכים שלי"
        subtitle="כל המסמכים הרפואיים והביטוחיים שלך במקום אחד"
        onBack={onBack}
      />
      {viewingDoc && (
        <DocViewerModal
          viewUrl={`/api/patients/${patientId}/documents/${viewingDoc.id}/download`}
          dlUrl={`/api/patients/${patientId}/documents/${viewingDoc.id}/download`}
          fileName={viewingDoc.original_name}
          fileType={viewingDoc.file_type}
          onClose={() => setViewingDoc(null)}
        />
      )}
      {documents.length === 0 ? (
        <EmptyState icon="📁" text="אין מסמכים עדיין" sub="מנהל האירוע שלך יעלה מסמכים כשיהיו" />
      ) : (
        <div className="space-y-3">
          {documents.map(doc => {
            const icon = DOC_CATEGORY[doc.category] || '📄'
            return (
              <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 border border-slate-200">
                  {icon}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="font-bold text-slate-800 truncate">{doc.original_name}</p>
                  <div className="flex items-center gap-3 mt-1 justify-end">
                    {doc.category && <span className="text-slate-500">{doc.category}</span>}
                    {doc.created_at && <span className="text-slate-500">{fmtDate(doc.created_at)}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {canView(doc.file_type) && (
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      צפייה
                    </button>
                  )}
                  <button
                    onClick={() => axios.get(`/api/patients/${patientId}/documents/${doc.id}/download`, { responseType: 'blob' })
                      .then(r => {
                        const url = URL.createObjectURL(r.data)
                        const a = document.createElement('a'); a.href = url; a.download = doc.original_name; a.click()
                        URL.revokeObjectURL(url)
                      })}
                    className="flex items-center gap-1.5 font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2.5 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    הורד
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Financial section ─────────────────────────────────────────────────────────
function FinancialSection({ financial, onBack }) {
  const { total_cost, total_covered, ext_funding, gap, cov_pct } = financial
  const hasCost = total_cost > 0

  return (
    <div>
      <SectionHeader
        title="המצב הכספי שלי"
        subtitle="כמה הביטוח משלם ומה נשאר לך לשלם"
        onBack={onBack}
      />
      {!hasCost ? (
        <EmptyState icon="💰" text="המפה הכספית עוד לא מוכנה" sub="מנהל האירוע שלך יעדכן את הנתונים בקרוב" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'עלות כוללת מוערכת',           value: fmt(total_cost),   bg: 'bg-slate-50',  border: 'border-slate-200', val: 'text-slate-800',  desc: 'הסכום הכולל שעשוי לעלות הטיפול' },
              { label: 'מה הביטוח משלם',              value: fmt(total_covered), bg: 'bg-green-50',  border: 'border-green-200', val: 'text-green-700',  desc: hasCost ? `${cov_pct}% מסך העלות` : null },
              { label: 'מימון נוסף (קרנות וסיוע)',    value: fmt(ext_funding),   bg: 'bg-blue-50',   border: 'border-blue-200',  val: 'text-blue-700',   desc: 'תמיכה נוספת שנמצאה עבורך' },
              { label: 'מה שנשאר לתשלום שלך',         value: fmt(gap),           bg: gap > 0 ? 'bg-red-50' : 'bg-green-50', border: gap > 0 ? 'border-red-200' : 'border-green-200', val: gap > 0 ? 'text-red-700' : 'text-green-700', desc: gap > 0 ? 'הסכום שעליך לשלם בעצמך' : 'הכל מכוסה!' },
            ].map((c, i) => (
              <div key={i} className={`rounded-2xl border p-5 ${c.bg} ${c.border}`}>
                <p className="text-slate-600 font-medium mb-2">{c.label}</p>
                <p className={`text-3xl font-bold ${c.val}`}>{c.value}</p>
                {c.desc && <p className="text-slate-500 mt-2 leading-relaxed">{c.desc}</p>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="font-semibold text-slate-700 mb-3 text-right">התפלגות המימון</p>
            <div className="flex h-5 rounded-full overflow-hidden bg-slate-100 mb-3">
              {cov_pct > 0 && <div className="bg-green-400" style={{ width: `${Math.min(100, cov_pct)}%` }} />}
              {ext_funding > 0 && total_cost > 0 && (
                <div className="bg-blue-400" style={{ width: `${Math.min(100 - cov_pct, ext_funding / total_cost * 100)}%` }} />
              )}
            </div>
            <div className="flex gap-5 text-slate-600 justify-end">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" />הביטוח משלם</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />סיוע נוסף</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-200 inline-block" />שלך</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Requests section ──────────────────────────────────────────────────────────
const DRAFT_KEY = 'patient_request_draft'

function RequestsSection({ patientId, onBack }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState('general')
  const [message, setMessage]   = useState(() => {
    try { return sessionStorage.getItem(DRAFT_KEY) || '' } catch { return '' }
  })
  const [sentOk, setSentOk]     = useState(false)
  const draftTimer              = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/patient/requests')
      setRequests(r.data)
    } catch (_) {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      try { sessionStorage.setItem(DRAFT_KEY, message) } catch {}
    }, 500)
    return () => clearTimeout(draftTimer.current)
  }, [message])

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      await axios.post('/api/patient/requests', { category, message: message.trim() })
      sessionStorage.removeItem(DRAFT_KEY)
      setMessage('')
      setShowForm(false)
      setSentOk(true)
      setTimeout(() => setSentOk(false), 4000)
      load()
    } catch (_) {}
    setSending(false)
  }

  return (
    <div>
      <SectionHeader
        title="שאל שאלה או שלח בקשה"
        subtitle="מנהל האירוע שלך יחזור אליך בהקדם האפשרי"
        onBack={onBack}
      />

      {sentOk && (
        <div className="bg-green-50 border-2 border-green-200 text-green-800 font-medium rounded-2xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <span>הבקשה נשלחה בהצלחה! מנהל האירוע שלך יחזור אליך בקרוב.</span>
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-3 transition-colors shadow-md mb-6"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          שלח בקשה חדשה
        </button>
      ) : (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-5 shadow-md mb-6">
          <p className="font-bold text-slate-800 text-xl">בקשה חדשה</p>

          <div>
            <label className="block font-medium text-slate-700 mb-3">מה הנושא?</label>
            <div className="flex flex-wrap gap-2">
              {REQUEST_CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`px-4 py-2.5 rounded-xl border-2 font-medium transition-all ${
                    category === c.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 text-slate-700 hover:border-blue-300 bg-white'
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-2">
              מה תרצה לכתוב?
              {message && <span className="text-slate-500 font-normal mr-2">(הטיוטה נשמרת אוטומטית)</span>}
            </label>
            <textarea
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-base text-right resize-none focus:outline-none focus:border-blue-400 leading-relaxed"
              rows={5}
              placeholder="כתוב את בקשתך כאן בשפה חופשית..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowForm(false) }}
              className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={submit}
              disabled={sending || !message.trim()}
              className="flex-2 basis-2/3 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-40 transition-colors"
            >
              {sending ? 'שולח...' : 'שלח בקשה'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-500">טוען...</div>
      ) : requests.length === 0 ? (
        <EmptyState icon="💬" text="לא שלחת בקשות עדיין" />
      ) : (
        <div className="space-y-3">
          <p className="font-semibold text-slate-700">הבקשות שלי</p>
          {requests.map(r => {
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full font-semibold ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                    <span className="text-slate-500">{fmtDate(r.created_at)}</span>
                  </div>
                  <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
                    {r.category_label}
                  </span>
                </div>
                <p className="text-slate-800 text-right leading-relaxed">{r.message}</p>
                {r.manager_note && (
                  <div className="mt-4 bg-blue-50 border-2 border-blue-100 rounded-2xl p-4">
                    <p className="font-bold text-blue-700 mb-2">תגובת מנהל האירוע</p>
                    <p className="text-blue-800 leading-relaxed">{r.manager_note}</p>
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

// ── Help tooltip ──────────────────────────────────────────────────────────────
const HELP_TEXT = {
  home:      'זהו הפורטל האישי שלך. כאן תוכל לעקוב אחרי הטיפול, לראות מסמכים ולשלוח שאלות למנהל האירוע שלך.',
  timeline:  'כאן תוכל לראות את כל שלבי הטיפול הרפואי שלך — מה כבר הושלם ומה עוד מחכה.',
  claims:    'כאן מופיעות כל הבקשות לתשלום שהוגשו לחברות הביטוח שלך — ומה הסטטוס שלהן.',
  documents: 'כאן שמורים כל המסמכים הרפואיים והביטוחיים שלך. תוכל לצפות בהם ולהורידם.',
  financial: 'כאן תוכל לראות כמה הביטוח משלם מתוך הטיפול ומה נשאר לשלם בעצמך.',
  requests:  'כאן תוכל לשלוח שאלות ובקשות ישירות למנהל האירוע שלך.',
}

function HelpButton({ view }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed bottom-24 left-4 z-40 sm:bottom-6">
      {open && (
        <div className="absolute bottom-14 left-0 w-72 bg-white border-2 border-blue-200 rounded-2xl p-4 shadow-xl text-right">
          <p className="font-bold text-slate-800 mb-2">מה יש כאן?</p>
          <p className="text-slate-700 leading-relaxed">{HELP_TEXT[view] || HELP_TEXT.home}</p>
          <button onClick={() => setOpen(false)} className="mt-3 text-blue-600 font-medium">סגור</button>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl font-bold transition-colors"
        aria-label="עזרה"
      >
        ?
      </button>
    </div>
  )
}

// ── Home screen ───────────────────────────────────────────────────────────────
function HomeScreen({ patient, manager, data, onNavigate }) {
  const { claims, documents, workflows, red_flags } = data

  const sections = [
    {
      key: 'timeline',
      icon: '🗓️',
      title: 'הטיפול שלי',
      desc: 'שלבי הטיפול הרפואי שלך',
      badge: workflows.filter(w => w.status === 'active').length || null,
      badgeLabel: 'פעיל',
      color: 'from-blue-50 to-blue-100',
      border: 'border-blue-200',
      alert: red_flags.length > 0,
    },
    {
      key: 'documents',
      icon: '📁',
      title: 'המסמכים שלי',
      desc: 'כל המסמכים הרפואיים והביטוחיים',
      badge: documents.length || null,
      badgeLabel: 'מסמכים',
      color: 'from-emerald-50 to-emerald-100',
      border: 'border-emerald-200',
    },
    {
      key: 'requests',
      icon: '💬',
      title: 'שאל שאלה',
      desc: 'שלח בקשה למנהל האירוע שלך',
      badge: null,
      color: 'from-purple-50 to-purple-100',
      border: 'border-purple-200',
    },
    {
      key: 'financial',
      icon: '💰',
      title: 'המצב הכספי',
      desc: 'כמה הביטוח משלם ומה נשאר',
      badge: null,
      color: 'from-amber-50 to-amber-100',
      border: 'border-amber-200',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-500 text-white rounded-3xl p-6 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <p className="text-blue-200 mb-1">שלום,</p>
            <h1 className="text-3xl font-bold">{patient.full_name}</h1>
            {patient.diagnosis_details && (
              <p className="text-blue-100 mt-2 leading-relaxed">{patient.diagnosis_details}</p>
            )}
            {patient.hmo_name && (
              <p className="text-blue-200 mt-1">
                קופת חולים {patient.hmo_name}{patient.hmo_level ? ` — ${patient.hmo_level}` : ''}
              </p>
            )}
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-4xl">
            👤
          </div>
        </div>

        {manager?.name && (
          <div className="mt-4 bg-white/15 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-blue-200">מנהל האירוע שלך</p>
              <p className="font-bold text-white text-lg">{manager.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Red flags alert */}
      {red_flags.length > 0 && (
        <button
          onClick={() => onNavigate('timeline')}
          className="w-full bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-right flex items-center gap-4 hover:bg-red-100 transition-colors"
        >
          <span className="text-3xl">🔴</span>
          <div>
            <p className="font-bold text-red-800">יש {red_flags.length} הודעות חשובות</p>
            <p className="text-red-600">לחץ לצפייה בהודעות</p>
          </div>
          <svg className="w-5 h-5 text-red-500 mr-auto flex-shrink-0 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Navigation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => onNavigate(s.key)}
            className={`bg-gradient-to-br ${s.color} border-2 ${s.border} rounded-3xl p-6 text-right hover:shadow-md active:scale-95 transition-all`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-5xl">{s.icon}</span>
              {s.badge != null && (
                <span className="bg-white/80 text-slate-700 font-bold px-3 py-1 rounded-full text-sm">
                  {s.badge} {s.badgeLabel}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">{s.title}</h2>
            <p className="text-slate-600 leading-relaxed">{s.desc}</p>
          </button>
        ))}
      </div>

      {/* Claims quick view */}
      {claims.length > 0 && (
        <button
          onClick={() => onNavigate('claims')}
          className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 text-right flex items-center gap-4 hover:border-blue-300 transition-colors"
        >
          <span className="text-3xl">📋</span>
          <div className="flex-1">
            <p className="font-bold text-slate-800">בקשות לתשלום מהביטוח</p>
            <p className="text-slate-600">{claims.length} בקשות</p>
          </div>
          <svg className="w-5 h-5 text-slate-400 flex-shrink-0 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Bottom navigation (mobile) ────────────────────────────────────────────────
function BottomNav({ view, onNavigate }) {
  const items = [
    { key: 'home',      icon: '🏠', label: 'בית'      },
    { key: 'timeline',  icon: '🗓️', label: 'טיפול'    },
    { key: 'documents', icon: '📁', label: 'מסמכים'   },
    { key: 'requests',  icon: '💬', label: 'שאל'       },
    { key: 'financial', icon: '💰', label: 'כספי'      },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-200 flex sm:hidden z-30 shadow-lg">
      {items.map(item => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
            view === item.key ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <span className="text-2xl">{item.icon}</span>
          <span className="text-xs font-medium">{item.label}</span>
          {view === item.key && (
            <span className="absolute top-0 w-8 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
      ))}
    </nav>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PatientSummary() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView]     = useState('home')

  useEffect(() => {
    axios.get('/api/patient/summary')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const goBack = () => setView('home')

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600 text-lg">טוען...</p>
      </div>
    </div>
  )

  if (!data?.patient) return (
    <div className="text-center py-24 space-y-4">
      <div className="text-6xl">🏥</div>
      <p className="text-slate-700 font-bold text-xl">אין תיק מטופל מקושר</p>
      <p className="text-slate-500">פנה למנהל האירוע שלך לקישור התיק</p>
    </div>
  )

  const { patient, manager, claims, documents, workflows, financial, red_flags } = data

  return (
    <div className="pb-24 sm:pb-6 text-base leading-relaxed" dir="rtl">
      <HelpButton view={view} />
      <BottomNav view={view} onNavigate={setView} />

      {view === 'home'      && <HomeScreen patient={patient} manager={manager} data={data} onNavigate={setView} />}
      {view === 'timeline'  && <TimelineSection  workflows={workflows} redFlags={red_flags} onBack={goBack} />}
      {view === 'claims'    && <ClaimsSection    claims={claims}       onBack={goBack} />}
      {view === 'documents' && <DocumentsSection documents={documents} patientId={patient.id} onBack={goBack} />}
      {view === 'financial' && <FinancialSection financial={financial} onBack={goBack} />}
      {view === 'requests'  && <RequestsSection  patientId={patient.id} onBack={goBack} />}
    </div>
  )
}
