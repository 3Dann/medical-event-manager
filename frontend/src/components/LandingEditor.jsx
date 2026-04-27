import { useState } from 'react'
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

const EDITOR_LANGS = [
  { code: 'he', flag: '🇮🇱', name: 'עברית' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'pt', flag: '🇵🇹', name: 'Português' },
  { code: 'am', flag: '🇪🇹', name: 'አማርኛ' },
]

function initDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { by_lang: { he: { ...LANDING_DEFAULTS } } }
    const stored = JSON.parse(raw)
    if (stored.by_lang) return stored
    // Migrate old flat structure → new by_lang structure
    return { by_lang: { he: { ...LANDING_DEFAULTS, ...stored } } }
  } catch { return { by_lang: { he: { ...LANDING_DEFAULTS } } } }
}

export function getLandingOverrides(lang = 'he') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...LANDING_DEFAULTS }
    const stored = JSON.parse(raw)
    if (stored.by_lang) {
      const langData = stored.by_lang[lang] || stored.by_lang.he || {}
      return { ...LANDING_DEFAULTS, ...langData }
    }
    // Old flat structure backward compat
    return { ...LANDING_DEFAULTS, ...stored }
  } catch { return { ...LANDING_DEFAULTS } }
}

// ── Editor ────────────────────────────────────────────────────────────────────
export default function LandingEditor() {
  const { isDevUnlocked, setEditMode } = useDev()
  const [open,        setOpen]        = useState(false)
  const [draft,       setDraft]       = useState(initDraft)
  const [editLang,    setEditLang]    = useState('he')
  const [status,      setStatus]      = useState(null)
  const [translating, setTranslating] = useState(false)
  const [transMsg,    setTransMsg]    = useState('')
  const [devPw,       setDevPw]       = useState(() => localStorage.getItem('dev_gate_password') || '')

  if (!isDevUnlocked) return null

  const cur = draft.by_lang?.[editLang] || draft.by_lang?.he || LANDING_DEFAULTS

  function setField(field, value) {
    setDraft(d => ({
      ...d,
      by_lang: { ...d.by_lang, [editLang]: { ...(d.by_lang?.[editLang] || {}), [field]: value } }
    }))
  }

  function setStat(i, field, value) {
    const stats = (cur.stats || LANDING_DEFAULTS.stats).map((s, idx) => idx === i ? { ...s, [field]: value } : s)
    setField('stats', stats)
  }

  async function translateAll() {
    setTranslating(true)
    setTransMsg('מתרגם לכל השפות...')
    try {
      const heContent = draft.by_lang?.he || LANDING_DEFAULTS
      const res = await axios.post('/api/settings/landing/translate', { content: heContent })
      const by_lang = res.data.by_lang
      setDraft(d => ({ ...d, by_lang }))
      setTransMsg('✓ תורגם בהצלחה לכל השפות!')
      setTimeout(() => setTransMsg(''), 3000)
    } catch (e) {
      setTransMsg('⚠ שגיאה בתרגום — ' + (e.response?.data?.detail || e.message))
      setTimeout(() => setTransMsg(''), 5000)
    }
    setTranslating(false)
  }

  async function save() {
    setStatus('saving')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    if (devPw.trim()) localStorage.setItem('dev_gate_password', devPw.trim())
    else localStorage.removeItem('dev_gate_password')
    window.dispatchEvent(new Event('landing_overrides_changed'))
    setEditMode(true)
    try {
      await axios.put('/api/settings/landing', draft)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus(null), 2500)
  }

  async function reset() {
    const fresh = { by_lang: { he: { ...LANDING_DEFAULTS } } }
    localStorage.removeItem(STORAGE_KEY)
    setDraft(fresh)
    setEditMode(false)
    window.dispatchEvent(new Event('landing_overrides_changed'))
    try { await axios.put('/api/settings/landing', fresh) } catch { /* ignore */ }
  }

  const hasTranslations = Object.keys(draft.by_lang || {}).length > 1

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="עריכת דף נחיתה"
        className="fixed bottom-5 left-5 z-50 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all"
      >
        <span className="text-base">{open ? '✕' : '✏️'}</span>
        {!open && <span>ערוך דף נחיתה</span>}
      </button>

      {open && (
        <div className="fixed inset-y-0 left-0 z-40 flex" dir="rtl">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-96 bg-slate-900 text-white shadow-2xl flex flex-col overflow-hidden mr-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800">
              <div>
                <p className="font-bold text-sm">✏️ עורך דף נחיתה — רב-לשוני</p>
                <p className="text-xs text-slate-400 mt-0.5">ערוך בכל שפה בנפרד או תרגם אוטומטית</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            {/* Language selector */}
            <div className="px-4 pt-3 pb-2 border-b border-slate-700 bg-slate-800">
              <p className="text-xs text-slate-400 mb-2">שפה לעריכה:</p>
              <div className="grid grid-cols-5 gap-1">
                {EDITOR_LANGS.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setEditLang(l.code)}
                    title={l.name}
                    className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs transition-colors
                      ${editLang === l.code ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}
                      ${(draft.by_lang?.[l.code] && l.code !== 'he') ? 'ring-1 ring-green-500/50' : ''}`}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="text-[9px] font-mono">{l.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>

              {/* Translate All button */}
              <button
                onClick={translateAll}
                disabled={translating}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                {translating ? (
                  <><span className="animate-spin">⟳</span> מתרגם...</>
                ) : (
                  <>🌐 תרגם הכל מעברית לכל השפות</>
                )}
              </button>
              {transMsg && (
                <p className={`text-xs mt-1 text-center ${transMsg.startsWith('⚠') ? 'text-red-400' : 'text-green-400'}`}>
                  {transMsg}
                </p>
              )}
              {hasTranslations && !transMsg && (
                <p className="text-[10px] text-slate-500 mt-1 text-center">
                  ✓ תרגום קיים ל-{Object.keys(draft.by_lang).length} שפות
                </p>
              )}
            </div>

            {/* Fields for current language */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
                <span>{EDITOR_LANGS.find(l => l.code === editLang)?.flag}</span>
                <span>{EDITOR_LANGS.find(l => l.code === editLang)?.name}</span>
                {editLang !== 'he' && <span className="text-slate-500 font-normal">(מתרגום אוטומטי)</span>}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">תגית Hero</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={cur.heroBadge || ''}
                  onChange={e => setField('heroBadge', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">כותרת ראשית</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={cur.heroTitle || ''}
                  onChange={e => setField('heroTitle', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">תת-כותרת Hero</label>
                <textarea
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none resize-none"
                  value={cur.heroSubtitle || ''}
                  onChange={e => setField('heroSubtitle', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">סטטיסטיקות Hero</label>
                <div className="space-y-2">
                  {(cur.stats || LANDING_DEFAULTS.stats).map((s, i) => (
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

              <div>
                <label className="block text-xs text-slate-400 mb-1">כותרת שלבים</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={cur.stepsTitle || ''}
                  onChange={e => setField('stepsTitle', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">כותרת תכונות</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={cur.featuresTitle || ''}
                  onChange={e => setField('featuresTitle', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">כותרת CTA</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none"
                  value={cur.ctaTitle || ''}
                  onChange={e => setField('ctaTitle', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">תת-כותרת CTA</label>
                <textarea
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-400 outline-none resize-none"
                  value={cur.ctaSubtitle || ''}
                  onChange={e => setField('ctaSubtitle', e.target.value)}
                />
              </div>

              {/* Steps/Features are set by translate — show count only */}
              {cur.steps && (
                <p className="text-[10px] text-slate-500">
                  שלבים: {cur.steps.map(s => s.title).join(' · ')}
                </p>
              )}
              {cur.features && (
                <p className="text-[10px] text-slate-500">
                  תכונות: {cur.features.map(f => f.title).join(' · ')}
                </p>
              )}

              {/* DevGate password — only in Hebrew tab */}
              {editLang === 'he' && (
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
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-700 bg-slate-800 space-y-2">
              <button
                onClick={save}
                disabled={status === 'saving'}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {status === 'saving' ? '...' : status === 'saved' ? '✓ נשמר!' : status === 'error' ? '⚠ נשמר מקומית בלבד' : 'שמור שינויים'}
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
