import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import AppToast from '../../components/AppToast'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../context/AuthContext'
import { fmtDate } from '../../utils/formatters'
import { SkeletonCard } from '../../components/Skeleton'

const isOverdue = (due) => due && new Date(due) < new Date()
const isToday   = (due) => {
  if (!due) return false
  const d = new Date(due), now = new Date()
  return d.toDateString() === now.toDateString()
}
const isThisWeek = (due) => {
  if (!due) return false
  const d = new Date(due), now = new Date()
  const week = new Date(now); week.setDate(now.getDate() + 7)
  return d > now && d <= week
}

const SOURCE_LABELS = {
  manual:          { label: 'ידנית',    bg: 'bg-slate-100',  text: 'text-slate-700' },
  meeting_action:  { label: 'פגישה',    bg: 'bg-blue-100',   text: 'text-blue-700'  },
  workflow_step:   { label: 'זרימה',    bg: 'bg-violet-100', text: 'text-violet-700'},
  patient_request: { label: 'פנייה',    bg: 'bg-amber-100',  text: 'text-amber-700' },
  red_flag:        { label: 'נורה🔴',  bg: 'bg-red-100',    text: 'text-red-700'   },
}

const PRIORITY_LABELS = {
  urgent: { label: 'דחוף',   color: 'text-red-600'    },
  high:   { label: 'גבוה',   color: 'text-orange-500' },
  normal: { label: 'רגיל',   color: 'text-slate-500'  },
  low:    { label: 'נמוך',   color: 'text-slate-400'  },
}

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 }

// ── Filter config — extensible array ─────────────────────────────────────────
const FILTER_DEFS = [
  {
    key: 'source_type', label: 'סוג',
    options: [
      { value: '', label: 'הכל' },
      { value: 'manual',          label: 'ידנית' },
      { value: 'meeting_action',  label: 'פגישה' },
      { value: 'workflow_step',   label: 'זרימה' },
      { value: 'patient_request', label: 'פנייה ממטופל' },
      { value: 'red_flag',        label: 'נורה אדומה' },
    ],
  },
  {
    key: 'priority', label: 'עדיפות',
    options: [
      { value: '', label: 'הכל' },
      { value: 'urgent', label: 'דחוף' },
      { value: 'high',   label: 'גבוה' },
      { value: 'normal', label: 'רגיל' },
      { value: 'low',    label: 'נמוך' },
    ],
  },
  {
    key: 'status', label: 'סטטוס',
    options: [
      { value: 'open', label: 'פתוחות' },
      { value: '',     label: 'הכל' },
      { value: 'done', label: 'הושלמו' },
    ],
  },
]

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({ task, onComplete, onDelete, completing }) {
  const src = SOURCE_LABELS[task.source_type] || SOURCE_LABELS.manual
  const pri = PRIORITY_LABELS[task.priority]  || PRIORITY_LABELS.normal
  const overdue = isOverdue(task.due_date) && task.status !== 'done'

  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-start gap-3 transition-all ${
      task.status === 'done' ? 'opacity-50' : overdue ? 'border-red-200' : 'border-slate-200'
    }`}>
      {/* Complete button */}
      <button
        onClick={() => onComplete(task.id)}
        disabled={completing === task.id || task.status === 'done'}
        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          task.status === 'done'
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-slate-300 hover:border-green-500 hover:bg-green-50'
        }`}
        title={task.status === 'done' ? 'הושלמה' : 'סמן כהושלמה'}
      >
        {(task.status === 'done' || completing === task.id) && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-slate-800 leading-snug ${task.status === 'done' ? 'line-through' : ''}`}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {task.patient_name && (
            <Link
              to={`/manager/patients/${task.patient_id}`}
              className="text-xs text-blue-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              {task.patient_name}
            </Link>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src.bg} ${src.text}`}>
            {src.label}
          </span>
          {task.due_date && (
            <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
              {overdue ? '⚠️ ' : ''}{fmtDate(task.due_date)}
            </span>
          )}
          <span className={`text-xs font-medium ${pri.color}`}>{pri.label}</span>
          {task.is_new && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
              חדש מאדמין
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
        )}
      </div>

      {/* Delete (manual only) */}
      {task.source_type === 'manual' && task.status !== 'done' && (
        <button
          onClick={() => onDelete(task.id)}
          className="text-slate-400 hover:text-red-500 p-1 -m-1 rounded transition-colors flex-shrink-0"
          title="מחק משימה"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ title, color, tasks, onComplete, onDelete, completing }) {
  if (tasks.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
        <h3 className="font-bold text-slate-700">{title}</h3>
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onComplete={onComplete} onDelete={onDelete} completing={completing} />
        ))}
      </div>
    </div>
  )
}

