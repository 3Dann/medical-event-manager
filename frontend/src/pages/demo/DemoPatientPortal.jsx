import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const fmt = n => n != null ? `₪${Math.round(n).toLocaleString('he-IL')}` : '—'
const fmtDate = iso => new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })

const D = {
  patient: { full_name: 'שרה כהן', diagnosis_details: 'סרטן שד שלב II — טיפול פעיל', hmo_name: 'מכבי', hmo_level: 'זהב' },
  manager: { name: 'יעל לוי' },
  red_flags: [
    { id: 1, flag_type: 'financial', title: 'חריגה מתקציב חודשי', description: 'הוצאות התרופות עלו על הכיסוי הביטוחי החודשי.' }
  ],
  workflows: [{
    id: 1, title: 'מסע טיפול סרטן שד', template_name: 'Breast Cancer Journey',
    status: 'active', progress: 45,
    steps: [
      { name: 'אבחון וביופסיה', status: 'completed', due_date: null },
      { name: 'ועדת ביולוגיה מולקולרית', status: 'completed', due_date: null },
      { name: 'כימותרפיה — מחזורים 1–4', status: 'active', due_date: '2026-06-15' },
      { name: 'כימותרפיה — מחזורים 5–8', status: 'pending', due_date: null },
      { name: 'ניתוח', status: 'pending', due_date: null },
      { name: 'הקרנות', status: 'pending', due_date: null },
      { name: 'מעקב אונקולוגי', status: 'pending', due_date: null },
    ]
  }],
  claims: [
    { id: 1, source_label: 'מכבי זהב — כימותרפיה', status: 'approved',  amount: 18500, description: 'טיפול כימותרפי מחזורים 1–2', created_at: '2026-04-10' },
    { id: 2, source_label: 'ביטוח מנורה — אשפוז',  status: 'submitted', amount: 6200,  description: 'אשפוז 3 ימים מחלקת אונקולוגיה', created_at: '2026-05-01' },
    { id: 3, source_label: 'מכבי — תרופות ביולוגיות', status: 'pending', amount: 12000, description: 'תרופות ביולוגיות חודש מאי', created_at: '2026-05-08' },
  ],
  documents: [
    { id: 1, original_name: 'תוצאות ביופסיה.pdf',       file_type: 'application/pdf', category: 'רפואי',   created_at: '2026-03-15' },
    { id: 2, original_name: 'פוליסת ביטוח מנורה.pdf',   file_type: 'application/pdf', category: 'ביטוחי',  created_at: '2026-03-20' },
    { id: 3, original_name: 'צילום MRI שד.jpg',          file_type: 'image/jpeg',       category: 'רפואי',   created_at: '2026-04-05' },
    { id: 4, original_name: 'פרוטוקול טיפול.pdf',       file_type: 'application/pdf', category: 'רפואי',   created_at: '2026-04-20' },
  ],
  financial: { total_cost: 85000, total_covered: 62000, ext_funding: 8000, gap: 15000, cov_pct: 73 },
}

const CLAIM_STATUS = {
  pending:   { label: 'ממתינה לטיפול', bg: 'bg-amber-100',  text: 'text-amber-800'  },
  submitted: { label: 'הוגשה ✓',        bg: 'bg-blue-100',   text: 'text-blue-800'   },
  approved:  { label: 'אושרה ✓',        bg: 'bg-green-100',  text: 'text-green-800'  },
  rejected:  { label: 'נדחתה',          bg: 'bg-red-100',    text: 'text-red-800'    },
}
const STEP_DOT = {
  completed: 'bg-green-500',
  active:    'bg-blue-500 ring-4 ring-blue-100',
  pending:   'bg-slate-200',
}
const DOC_ICON = { 'רפואי': '🏥', 'ביטוחי': '📋', 'אחר': '📄' }

function DemoBanner({ onBack }) {
  return (
    <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
      <button onClick={onBack}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
        ← חזור למנהל
      </button>
      <span className="font-semibold">🎬 מצב הצגה — פורטל מטופל</span>
      <span className="text-purple-200 text-sm mr-auto hidden sm:inline">נתוני דמו בלבד</span>
    </div>
  )
}

