import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n/index.js'

export default function LanguageSwitcher({ compact = false }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  const PRIMARY = ['he', 'en']
  const secondary = LANGUAGES.filter(l => !PRIMARY.includes(l.code))

  function changeLang(code) {
    i18n.changeLanguage(code)
    localStorage.setItem('app_language', code)
    // Direction stays RTL always — only lang attribute changes
    document.documentElement.lang = code
    setOpen(false)
  }

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative flex items-center gap-1" dir="ltr">
      {/* Hebrew button */}
      <button
        onClick={() => changeLang('he')}
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium transition-colors
          ${i18n.language === 'he'
            ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
            : 'text-slate-600 hover:bg-slate-100'}`}
        title="עברית"
      >
        <span>🇮🇱</span>
        {!compact && <span className="hidden sm:inline">עברית</span>}
      </button>

      {/* English button */}
      <button
        onClick={() => changeLang('en')}
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium transition-colors
          ${i18n.language === 'en'
            ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
            : 'text-slate-600 hover:bg-slate-100'}`}
        title="English"
      >
        <span>🇬🇧</span>
        {!compact && <span className="hidden sm:inline">English</span>}
      </button>

      {/* More languages dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium transition-colors
            ${open || (!PRIMARY.includes(i18n.language))
              ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
              : 'text-slate-600 hover:bg-slate-100'}`}
          title="More languages"
        >
          {!PRIMARY.includes(i18n.language) ? (
            <>
              <span>{currentLang.flag}</span>
              {!compact && <span className="hidden sm:inline text-xs">{currentLang.name}</span>}
            </>
          ) : (
            <span className="text-xs">🌐</span>
          )}
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
            {secondary.map(lang => (
              <button
                key={lang.code}
                onClick={() => changeLang(lang.code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors
                  ${i18n.language === lang.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
