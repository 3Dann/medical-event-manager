import { useState, useEffect } from 'react'
import axios from 'axios'
import { useDev } from '../context/DevContext'

const STORAGE_KEY = 'landing_overrides'

export const LANDING_DEFAULTS = {
  heroBadge:     'מערכת ניהול אירוע רפואי מקיפה',
  heroTitle:     'ניהול אירוע רפואי',
  heroSubtitle:  'ניהול מסע המטופל מרגע האבחון ועד ההחלמה',
  stats: [
    { val: '370+', label: 'רופאים מאומתים' },
    { val: '5',    label: 'שלבי מסע מטופל' },
    { val: '4',    label: 'קופות חולים'    },
  ],
  stepsTitle: 'שלושה שלבים פשוטים',
  steps: [
    { num: '01', title: 'הגדרת מטופל',    desc: 'הוסף מטופל עם פרטי קופת חולים ואבחנה — המערכת יוצרת את מסע המטופל אוטומטית.' },
    { num: '02', title: 'ניהול ביטוחים', desc: 'ייבא פוליסות, הוסף ביטוחים פרטיים ועקוב אחר כל הכיסויים במקום אחד.' },
    { num: '03', title: 'אסטרטגיה',       desc: 'קבל המלצות פיננסיות, הגש תביעות בסדר הנכון ומקסם ניצול זכויות.' },
  ],
  featuresTitle: 'כל מה שצריך לניהול אירוע רפואי',
  features: [
    { id: 'journey',    icon: '🗺️', title: 'מסע מטופל',        desc: 'ציר זמן ויזואלי מלא עם 5 שלבי המסע הרפואי',                               points: ['5 שלבים קבועים לכל מטופל','צמתי החלטה ידניים','עדכון סטטוס בזמן אמת','תאריכים והערות לכל שלב'] },
    { id: 'doctors',    icon: '👨‍⚕️', title: 'מאגר רופאים',       desc: 'מאגר מרכזי של מאות רופאים מוסמכים. סינון לפי מומחיות, קופה ומיקום.',     points: ['370+ רופאים מאומתים','סינון רב-פרמטרי','ייצוא לאקסל RTL','עדכון אוטומטי'] },
    { id: 'insurance',  icon: '🛡️', title: 'ביטוחים ותביעות',   desc: 'ניהול כל מקורות הביטוח — קופ"ח, ביטוח פרטי, ביטוח לאומי.',               points: ['ייבוא פוליסות אוטומטי','מעקב סטטוס תביעות','עדיפויות וסדרי פעולה','כיסויים לפי קטגוריות'] },
    { id: 'strategy',   icon: '💡', title: 'אסטרטגיה פיננסית',  desc: 'מיפוי זכויות, כיסויים וזכאויות ממכלול מקורות הביטוח.',                    points: ['מיפוי זכויות מלא','זיהוי כיסויים חופפים','המלצות מבוססות נתונים','תחזית החזרים'] },
    { id: 'responsive', icon: '⭐', title: 'ציוני רספונסיביות',  desc: 'השוואת קופות וחברות ביטוח לפי מהירות תגובה ורמת בירוקרטיה.',              points: ['ציון רספונסיביות 1-10','השוואה בין קופות','השוואת ביטוח פרטי','עדכון ידני ואוטומטי'] },
    { id: 'security',   icon: '🔒', title: 'אבטחה ופרטיות',     desc: 'אימות דו-שלבי חובה — QR (TOTP) או מייל. ניהול הרשאות מדורג.',             points: ['אימות דו-שלבי QR / מייל','תפקידים מדורגים','JWT עם תוקף מוגבל','ניהול משתמשים מרכזי'] },
  ],
  ctaTitle:    'מוכן להתחיל?',
  ctaSubtitle: 'הצטרף למערכת וקבל שליטה מלאה על האירוע הרפואי',
}

export function getLandingOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...LANDING_DEFAULTS, ...JSON.parse(raw) } : { ...LANDING_DEFAULTS }
  } catch { return { ...LANDING_DEFAULTS } }
}

