import { useEffect } from 'react'

const STYLES = {
  error:   'bg-red-50 border-red-200 text-red-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
}

const ICONS = { error: '⚠️', success: '✅', info: 'ℹ️' }

export default function AppToast({ msg, type = 'error', onDismiss }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onDismiss, 4500)
    return () => clearTimeout(t)
  }, [msg, onDismiss])

  if (!msg) return null

  return (
    <div
      className={`fixed bottom-5 right-5 z-[9999] flex items-start gap-3 border rounded-2xl px-4 py-3 shadow-xl text-sm max-w-sm animate-in slide-in-from-bottom-2 duration-200 ${STYLES[type]}`}
      dir="rtl"
    >
      <span className="shrink-0 text-base">{ICONS[type]}</span>
      <span className="flex-1">{msg}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-lg leading-none"
        aria-label="סגור"
      >✕</button>
    </div>
  )
}