function SectionHeader({ title, subtitle, onBack }) {
  return (
    <div className="mb-6">
      <button onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-base font-medium py-1 mb-4">
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

function HomeView({ onNavigate }) {
  const { patient, manager, red_flags, claims, documents } = D
  const sections = [
    { key: 'timeline',  icon: '🗓️', title: 'הטיפול שלי',    desc: 'שלבי הטיפול הרפואי שלך',       color: 'from-blue-50 to-blue-100',     border: 'border-blue-200'   },
    { key: 'documents', icon: '📁', title: 'המסמכים שלי',    desc: `${documents.length} מסמכים שמורים`,  color: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200' },
    { key: 'requests',  icon: '💬', title: 'שאל שאלה',       desc: 'שלח בקשה למנהל האירוע שלך',    color: 'from-purple-50 to-purple-100', border: 'border-purple-200' },
    { key: 'financial', icon: '💰', title: 'המצב הכספי',     desc: 'כמה הביטוח משלם ומה נשאר',     color: 'from-amber-50 to-amber-100',   border: 'border-amber-200'  },
  ]
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-700 to-blue-500 text-white rounded-3xl p-6 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-blue-200 mb-1">שלום,</p>
            <h1 className="text-3xl font-bold">{patient.full_name}</h1>
            <p className="text-blue-100 mt-2 leading-relaxed">{patient.diagnosis_details}</p>
            <p className="text-blue-200 mt-1">קופת חולים {patient.hmo_name} — {patient.hmo_level}</p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0">👤</div>
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

      {red_flags.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <span className="text-3xl">🟡</span>
          <div>
            <p className="font-bold text-amber-800">{red_flags[0].title}</p>
            <p className="text-amber-700 mt-0.5">{red_flags[0].description}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <button key={s.key} onClick={() => onNavigate(s.key)}
            className={`bg-gradient-to-br ${s.color} border-2 ${s.border} rounded-3xl p-6 text-right hover:shadow-md active:scale-95 transition-all`}>
            <span className="text-5xl block mb-3">{s.icon}</span>
            <h2 className="text-xl font-bold text-slate-800 mb-1">{s.title}</h2>
            <p className="text-slate-600 leading-relaxed">{s.desc}</p>
          </button>
        ))}
      </div>

      <button onClick={() => onNavigate('claims')}
        className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 text-right flex items-center gap-4 hover:border-blue-300 transition-colors">
        <span className="text-3xl">📋</span>
        <div className="flex-1">
          <p className="font-bold text-slate-800">בקשות לתשלום מהביטוח</p>
          <p className="text-slate-600">{claims.length} בקשות</p>
        </div>
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function TimelineView({ onBack }) {
  const wf = D.workflows[0]
  return (
    <div>
      <SectionHeader title="הטיפול שלי" subtitle="מסע הטיפול הרפואי שלך שלב אחרי שלב" onBack={onBack} />
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">{wf.title}</h3>
            <p className="text-slate-600 mt-0.5">{wf.template_name}</p>
          </div>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold text-sm">פעיל</span>
        </div>
        <div className="mb-5">
          <div className="flex justify-between text-slate-600 mb-2">
            <span>{wf.progress}% הושלם</span>
            <span>התקדמות</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${wf.progress}%` }} />
          </div>
        </div>
        <div className="space-y-3">
          {wf.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className={`w-4 h-4 rounded-full mt-1 flex-shrink-0 ${STEP_DOT[step.status] || 'bg-slate-200'}`} />
              <div className="flex-1 flex items-center justify-between gap-2">
                <p className={`leading-relaxed ${
                  step.status === 'completed' ? 'line-through text-slate-400' :
                  step.status === 'active'    ? 'font-bold text-slate-800' : 'text-slate-600'
                }`}>{step.name}</p>
                {step.due_date && step.status === 'active' && (
                  <span className="text-blue-600 font-semibold whitespace-nowrap text-sm">עד {fmtDate(step.due_date)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClaimsView({ onBack }) {
  return (
    <div>
      <SectionHeader title="בקשות לתשלום מהביטוח" subtitle="כל הבקשות שהוגשו לחברות הביטוח" onBack={onBack} />
      <div className="space-y-3">
        {D.claims.map(c => {
          const st = CLAIM_STATUS[c.status] || CLAIM_STATUS.pending
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800">{c.source_label}</p>
                  {c.description && <p className="text-slate-600 mt-1 leading-relaxed">{c.description}</p>}
                  <p className="text-slate-600 mt-2">{fmtDate(c.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`px-3 py-1 rounded-full font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                  {c.amount && <span className="font-bold text-slate-800 text-lg">{fmt(c.amount)}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DocumentsView({ onBack }) {
  return (
    <div>
      <SectionHeader title="המסמכים שלי" subtitle="כל המסמכים הרפואיים והביטוחיים" onBack={onBack} />
      <div className="space-y-3">
        {D.documents.map(doc => (
          <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 border border-slate-200">
              {DOC_ICON[doc.category] || '📄'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 truncate">{doc.original_name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-slate-600">{doc.category}</span>
                <span className="text-slate-600">{fmtDate(doc.created_at)}</span>
              </div>
            </div>
            <span className="text-slate-500 text-sm px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 flex-shrink-0">הצגה בלבד</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancialView({ onBack }) {
  const f = D.financial
  return (
    <div>
      <SectionHeader title="המצב הכספי שלי" subtitle="כמה הביטוח משלם ומה נשאר לתשלום" onBack={onBack} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'עלות כוללת מוערכת',      value: fmt(f.total_cost),    bg: 'bg-slate-50',  border: 'border-slate-200', val: 'text-slate-800', desc: 'הסכום הכולל שעשוי לעלות הטיפול' },
            { label: 'מה הביטוח משלם',          value: fmt(f.total_covered), bg: 'bg-green-50',  border: 'border-green-200', val: 'text-green-700', desc: `${f.cov_pct}% מסך העלות` },
            { label: 'מימון נוסף (קרן סיוע)',   value: fmt(f.ext_funding),   bg: 'bg-blue-50',   border: 'border-blue-200',  val: 'text-blue-700',  desc: 'קרן "ניצן לחיים" — אושרה' },
            { label: 'מה שנשאר לתשלום שלך',     value: fmt(f.gap),           bg: 'bg-red-50',    border: 'border-red-200',   val: 'text-red-700',   desc: 'הסכום שעליך לשלם בעצמך' },
          ].map((c, i) => (
            <div key={i} className={`rounded-2xl border p-5 ${c.bg} ${c.border}`}>
              <p className="text-slate-600 font-medium mb-2">{c.label}</p>
              <p className={`text-3xl font-bold ${c.val}`}>{c.value}</p>
              <p className="text-slate-600 mt-2 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-700 mb-3 text-right">התפלגות המימון</p>
          <div className="flex h-5 rounded-full overflow-hidden bg-slate-100 mb-3">
            <div className="bg-green-400" style={{ width: `${f.cov_pct}%` }} />
            <div className="bg-blue-400" style={{ width: `${Math.round(f.ext_funding / f.total_cost * 100)}%` }} />
          </div>
          <div className="flex gap-5 text-slate-600 justify-end">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" />הביטוח משלם</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />סיוע נוסף</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-200 inline-block" />שלך</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RequestsView({ onBack }) {
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)
  const send = () => { setSent(true); setMsg(''); setShowForm(false) }
  return (
    <div>
      <SectionHeader title="שאל שאלה או שלח בקשה" subtitle="מנהל האירוע שלך יחזור אליך בהקדם" onBack={onBack} />
      {sent && (
        <div className="bg-green-50 border-2 border-green-200 text-green-800 font-medium rounded-2xl p-4 mb-5 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <span>הבקשה נשלחה! (דמו — לא נשמר בשרת)</span>
        </div>
      )}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="w-full py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-3 transition-colors shadow-md mb-6">
          <span className="text-2xl">+</span> שלח בקשה חדשה
        </button>
      ) : (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4 shadow-md mb-6">
          <p className="font-bold text-slate-800 text-xl">בקשה חדשה</p>
          <textarea
            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-base text-right resize-none focus:outline-none focus:border-blue-400 leading-relaxed"
            rows={4} placeholder="כתוב את בקשתך כאן..." value={msg}
            onChange={e => setMsg(e.target.value)}
          />
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50">ביטול</button>
            <button onClick={send} disabled={!msg.trim()} className="basis-2/3 py-3 rounded-2xl bg-blue-600 text-white font-bold disabled:opacity-40">שלח</button>
          </div>
        </div>
      )}
      <div className="text-center py-10 text-slate-500">
        <p className="text-5xl mb-3">💬</p>
        <p className="font-medium text-slate-700">ממשק ישיר עם מנהל האירוע</p>
        <p className="text-slate-500 mt-2">תגובות ממנהל האירוע יופיעו כאן</p>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { key: 'home',      icon: '🏠', label: 'בית'    },
  { key: 'timeline',  icon: '🗓️', label: 'טיפול'  },
  { key: 'documents', icon: '📁', label: 'מסמכים' },
  { key: 'requests',  icon: '💬', label: 'שאל'    },
  { key: 'financial', icon: '💰', label: 'כספי'   },
]

export default function DemoPatientPortal() {
  const navigate = useNavigate()
  const [view, setView] = useState('home')
  const goBack = () => setView('home')

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <DemoBanner onBack={() => navigate('/manager')} />

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 text-base leading-[1.8]">
        {view === 'home'      && <HomeView      onNavigate={setView} />}
        {view === 'timeline'  && <TimelineView  onBack={goBack} />}
        {view === 'claims'    && <ClaimsView    onBack={goBack} />}
        {view === 'documents' && <DocumentsView onBack={goBack} />}
        {view === 'financial' && <FinancialView onBack={goBack} />}
        {view === 'requests'  && <RequestsView  onBack={goBack} />}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-200 flex z-30 shadow-lg">
        {NAV_ITEMS.map(item => (
          <button key={item.key} onClick={() => setView(item.key)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
              view === item.key ? 'text-blue-600' : 'text-slate-500'
            }`}>
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
