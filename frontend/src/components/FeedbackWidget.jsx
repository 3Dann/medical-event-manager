import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const TYPES = [
  { value: 'bug',     label: '🐛 באג',          desc: 'משהו לא עובד כמו שצריך' },
  { value: 'feature', label: '💡 תכונה חדשה',   desc: 'רעיון לשיפור או תוספת' },
]

export default function FeedbackWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  if (!user) return null

  const reset = () => { setType('bug'); setMessage(''); setSent(false) }
  const close = () => { setOpen(false); setTimeout(reset, 300) }

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
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="שלח משוב"
        className="fixed bottom-5 left-5 z-40 w-11 h-11 bg-slate-700 hover:bg-slate-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M7 8h10M7 12h6m-9 8l4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">

            {sent ? (
              <div className="text-center py-4 space-y-3">
                <div className="text-4xl">🙏</div>
                <p className="font-semibold text-slate-800">תודה על המשוב!</p>
                <p className="text-sm text-slate-500">נבדוק ונטפל בהקדם</p>
                <button onClick={close} className="mt-2 text-sm text-blue-600 hover:underline">סגור</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">שלח משוב</h3>
                  <button onClick={close} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Type selector */}
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-right ${
                        type === t.value
                          ? t.value === 'bug'
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <div>{t.label}</div>
                      <div className="text-xs font-normal opacity-70 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  autoFocus
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, 400))}
                  placeholder={type === 'bug' ? 'תאר את הבאג בקצרה — מה עשית, מה קרה...' : 'תאר את התכונה שהיית רוצה לראות...'}
                  rows={4}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{message.length}/400</span>
                  <button
                    onClick={submit}
                    disabled={!message.trim() || sending}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {sending ? 'שולח...' : 'שלח'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
