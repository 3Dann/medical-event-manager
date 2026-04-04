import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { label: 'מסע מטופל',           href: '#journey'      },
  { label: 'מאגר רופאים',         href: '#doctors'      },
  { label: 'ביטוחים ותביעות',     href: '#insurance'    },
  { label: 'אסטרטגיה פיננסית',   href: '#strategy'     },
  { label: 'רספונסיביות',         href: '#responsive'   },
  { label: 'אבטחה',               href: '#security'     },
]

const FEATURES = [
  {
    id: 'journey',
    icon: '🗺️',
    title: 'מסע מטופל',
    color: 'from-blue-500 to-blue-600',
    light: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    desc: 'ציר זמן ויזואלי מלא עם 5 שלבי המסע הרפואי: גילוי ואבחון, תכנון הטיפול, שלב הטיפולים, החלמה ושיקום, ומעקב. הוסף צמתי החלטה מותאמים אישית ומקם אותם לפי הזמן.',
    points: ['5 שלבים קבועים לכל מטופל', 'צמתי החלטה ידניים מותאמים', 'עדכון סטטוס בזמן אמת', 'תאריכים והערות לכל שלב'],
  },
  {
    id: 'doctors',
    icon: '👨‍⚕️',
    title: 'מאגר רופאים',
    color: 'from-emerald-500 to-emerald-600',
    light: 'bg-emerald-50 border-emerald-200',
    textColor: 'text-emerald-700',
    desc: 'מאגר מרכזי של מאות רופאים מוסמכים, נאסף ממקורות רשמיים כולל משרד הבריאות, tteam, ו-data.gov.il. סינון לפי מומחיות, קופת חולים, מיקום וחוות דעת.',
    points: ['מאות רופאים מאומתים', 'סינון מתקדם רב-פרמטרי', 'ייצוא לאקסל RTL', 'עדכון אוטומטי ממקורות מוסמכים'],
  },
  {
    id: 'insurance',
    icon: '🛡️',
    title: 'ביטוחים ותביעות',
    color: 'from-violet-500 to-violet-600',
    light: 'bg-violet-50 border-violet-200',
    textColor: 'text-violet-700',
    desc: 'ניהול מלא של כל מקורות הביטוח — קופת חולים, ביטוח פרטי, ביטוח לאומי. מעקב תביעות עם סטטוסים, עדיפויות ותאריכי יעד.',
    points: ['ייבוא פוליסות קופת חולים אוטומטי', 'מעקב סטטוס תביעות', 'עדיפויות וסדרי פעולה', 'כיסויים לפי קטגוריות'],
  },
  {
    id: 'strategy',
    icon: '💡',
    title: 'אסטרטגיה פיננסית',
    color: 'from-amber-500 to-amber-600',
    light: 'bg-amber-50 border-amber-200',
    textColor: 'text-amber-700',
    desc: 'מיפוי זכויות, כיסויים וזכאויות ממכלול מקורות הביטוח. המלצות לניצול מיטבי, זיהוי כיסויים חופפים והזדמנויות להחזרים.',
    points: ['מיפוי זכויות מלא', 'זיהוי כיסויים חופפים', 'המלצות מבוססות נתונים', 'תחזית החזרים פיננסיים'],
  },
  {
    id: 'responsive',
    icon: '⭐',
    title: 'ציוני רספונסיביות',
    color: 'from-rose-500 to-rose-600',
    light: 'bg-rose-50 border-rose-200',
    textColor: 'text-rose-700',
    desc: 'השוואת קופות חולים וחברות ביטוח לפי מהירות תגובה, רמת בירוקרטיה וציון כולל. מאגר מובנה שמסייע לקבלת החלטות מושכלות.',
    points: ['ציון רספונסיביות 1-10', 'השוואה בין כל קופות החולים', 'השוואת חברות ביטוח פרטי', 'עדכון ידני ואוטומטי'],
  },
  {
    id: 'security',
    icon: '🔒',
    title: 'אבטחה ופרטיות',
    color: 'from-slate-600 to-slate-700',
    light: 'bg-slate-50 border-slate-200',
    textColor: 'text-slate-700',
    desc: 'אימות דו-שלבי חובה — QR (TOTP) או מייל. ניהול הרשאות: מנהל אירוע רפואי, מטופל ומנהל ראשי. כל הנתונים מאובטחים עם JWT.',
    points: ['אימות דו-שלבי QR / מייל', 'תפקידים והרשאות מדורגות', 'JWT עם תוקף מוגבל', 'ניהול משתמשים מרכזי'],
  },
]

const STEPS = [
  { num: '01', title: 'הגדרת מטופל',    desc: 'הוסף מטופל עם פרטי קופת חולים, אבחנה ומידע רקע — המערכת יוצרת את מסע המטופל אוטומטית.' },
  { num: '02', title: 'ניהול ביטוחים',  desc: 'ייבא פוליסות קופת חולים, הוסף ביטוחים פרטיים ועקוב אחר כל הכיסויים במקום אחד.' },
  { num: '03', title: 'אסטרטגיה',       desc: 'קבל המלצות פיננסיות, הגש תביעות בסדר הנכון ומקסם את ניצול הזכויות.' },
]