// ── Editor panel ──────────────────────────────────────────────────────────────
export default function LandingEditor() {
  const { isDevUnlocked, setEditMode } = useDev()
  const [open,    setOpen]    = useState(false)
  const [draft,   setDraft]   = useState(() => getLandingOverrides())
  const [status,  setStatus]  = useState(null)   // null | 'saving' | 'saved' | 'error'
  const [devPw,   setDevPw]   = useState(() => localStorage.getItem('dev_gate_password') || '')

  useEffect(() => { setDraft(getLandingOverrides()) }, [open])

  if (!isDevUnlocked) return null

  async function save() {
    setStatus('saving')
    // Write to localStorage immediately (offline fallback)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    if (devPw.trim()) localStorage.setItem('dev_gate_password', devPw.trim())
    else localStorage.removeItem('dev_gate_password')
    window.dispatchEvent(new Event('landing_overrides_changed'))
    setEditMode(true)

    // Persist to backend
    try {
      await axios.put('/api/settings/landing', draft)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus(null), 2500)
  }

  async function reset() {
    localStorage.removeItem(STORAGE_KEY)
    setDraft({ ...LANDING_DEFAULTS })
    setEditMode(false)
    window.dispatchEvent(new Event('landing_overrides_changed'))
    try { await axios.put('/api/settings/landing', LANDING_DEFAULTS) } catch { /* ignore */ }
  }

  function setStat(i, field, val) {
    const stats = draft.stats.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
    setDraft(d => ({ ...d, stats }))
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="עריכת דף נחיתה"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all"
      >
        <span className="text-base">{open ? '✕' : '✏️'}</span>
        {!open && <span>ערוך דף נחיתה</span>}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-y-0 left-0 z-40 flex" dir="rtl">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-80 bg-slate-900 text-white shadow-2xl flex flex-col overflow-hidden mr-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800">
              <div>
                <p className="font-bold text-sm">✏️ עורך דף נחיתה</p>
                <p className="text-xs text-slate-400 mt-0.5">שינויים נשמרים ב-localStorage</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Hero badge */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">תגית Hero</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                  value={draft.heroBadge}
                  onChange={e => setDraft(d => ({ ...d, heroBadge: e.target.value }))}
                />
              </div>

              {/* Stats */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">סטטיסטיקות Hero</label>
                <div className="space-y-2">
                  {draft.stats.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="w-20 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:border-amber-400 outline-none text-center font-bold"
                        value={s.val}
                        onChange={e => setStat(i, 'val', e.target.value)}
                        placeholder="ערך"
                      />
                      <input
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:border-amber-400 outline-none"
                        value={s.label}
                        onChange={e => setStat(i, 'label', e.target.value)}
                        placeholder="תיאור"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">כותרת CTA</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={draft.ctaTitle}
                  onChange={e => setDraft(d => ({ ...d, ctaTitle: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">תת-כותרת CTA</label>
                <textarea
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none resize-none"
                  value={draft.ctaSubtitle}
                  onChange={e => setDraft(d => ({ ...d, ctaSubtitle: e.target.value }))}
                />
              </div>

              {/* DevGate password */}
              <div className="border-t border-slate-700 pt-4">
                <label className="block text-xs text-slate-400 mb-1">סיסמת DevGate (ריק = ברירת מחדל)</label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none font-mono"
                  value={devPw}
                  onChange={e => setDevPw(e.target.value)}
                  placeholder="השאר ריק לסיסמה המקורית"
                />
                <p className="text-xs text-slate-500 mt-1">ישפיע על כניסה הבאה מ-Production</p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-slate-700 bg-slate-800 space-y-2">
              <button
                onClick={save}
                disabled={status === 'saving'}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {status === 'saving' ? '...' : status === 'saved' ? '✓ נשמר ב-DB!' : status === 'error' ? '⚠ נשמר מקומית בלבד' : 'שמור שינויים'}
              </button>
              <button
                onClick={reset}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl text-xs transition-colors"
              >
                אפס לברירת מחדל
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
