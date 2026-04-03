import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (form.new_password !== form.confirm) {
      setStatus({ ok: false, msg: 'הסיסמאות החדשות אינן תואמות' })
      return
    }
    setLoading(true)
    try {
      await axios.put('/api/auth/profile/password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setStatus({ ok: true, msg: 'הסיסמה עודכנה בהצלחה' })
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.detail || 'שגיאה בעדכון' })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">פרופיל</h1>
      <p className="text-slate-500 text-sm mb-8">עדכון סיסמה</p>

      <div className="card mb-6">
        <p className="text-sm text-slate-500">שם</p>
        <p className="font-medium text-slate-800">{user?.full_name}</p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-4">שינוי סיסמה</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">סיסמה נוכחית</label>
            <input type="password" className="input" value={form.current_password}
              onChange={e => setForm({ ...form, current_password: e.target.value })} required />
          </div>
          <div>
            <label className="label">סיסמה חדשה</label>
            <input type="password" className="input" value={form.new_password}
              onChange={e => setForm({ ...form, new_password: e.target.value })} required minLength={6} />
          </div>
          <div>
            <label className="label">אימות סיסמה חדשה</label>
            <input type="password" className="input" value={form.confirm}
              onChange={e => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          {status && (
            <p className={`text-sm p-3 rounded-lg ${status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {status.ok ? '✓ ' : '✗ '}{status.msg}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'מעדכן...' : 'עדכן סיסמה'}
          </button>
        </form>
      </div>
    </div>
  )
}
