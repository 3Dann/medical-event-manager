import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import i18n from '../i18n'

export default function ChangePasswordPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  // כל ה-hooks לפני כל return מותנה
  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (i18n.language !== 'he') i18n.changeLanguage('he')
  }, [])

  const role = user?.role
  const dest = role === 'manager' ? '/manager' : role === 'broker' ? '/broker' : '/patient'

  // Guards — אחרי כל ה-hooks
  if (!user) return <Navigate to="/" replace />
  if (!user.must_change_password) return <Navigate to={dest} replace />

  const validate = () => {
    if (form.password.length < 8)       return 'הסיסמה חייבת להכיל לפחות 8 תווים'
    if (!/[A-Z]/.test(form.password))   return 'הסיסמה חייבת להכיל לפחות אות גדולה אחת'
    if (!/[a-z]/.test(form.password))   return 'הסיסמה חייבת להכיל לפחות אות קטנה אחת'
    if (!/[0-9]/.test(form.password))   return 'הסיסמה חייבת להכיל לפחות ספרה אחת'
    if (form.password !== form.confirm) return 'הסיסמאות אינן תואמות'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      await axios.post('/api/auth/change-required-password', { new_password: form.password })
      setUser(prev => ({ ...prev, must_change_password: false }))
      const saved = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({ ...saved, must_change_password: false }))
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בשינוי הסיסמה. נסה שנית.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            🔐
          </div>
          <h1 className="text-2xl font-bold text-slate-800">שינוי סיסמה נדרש</h1>
          <p className="text-slate-600 mt-2 leading-relaxed">
            קיבלת סיסמה זמנית. יש לבחור סיסמה אישית לפני הכניסה למערכת.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה חדשה</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="לפחות 8 תווים, אות גדולה וספרה"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">אימות סיסמה</label>
            <input
              type="password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="הזן שוב את הסיסמה החדשה"
              required
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
            <p className={form.password.length >= 8       ? 'text-green-600' : ''}>✓ לפחות 8 תווים</p>
            <p className={/[A-Z]/.test(form.password)     ? 'text-green-600' : ''}>✓ אות גדולה באנגלית</p>
            <p className={/[a-z]/.test(form.password)     ? 'text-green-600' : ''}>✓ אות קטנה באנגלית</p>
            <p className={/[0-9]/.test(form.password)     ? 'text-green-600' : ''}>✓ ספרה אחת לפחות</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-lg"
          >
            {loading ? 'שומר...' : 'שמור סיסמה וכנס למערכת'}
          </button>
        </form>
      </div>
    </div>
  )
}
