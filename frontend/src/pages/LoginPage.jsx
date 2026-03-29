import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'manager' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let res
      if (tab === 'login') {
        const params = new URLSearchParams()
        params.append('username', form.email)
        params.append('password', form.password)
        res = await axios.post('/api/auth/login', params)
      } else {
        res = await axios.post('/api/auth/register', { full_name: form.full_name, email: form.email, password: form.password, role: form.role })
      }
      login(res.data)
      navigate(res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">מנהל האירוע הרפואי</h1>
          <p className="text-slate-500 text-sm mt-1">ניהול מסע המטופל</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>
              {t === 'login' ? 'התחברות' : 'הרשמה'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="label">שם מלא</label>
              <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
            </div>
          )}
          <div>
            <label className="label">אימייל</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          </div>
          <div>
            <label className="label">סיסמה</label>
            <input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          </div>
          {tab === 'register' && (
            <div>
              <label className="label">תפקיד</label>
              <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="manager">מנהל אירוע רפואי</option>
                <option value="patient">מטופל</option>
              </select>
            </div>
          )}
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'מתחבר...' : tab === 'login' ? 'התחברות' : 'הרשמה'}
          </button>
        </form>
      </div>
    </div>
  )
}