function Navbar({ onLoginClick }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleNavClick = (href) => {
    setMenuOpen(false)
    if (href.startsWith('#')) {
      const el = document.getElementById(href.slice(1))
      el?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800 text-sm leading-tight">ניהול<br/>אירוע רפואי</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(l => (
              <button key={l.href} onClick={() => handleNavClick(l.href)}
                className="text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                {l.label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-2">
            {user ? (
              <button onClick={() => navigate(user.role === 'patient' ? '/patient' : '/manager')}
                className="btn-primary text-sm py-1.5 px-4">
                {user.role === 'patient' ? 'מסע שלי' : 'לוח הבקרה'}
              </button>
            ) : (
              <button onClick={onLoginClick} className="btn-primary text-sm py-1.5 px-4">
                כניסה למערכת
              </button>
            )}
            {/* Hamburger */}
            <button onClick={() => setMenuOpen(v => !v)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="lg:hidden border-t border-slate-100 py-3 space-y-1">
            {NAV_LINKS.map(l => (
              <button key={l.href} onClick={() => handleNavClick(l.href)}
                className="w-full text-right text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors block">
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleLogin = () => navigate('/login')
  const handleDashboard = () => navigate(user?.role === 'patient' ? '/patient' : '/manager')

  return (
    <div className="min-h-screen bg-white" style={{ direction: 'rtl' }}>
      <Navbar onLoginClick={handleLogin} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-blue-600 via-blue-700 to-slate-800" />
        {/* Decorative circles */}
        <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full opacity-20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-600 rounded-full opacity-20 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 text-sm px-4 py-1.5 rounded-full mb-6 border border-white/20">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            מערכת ניהול אירוע רפואי מקיפה
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
            ניהול אירוע רפואי
            <span className="block text-blue-300 mt-1">מקצועי ומרכזי</span>
          </h1>

          <p className="text-blue-100 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            פלטפורמה מקיפה לניהול מסע המטופל — ממאגר רופאים וביטוחים ועד אסטרטגיה פיננסית וצמתי החלטה
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <button onClick={handleDashboard}
                className="bg-white text-blue-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base">
                {user.role === 'patient' ? 'לצפייה במסע שלי ←' : 'לוח הבקרה ←'}
              </button>
            ) : (
              <button onClick={handleLogin}
                className="bg-white text-blue-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base">
                כניסה למערכת ←
              </button>
            )}
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="border border-white/30 text-white font-medium px-8 py-3.5 rounded-xl hover:bg-white/10 transition-colors text-base">
              גלה את התכונות
            </button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { val: '370+', label: 'רופאים מאומתים' },
              { val: '5',    label: 'שלבי מסע מטופל' },
              { val: '4',    label: 'קופות חולים' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-white">{s.val}</p>
                <p className="text-blue-200 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wave */}
        <div className="relative">
          <svg viewBox="0 0 1440 60" className="w-full block" preserveAspectRatio="none" style={{ height: 60 }}>
            <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="py-16 max-w-5xl mx-auto px-6">
        <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">איך זה עובד</p>
        <h2 className="text-3xl font-bold text-slate-800 text-center mb-12">שלושה שלבים פשוטים</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div key={step.num} className="relative">
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-8 left-0 w-full h-px bg-slate-200 -translate-x-1/2" style={{ left: '-50%', width: '100%' }} />
              )}
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4 shadow-md">
                  {step.num}
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section id="features" className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">תכונות המערכת</p>
          <h2 className="text-3xl font-bold text-slate-800 text-center mb-12">כל מה שצריך לניהול אירוע רפואי</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.id} id={f.id}
                className={`bg-white rounded-2xl border ${f.light.split(' ')[1]} p-6 hover:shadow-md transition-shadow`}>
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-2xl mb-4 shadow-sm`}>
                  {f.icon}
                </div>
                <h3 className={`text-lg font-bold ${f.textColor} mb-2`}>{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{f.desc}</p>
                <ul className="space-y-1.5">
                  {f.points.map(p => (
                    <li key={p} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gradient-to-br ${f.color}`} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-bl from-blue-600 to-slate-800 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white mb-4">מוכן להתחיל?</h2>
          <p className="text-blue-200 mb-8 text-lg">הצטרף למערכת וקבל שליטה מלאה על האירוע הרפואי</p>
          {user ? (
            <button onClick={handleDashboard}
              className="bg-white text-blue-700 font-semibold px-10 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base">
              {user.role === 'patient' ? 'למסע שלי ←' : 'ללוח הבקרה ←'}
            </button>
          ) : (
            <button onClick={handleLogin}
              className="bg-white text-blue-700 font-semibold px-10 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base">
              כניסה למערכת ←
            </button>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="text-slate-300 font-medium text-sm">ניהול אירוע רפואי</span>
          </div>
          <p className="text-xs text-slate-500">Orly Medical © {new Date().getFullYear()}</p>
          <div className="flex gap-4 text-xs">
            {NAV_LINKS.slice(0, 4).map(l => (
              <button key={l.href} onClick={() => document.getElementById(l.href.slice(1))?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-slate-200 transition-colors">
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