// ── New task modal ────────────────────────────────────────────────────────────
function NewTaskModal({ patients, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', patient_id: '', due_date: '', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const { toast, showToast, dismissToast } = useToast()

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        patient_id: form.patient_id ? +form.patient_id : null,
        due_date: form.due_date || null,
        priority: form.priority,
      }
      await axios.post('/api/tasks', payload)
      onCreated()
      onClose()
    } catch {
      showToast('לא ניתן לשמור את המשימה. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800 text-lg">משימה חדשה</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-2 -m-2 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">כותרת *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="מה צריך לעשות?" autoFocus />
          </div>
          <div>
            <label className="label">פירוט</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">מטופל</label>
              <select className="input" value={form.patient_id} onChange={e => setForm(f => ({...f, patient_id: e.target.value}))}>
                <option value="">— כללי —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">עדיפות</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                <option value="urgent">דחוף</option>
                <option value="high">גבוה</option>
                <option value="normal">רגיל</option>
                <option value="low">נמוך</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">תאריך יעד</label>
            <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary disabled:opacity-40">
            {saving ? 'שומר...' : 'צור משימה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Calendar subscribe modal ──────────────────────────────────────────────────
function CalendarModal({ onClose }) {
  const [token, setToken] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    axios.get('/api/tasks/calendar-token').then(r => setToken(r.data.token)).catch(() => {})
  }, [])

  const url = token ? `${window.location.origin}/api/calendar/${token}.ics` : ''

  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-lg">הירשם ליומן חי</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-2 -m-2 rounded-lg">✕</button>
        </div>
        <p className="text-slate-600 mb-4">הוסף את הכתובת הזו ליומן שלך — המשימות, הפגישות והדדליינים יתעדכנו אוטומטית.</p>

        {token ? (
          <>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
              <span className="text-xs text-slate-600 flex-1 truncate font-mono">{url}</span>
              <button onClick={copy} className={`shrink-0 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${copied ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                {copied ? '✓ הועתק!' : 'העתק'}
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">הוראות חיבור:</p>
              <p>📅 <strong>Google Calendar:</strong> הגדרות ← לוחות שנה אחרים ← הוסף לפי URL</p>
              <p>🍎 <strong>Apple Calendar:</strong> קובץ ← הרשמה ליומן</p>
              <p>📧 <strong>Outlook:</strong> הוסף לוח שנה ← ממינוי ← הדבק את הכתובת</p>
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-slate-500">טוען...</div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyDay() {
  const { user } = useAuth()
  const { toast, showToast, dismissToast } = useToast()

  const [tasks, setTasks]           = useState([])
  const [patients, setPatients]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [completing, setCompleting] = useState(null)
  const [showNew, setShowNew]       = useState(false)
  const [showCal, setShowCal]       = useState(false)

  // Filters — extensible
  const [filters, setFilters] = useState({ source_type: '', priority: '', status: 'open', patient_id: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // sync first (POST — writes), then fetch (GET — read-only)
      await axios.post('/api/tasks/sync').catch(() => {})
      const [tasksRes, patientsRes] = await Promise.all([
        axios.get('/api/tasks/my'),
        axios.get('/api/patients'),
      ])
      setTasks(tasksRes.data?.items ?? tasksRes.data)
      setPatients(patientsRes.data)
    } catch {
      showToast('שגיאה בטעינת המשימות')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const complete = async (id) => {
    setCompleting(id)
    try {
      const res = await axios.post(`/api/tasks/${id}/complete`)
      setTasks(prev => prev.map(t => t.id === id ? res.data : t))
    } catch {
      showToast('לא ניתן לסמן כהושלמה. נסה שוב.')
    } finally {
      setCompleting(null)
    }
  }

  const deleteTask = async (id) => {
    if (!confirm('למחוק משימה זו?')) return
    try {
      await axios.delete(`/api/tasks/${id}`)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch {
      showToast('לא ניתן למחוק. נסה שוב.')
    }
  }

  // Apply filters
  const filtered = tasks.filter(t => {
    if (filters.source_type && t.source_type !== filters.source_type) return false
    if (filters.priority    && t.priority    !== filters.priority)    return false
    if (filters.patient_id  && t.patient_id  !== +filters.patient_id) return false
    if (filters.status === 'open' && t.status === 'done') return false
    if (filters.status === 'done' && t.status !== 'done') return false
    return true
  }).sort((a, b) => {
    // sort: overdue first, then by priority, then by due_date
    const aOver = isOverdue(a.due_date) ? 0 : 1
    const bOver = isOverdue(b.due_date) ? 0 : 1
    if (aOver !== bOver) return aOver - bOver
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    if (pDiff !== 0) return pDiff
    if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return  1
    return 0
  })

  // Buckets
  const overdue  = filtered.filter(t => t.status !== 'done' && isOverdue(t.due_date))
  const today    = filtered.filter(t => t.status !== 'done' && !isOverdue(t.due_date) && isToday(t.due_date))
  const thisWeek = filtered.filter(t => t.status !== 'done' && isThisWeek(t.due_date))
  const later    = filtered.filter(t => t.status !== 'done' && !isOverdue(t.due_date) && !isToday(t.due_date) && !isThisWeek(t.due_date))
  const done     = filtered.filter(t => t.status === 'done')

  const newCount = tasks.filter(t => t.is_new).length

  return (
    <div className="p-4 md:p-6 max-w-3xl" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
      {showNew && <NewTaskModal patients={patients} onClose={() => setShowNew(false)} onCreated={load} />}
      {showCal && <CalendarModal onClose={() => setShowCal(false)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">היום שלי</h1>
          {newCount > 0 && (
            <p className="text-sm text-purple-700 mt-0.5 font-medium">
              {newCount} משימות חדשות מהאדמין
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
          >
            📅 הירשם ליומן
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors"
          >
            + משימה חדשה
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* Patient filter */}
        <select
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
          value={filters.patient_id}
          onChange={e => setFilters(f => ({...f, patient_id: e.target.value}))}
        >
          <option value="">כל המטופלים</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>

        {/* Dynamic filters from config */}
        {FILTER_DEFS.map(def => (
          <select
            key={def.key}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
            value={filters[def.key]}
            onChange={e => setFilters(f => ({...f, [def.key]: e.target.value}))}
          >
            {def.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3 p-4">
          {[1,2,3,4].map(i => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-slate-700 font-semibold text-lg">אין משימות פתוחות</p>
          <p className="text-slate-500 mt-1">כל הכבוד — הכל מטופל!</p>
        </div>
      ) : (
        <div className="space-y-7">
          <Section title="באיחור"       color="bg-red-500"    tasks={overdue}  onComplete={complete} onDelete={deleteTask} completing={completing} />
          <Section title="היום"         color="bg-amber-400"  tasks={today}    onComplete={complete} onDelete={deleteTask} completing={completing} />
          <Section title="השבוע"        color="bg-blue-500"   tasks={thisWeek} onComplete={complete} onDelete={deleteTask} completing={completing} />
          <Section title="בהמשך"        color="bg-slate-300"  tasks={later}    onComplete={complete} onDelete={deleteTask} completing={completing} />
          <Section title="הושלמו"       color="bg-green-500"  tasks={done}     onComplete={complete} onDelete={deleteTask} completing={completing} />
        </div>
      )}
    </div>
  )
}
