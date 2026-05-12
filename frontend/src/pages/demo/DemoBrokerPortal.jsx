import { useNavigate } from 'react-router-dom'
import { fmtDate } from '../../utils/formatters'

const fmt = n => `₪${Math.round(n).toLocaleString('he-IL')}`

const D = {
  name: 'אריאל לוי',
  license: 'רישיון ס"ב 1234567',
  company: 'לוי ביטוח בע"מ',
  stats: {
    active_patients: 5,
    pending_claims: 4,
    approved_this_month: 73750,
    commission_rate: 5,
    commission: 3688,
  },
  patients: [
    { id: 1, name: 'שרה כהן',     diagnosis: 'סרטן שד',         hmo: 'מכבי זהב',      claims: 3, pending: 1, approved: 18500, updated: '2026-05-08', status: 'active'    },
    { id: 2, name: 'דוד לוי',     diagnosis: 'כאב גב כרוני',    hmo: 'כללית מושלם',   claims: 2, pending: 0, approved: 9500,  updated: '2026-05-06', status: 'active'    },
    { id: 3, name: 'מרים ישראלי', diagnosis: 'ניתוח לב פתוח',  hmo: 'מאוחדת עדיף',  claims: 5, pending: 2, approved: 45000, updated: '2026-05-04', status: 'active'    },
    { id: 4, name: 'יוסף אברהם',  diagnosis: 'פרוסתת ירך',     hmo: 'לאומית זהב',    claims: 1, pending: 1, approved: 0,     updated: '2026-05-02', status: 'new'       },
    { id: 5, name: 'נועה שפירא',  diagnosis: 'סרטן מעי גס',    hmo: 'מכבי זהב',      claims: 4, pending: 0, approved: 28000, updated: '2026-04-28', status: 'completed' },
  ],
  activity: [
    { id: 1, icon: '✅', text: 'תביעה של מרים ישראלי אושרה — ₪12,000',       time: 'לפני שעה'    },
    { id: 2, icon: '📤', text: 'תביעה חדשה הוגשה עבור שרה כהן',              time: 'לפני 3 שעות' },
    { id: 3, icon: '👤', text: 'מטופל חדש נוסף — יוסף אברהם',               time: 'אתמול 14:30' },
    { id: 4, icon: '✅', text: 'תביעה של דוד לוי אושרה — ₪9,500',           time: 'אתמול 10:15' },
    { id: 5, icon: '📋', text: '3 תביעות הוגשו עבור נועה שפירא',             time: 'לפני 3 ימים' },
  ],
}

const STATUS = {
  active:    { label: 'פעיל',   bg: 'bg-blue-100',   text: 'text-blue-700'   },
  new:       { label: 'חדש',    bg: 'bg-purple-100',  text: 'text-purple-700' },
  completed: { label: 'הסתיים', bg: 'bg-green-100',   text: 'text-green-700'  },
}

const COMING_SOON = ['ייצוא Excel לחישוב עמלות', 'הגשת תביעה ישירה', "צ'אט עם מנהל אירוע", 'דוחות ביצועים חודשיים']

export default function DemoBrokerPortal() {
  const navigate = useNavigate()
  const { name, license, company, stats, patients, activity } = D

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">

      {/* Demo Banner */}
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => navigate('/manager')}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
          ← חזור למנהל
        </button>
        <span className="font-semibold">🎬 מצב הצגה — פורטל ברוקר / סוכן ביטוח</span>
        <span className="text-purple-200 text-sm mr-auto hidden sm:inline">נתוני דמו בלבד</span>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-bl from-slate-800 to-slate-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-slate-400 text-sm mb-1">ברוך הבא,</p>
              <h1 className="text-3xl font-bold">{name}</h1>
              <p className="text-slate-300 mt-1">{company} · {license}</p>
            </div>
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0">🤝</div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'מטופלים פעילים',                      value: stats.active_patients,        icon: '👥', bg: 'bg-blue-50',   border: 'border-blue-200',   val: 'text-blue-700'   },
            { label: 'תביעות ממתינות לטיפול',              value: stats.pending_claims,          icon: '⏳', bg: 'bg-amber-50',  border: 'border-amber-200',  val: 'text-amber-700'  },
            { label: 'אושר החודש',                          value: fmt(stats.approved_this_month), icon: '✅', bg: 'bg-green-50',  border: 'border-green-200',  val: 'text-green-700'  },
            { label: `עמלה צפויה (${stats.commission_rate}%)`, value: fmt(stats.commission),     icon: '💰', bg: 'bg-purple-50', border: 'border-purple-200', val: 'text-purple-700' },
          ].map((c, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${c.bg} ${c.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{c.icon}</span>
                <p className="text-slate-600 text-sm font-medium leading-tight">{c.label}</p>
              </div>
              <p className={`text-2xl font-bold ${c.val}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">

          {/* Patients */}
          <div className="md:col-span-2">
            <h2 className="text-lg font-bold text-slate-800 mb-4">המטופלים שלי</h2>
            <div className="space-y-3">
              {patients.map(p => {
                const st = STATUS[p.status] || STATUS.active
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800">{p.name}</p>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                        </div>
                        <p className="text-slate-600 text-sm mt-0.5">{p.diagnosis} · {p.hmo}</p>
                      </div>
                      <p className="text-slate-500 text-sm flex-shrink-0">{fmtDate(p.updated)}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <span className="text-slate-600">{p.claims} תביעות</span>
                      {p.pending > 0 && (
                        <span className="text-amber-600 font-medium">{p.pending} ממתינות</span>
                      )}
                      {p.approved > 0 && (
                        <span className="text-green-600 font-medium">{fmt(p.approved)} אושר</span>
                      )}
                      {p.approved === 0 && p.pending > 0 && (
                        <span className="text-slate-500">טרם אושר</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Activity */}
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">פעילות אחרונה</h2>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {activity.map(a => (
                <div key={a.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{a.icon}</span>
                    <div>
                      <p className="text-slate-800 text-sm leading-relaxed">{a.text}</p>
                      <p className="text-slate-500 text-xs mt-1">{a.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coming soon */}
        <div className="bg-gradient-to-bl from-slate-800 to-slate-700 text-white rounded-2xl p-6">
          <div className="text-center mb-4">
            <p className="text-2xl mb-1">🚧</p>
            <p className="font-bold text-lg">תכונות בפיתוח — בקרוב בפורטל הברוקר</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {COMING_SOON.map(f => (
              <div key={f} className="bg-white/10 rounded-xl px-3 py-3 text-sm text-slate-200 text-center leading-relaxed">{f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
