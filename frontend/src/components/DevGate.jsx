import { useState } from 'react'

const DEV_PASSWORD  = 'Dan3768354Mi'
const BUILD_VERSION = '2.1-dev'

function isLocal() {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.')
}

export default function DevGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => isLocal())
  const [input, setInput]   = useState('')
  const [error, setError]   = useState(false)
  const [shake, setShake]   = useState(false)
  const [show, setShow]     = useState(false)

  if (unlocked) return children

  function attempt() {
    if (input === DEV_PASSWORD) {
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setInput('')
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') attempt()
    if (error) setError(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden" dir="rtl">

      {/* ── animated grid background ─────────────────────────────── */}
      <div className="absolute inset-0 opacity-10"
           style={{
             backgroundImage: 'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
             backgroundSize: '40px 40px'
           }} />

      {/* ── corner ribbons ───────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />

      {/* ── main card ────────────────────────────────────────────── */}
      <div className="relative w-full max-w-md">

        {/* dev badge */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-1.5 rounded-full text-xs font-mono tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            DEVELOPMENT BUILD · {BUILD_VERSION}
          </div>
        </div>

        {/* card body */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl shadow-black/60">

          {/* logo / icon */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-3xl">
              🏗️
            </div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Orly Medical</h1>
            <p className="text-slate-400 text-sm mt-1">מנהל אירוע רפואי</p>
          </div>

          {/* warning block */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 text-center">
            <p className="text-amber-300 font-semibold text-sm">⚠️ אזור פיתוח — Development Area</p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              המערכת נמצאת בשלב פיתוח פעיל.<br />
              גישה מורשית לצוות הפיתוח בלבד.
            </p>
          </div>

          {/* password field */}
          <div className="space-y-3">
            <label className="block text-slate-400 text-xs font-medium mb-1">
              סיסמת גישה
            </label>

            <div className={`relative transition-transform duration-300 ${shake ? 'translate-x-2' : ''}`}
                 style={{ animation: shake ? 'shake 0.4s ease' : 'none' }}>
              <input
                type={show ? 'text' : 'password'}
                value={input}
                onChange={e => { setInput(e.target.value); setError(false) }}
                onKeyDown={onKey}
                placeholder="הכנס סיסמה"
                autoFocus
                className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none transition-colors pr-10
                  ${error
                    ? 'border-red-500 focus:border-red-400'
                    : 'border-slate-600 focus:border-blue-500'
                  }`}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm"
              >
                {show ? '🙈' : '👁️'}
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center animate-pulse">
                סיסמה שגויה — נסה שנית
              </p>
            )}

            <button
              onClick={attempt}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              כניסה למערכת
            </button>
          </div>
        </div>

        {/* footer note */}
        <p className="text-center text-slate-600 text-xs mt-6">
          נדרשת סיסמה בכל כניסה מחדש
        </p>
      </div>

      {/* shake keyframe */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
