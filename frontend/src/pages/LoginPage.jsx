import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'manager' })
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetForm, setResetForm] = useState({ token: '', new_password: '', confirm: '' })
  const [forgotStep, setForgotStep] = useState(1) // 1=email, 2=token+password
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [twoFAStep, setTwoFAStep] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAMethod, setTwoFAMethod] = useState('totp')
  const [emailCodeDisplay, setEmailCodeDisplay] = useState('') // only set in dev mode (no real email)
  const [emailSentMsg, setEmailSentMsg] = useState('')
  const [emailCodeReady, setEmailCodeReady] = useState(false)
  const [pendingUser, setPendingUser] = useState(null)

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
      if (res.data.requires_2fa) {
        setTempToken(res.data.temp_token)
        setPendingUser(res.data)
        setTwoFAMethod(res.data.tfa_method || 'totp')
        setTwoFAStep(true)
        setLoading(false)
        return
      }
      login(res.data)
      navigate(res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

  const handle2FAVerify = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/verify-2fa', { temp_token: tempToken, code: twoFACode })
      login(res.data)
      navigate(res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || 'קוד שגוי')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotStep1 = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/forgot-password', { email: forgotEmail })
      setResetToken(res.data.reset_token)
      setForgotStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה')
    } finally { setLoading(false) }
  }

  const handleForgotStep2 = async (e) => {
    e.preventDefault()
    setError('')
    if (resetForm.new_password !== resetForm.confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }
    setLoading(true)
    try {
      await axios.post('/api/auth/reset-password', { email: forgotEmail, token: resetForm.token, new_password: resetForm.new_password })
      setSuccess('הסיסמה עודכנה בהצלחה — ניתן להתחבר')
      setTab('login')
      setForgotStep(1)
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה')
    } finally { setLoading(false) }
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
          <h1 className="text-2xl font-bold text-slate-800">ניהול אירוע רפואי</h1>
          <p className="text-slate-500 text-sm mt-1">ניהול מסע המטופל</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
          {[['login','התחברות'],['register','הרשמה'],['forgot','שכחתי סיסמה']].map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); setForgotStep(1) }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {success && <p className="text-green-700 text-sm bg-green-50 p-3 rounded-lg mb-4">{success}</p>}

        {/* 2FA Step */}
        {twoFAStep && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-800">אימות דו-שלבי</h2>
              <p className="text-sm text-slate-500 mt-1">
                {twoFAMethod === 'email' ? 'אימות באמצעות אימייל' : 'אימות באמצעות אפליקציית אימות'}
              </p>
            </div>
            {twoFAMethod === 'email' && !emailCodeReady && (
              <button type="button" onClick={async () => {
                setLoading(true); setError('')
                try {
                  const r = await axios.post('/api/auth/2fa/request-email-code', { temp_token: tempToken })
                  setEmailCodeReady(true)
                  if (r.data.code) {
                    setEmailCodeDisplay(r.data.code) // dev fallback
                    setEmailSentMsg('מצב פיתוח — קוד מוצג כאן')
                  } else {
                    setEmailSentMsg(r.data.message || `קוד נשלח לאימייל ${r.data.email}`)
                  }
                } catch(e) { setError(e.response?.data?.detail || 'שגיאה') }
                finally { setLoading(false) }
              }} disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'שולח...' : 'שלח קוד לאימייל'}
              </button>
            )}
            {twoFAMethod === 'email' && emailCodeReady && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                {emailCodeDisplay ? (
                  <>
                    <p className="text-xs text-blue-600 mb-1">קוד האימות (מצב פיתוח):</p>
                    <p className="text-2xl font-bold text-blue-800 tracking-widest">{emailCodeDisplay}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-blue-800">✓ {emailSentMsg}</p>
                )}
                <p className="text-xs text-blue-500 mt-1">תוקף: 10 דקות</p>
              </div>
            )}
            <form onSubmit={handle2FAVerify} className="space-y-4">
              <div>
                <label className="label">
                  {twoFAMethod === 'email' ? 'הזן קוד מהאימייל' : 'קוד מאפליקציית האימות'}
                </label>
                <input
                  className="input text-center tracking-widest text-xl"
                  maxLength={6}
                  value={twoFACode}
                  onChange={e => setTwoFACode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="000000"
                  autoFocus={twoFAMethod === 'totp' || !!emailCodeDisplay}
                  required
                />
              </div>
              {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading || twoFACode.length !== 6 || (twoFAMethod === 'email' && !emailCodeReady)} className="btn-primary w-full py-3">
                {loading ? 'מאמת...' : 'אמת קוד'}
              </button>
              <button type="button" onClick={() => { setTwoFAStep(false); setTwoFACode(''); setEmailCodeDisplay(''); setEmailCodeReady(false); setEmailSentMsg(''); setError('') }}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                חזור להתחברות
              </button>
            </form>
          </div>
        )}

        {/* Login / Register */}
        {!twoFAStep && tab !== 'forgot' && (
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
        )}

        {/* Forgot password */}
        {!twoFAStep && tab === 'forgot' && forgotStep === 1 && (
          <form onSubmit={handleForgotStep1} className="space-y-4">
            <p className="text-sm text-slate-600">הזן את האימייל שלך וקבל קוד איפוס.</p>
            <div>
              <label className="label">אימייל</label>
              <input type="email" className="input" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'שולח...' : 'קבל קוד איפוס'}
            </button>
          </form>
        )}

        {!twoFAStep && tab === 'forgot' && forgotStep === 2 && (
          <form onSubmit={handleForgotStep2} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 mb-1">קוד האיפוס שלך:</p>
              <p className="text-2xl font-bold text-blue-800 tracking-widest">{resetToken}</p>
              <p className="text-xs text-blue-500 mt-1">תוקף: שעה אחת</p>
            </div>
            <div>
              <label className="label">קוד האיפוס</label>
              <input className="input text-center tracking-widest uppercase" maxLength={6} value={resetForm.token} onChange={e => setResetForm({...resetForm, token: e.target.value.toUpperCase()})} required />
            </div>
            <div>
              <label className="label">סיסמה חדשה</label>
              <input type="password" className="input" value={resetForm.new_password} onChange={e => setResetForm({...resetForm, new_password: e.target.value})} required />
            </div>
            <div>
              <label className="label">אימות סיסמה</label>
              <input type="password" className="input" value={resetForm.confirm} onChange={e => setResetForm({...resetForm, confirm: e.target.value})} required />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'מעדכן...' : 'עדכן סיסמה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
