import { useState, useEffect } from 'react'
import { useDev } from '../context/DevContext'

const BUILD_VERSION = '2.1-dev'

function isLocal() {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.')
}

export default function DevGate({ children }) {
  const { setDevUnlocked } = useDev()
  const [unlocked, setUnlocked] = useState(() => isLocal())

  useEffect(() => {
    if (isLocal()) { setDevUnlocked(true); return }
    const unlock = () => { setUnlocked(true); setDevUnlocked(true) }
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('click', unlock, { once: true })
    return () => {
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('click', unlock)
    }
  }, []) // eslint-disable-line

  if (unlocked) return children

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
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-amber-300 font-semibold text-sm">⚠️ אזור פיתוח — Development Area</p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              המערכת נמצאת בשלב פיתוח פעיל.<br />
              גישה מורשית לצוות הפיתוח בלבד.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
