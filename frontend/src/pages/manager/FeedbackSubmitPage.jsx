import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const TYPES = [
  {
    value: 'bug',
    label: '🐛 דיווח על באג',
    desc: 'משהו לא עובד כמו שצריך',
    active: 'border-red-400 bg-red-50',
    btn: 'bg-red-500 hover:bg-red-600',
    placeholder: 'תאר מה עשית, מה קרה, ומה ציפית שיקרה...',
  },
  {
    value: 'feature',
    label: '💡 בקשת תכונה',
    desc: 'רעיון לשיפור או תוספת למערכת',
    active: 'border-blue-400 bg-blue-50',
    btn: 'bg-blue-600 hover:bg-blue-700',
    placeholder: 'תאר את התכונה שהיית רוצה לראות ולמה היא תועיל לך...',
  },
]

export default function FeedbackSubmitPage() {
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const [type, setType]       = useState('bug')
  const [message, setMessage] = useState('')
  const [sent, setSent]       = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')

  const selected = TYPES.find(t => t.value === type)

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      await axios.post('/api/public/feedback', {
        name: user?.full_name || user?.email || 'משתמש',
        role: user?.role,
        message: message.trim(),
        feedback_type: type,
      })
      setSent(true)
    } catch {
      setError('שגיאה בשליחה — נסה שוב')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-10" dir="rtl">
      <div className="max-w-xl mx-auto">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          חזרה
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Header */}
          <div className="bg-slate-800 px-6 py-5">
            <h1 className="text-white text-lg font-bold">שלח משוב</h1>
            <p className="text-slate-400 text-sm mt-0.5">מצאת באג? יש לך רעיון? נשמח לשמוע</p>
          </div>

          {sent ? (
            <div className="p-10 text-center space-y-4">
              <div className="text-6xl">🙏</div>
              <p className="text-2xl font-bold text-slate-800">תודה רבה!</p>
              <p className="text-slate-500">המשוב נקלט ויטופל בהקדם האפשרי</p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => { setMessage(''); setSent(false) }}
                  className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  שלח משוב נוסף
                </button>
                <button
                  onClick={() => navigate('/manager')}
                  className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm hover:bg-slate-700 transition-colors"
                >
                  חזרה ללוח הבקרה
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">

              {/* Type selector */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">סוג המשוב</p>
                <div className="grid grid-cols-2 gap-3">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value)}
                      className={`p-4 rounded-xl border-2 text-right transition-all ${
                        type === t.value ? t.active : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-slate-800 text-sm">{t.label}</div>
                      <div className="text-xs text-slate-500 mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  {type === 'bug' ? 'תיאור הבאג' : 'תיאור הרעיון'}
                </p>
                <textarea
                  autoFocus
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, 500))}
                  placeholder={selected.placeholder}
                  rows={6}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1.5 text-left">{message.length}/500</p>
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              {/* Submit */}
              <button
                onClick={submit}
                disabled={!message.trim() || sending}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all ${
                  !message.trim() || sending
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : selected.btn
                }`}
              >
                {sending ? 'שולח...' : 'שלח'}
              </button>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
