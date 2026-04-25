import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const TYPES = [
  {
    value: 'bug',
    label: '🐛 דיווח על באג',
    desc: 'משהו לא עובד כמו שצריך',
    color: 'border-red-400 bg-red-50 text-red-700',
  },
  {
    value: 'feature',
    label: '💡 בקשת תכונה',
    desc: 'רעיון לשיפור או תוספת',
    color: 'border-blue-400 bg-blue-50 text-blue-700',
  },
]

// open / onClose — controlled mode (sidebar button)
// floatingTrigger — shows the floating bubble button
export default function FeedbackWidget({ open: controlledOpen, onClose, floatingTrigger = false }) {
  const { user } = useAuth()
  const [internalOpen, setInternalOpen] = useState(false)
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  if (!user) return null

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

  const reset = () => { setType('bug'); setMessage(''); setSent(false) }
  const close = () => {
    onClose ? onClose() : setInternalOpen(false)
    setTimeout(reset, 300)
  }

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      await axios.post('/api/public/feedback', {
        name: user.full_name || user.email,
        role: user.role,
        message: message.trim(),
        feedback_type: type,
      })
      setSent(true)
    } catch (_) {}
    finally { setSending(false) }
  }

  return (
    <>
      {/* Floating trigger — only when floatingTrigger=true */}
      {floatingTrigger && (
        <button
          onClick={() => setInternalOpen(true)}
          title="שלח משוב"
          className="fixed bottom-5 left-5 z-40 w-11 h-11 bg-slate-700 hover:bg-slate-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M7 8h10M7 12h6m-9 8l4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="bg-slate-800 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M7 8h10M7 12h6m-9 8l4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">שלח משוב</p>
                  <p className="text-slate-400 text-xs">באג שמצאת? רעיון לשיפור? נשמח לשמוע</p>
                </div>
              </div>
              <button onClick={close} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {sent ? (
              <div className="p-8 text-center space-y-3">
                <div className="text-5xl">🙏</div>
                <p className="text-xl font-bold text-slate-800">תודה רבה!</p>
                <p className="text-slate-500">המשוב נקלט ויטופל בהקדם</p>
                <button
                  onClick={close}
                  className="mt-4 px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  סגור
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Type selector */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">סוג המשוב</p>
                  <div className="grid grid-cols-2 gap-3">
                    {TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setType(t.value)}
                        className={`p-3 rounded-xl border-2 text-right transition-all ${
                          type === t.value ? t.color : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-semibold text-sm">{t.label}</div>
                        <div className="text-xs opacity-75 mt-0.5">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {type === 'bug' ? 'תאר את הבאג' : 'תאר את הרעיון'}
                  </p>
                  <textarea
                    autoFocus
                    value={message}
                    onChange={e => setMessage(e.target.value.slice(0, 400))}
                    placeholder={
                      type === 'bug'
                        ? 'מה עשית, מה קרה, ומה ציפית שיקרה...'
                        : 'איזו תכונה היית רוצה לראות ולמה היא תועיל לך...'
                    }
                    rows={4}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1 text-left">{message.length}/400</p>
                </div>

                {/* Submit */}
                <button
                  onClick={submit}
                  disabled={!message.trim() || sending}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                    !message.trim() || sending
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : type === 'bug'
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  }`}
                >
                  {sending ? 'שולח...' : type === 'bug' ? '🐛 שלח דיווח על באג' : '💡 שלח בקשת תכונה'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
