import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function ResetPasswordPage() {
  const [params]    = useSearchParams()
  const navigate    = useNavigate()
  const token       = params.get('token') || ''
  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tokenOk, setTokenOk] = useState(null)

  useEffect(() => {
    if (!token) { setTokenOk(false); return }
    axios.get(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then(() => setTokenOk(true))
      .catch(() => setTokenOk(false))
  }, [token])

  const rules = [
    { ok: form.password.length >= 8,       text: 'לפחות 8 תווים' },
    { ok: /[A-Z]/.test(form.password),     text: 'אות גדולה באנגלית' },
    { ok: /[a-z]/.test(form.password),     text: 'אות קטנה באנגלית' },
    { ok: /[0-9]/.test(form.password),     text: 'ספרה אחת לפחות' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('הסיסמאות אינן תואמות'); return }
    if (rules.some(r => !r.ok))         { setError('הסיסמה אינה עומדת בדרישות'); return }
    setError(''); setLoading(true)
    try {
      await axios.post('/api/auth/reset-password', { token, new_password: form.password })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בעדכון הסיסמה')
    } finally { setLoading(false) }
  }

  if (tokenOk === null) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (tokenOk === false) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">⛔</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">קישור לא תקין</h1>
        <p className="text-slate-600 mb-6">הקישור פג תוקף, כבר נוצל, או אינו תקין.</p>
        <button
          onClick={() => navigate('/', { state: { openLogin: true, openForgot: true } })}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors mb-3"
        >
          בקשת קישור חדש
        </button>
        <button onClick={() => navigate('/')} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
          חזרה לדף הבית
        </button>
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">הסיסמה עודכנה בהצלחה</h1>
        <p className="text-slate-600 mb-6">ניתן להתחבר עם הסיסמה החדשה.</p>
        <button onClick={() => navigate('/')} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
          כניסה למערכת
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔑</div>
          <h1 className="text-2xl font-bold text-slate-800">בחר סיסמה חדשה</h1>
          <p className="text-slate-600 mt-1">הקישור תקף ל-15 דקות ולשימוש חד-פעמי בלבד</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה חדשה</label>
            <input
              type="password" required autoFocus
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="לפחות 8 תווים, אות גדולה וספרה"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">אימות סיסמה</label>
            <input
              type="password" required
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="הזן שוב את הסיסמה"
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
            {rules.map((r, i) => (
              <p key={i} className={r.ok ? 'text-green-600' : 'text-slate-500'}>
                {r.ok ? '✓' : '○'} {r.text}
              </p>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-lg"
          >
            {loading ? 'שומר...' : 'עדכן סיסמה'}
          </button>
        </form>
      </div>
    </div>
  )
}
