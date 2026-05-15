import React, { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { validateIsraeliId } from '../utils/validateId'

const PHONE_PREFIXES = ['050','051','052','053','054','055','056','057','058','059','02','03','04','08','09']

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', role: 'manager',
    id_number: '', phone_prefix: '050', phone: '',
    org_name: '', applicant_message: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // ── 2FA state ──
  const [twoFAStep, setTwoFAStep] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAMethod, setTwoFAMethod] = useState(null)
  const [totpConfigured, setTotpConfigured] = useState(false)
  const [emailCodeDisplay, setEmailCodeDisplay] = useState('')
  const [emailSentMsg, setEmailSentMsg] = useState('')
  const [emailCodeReady, setEmailCodeReady] = useState(false)
  const [totpSetupQR, setTotpSetupQR] = useState('')

  // ── Forgot-password state ──
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStep, setForgotStep] = useState(1) // 1=email, 2=verify, 3=done
  const [extraField, setExtraField] = useState('')   // שאלת אימות מה-backend
  const [idNumber, setIdNumber] = useState('')
  const [extraAnswer, setExtraAnswer] = useState('')

  const resetForgot = () => {
    setForgotStep(1)
    setForgotEmail('')
    setExtraField('')
    setIdNumber('')
    setExtraAnswer('')
  }

  const switchTab = (key) => {
    setTab(key)
    setError('')
    setSuccess('')
    resetForgot()
    setForm(f => ({ ...f, id_number: '', phone: '', org_name: '', applicant_message: '' }))
  }

  // ── Login / Register ──
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
        // ולידציה מקומית לפני שליחה
        if (!form.full_name.trim()) { setError('יש להזין שם מלא'); setLoading(false); return }
        if (form.id_number && validateIsraeliId(form.id_number) === false) {
          setError('מספר ת"ז אינו תקין'); setLoading(false); return
        }
        if (form.phone && form.phone.replace(/\D/g,'').length !== 7) {
          setError('מספר טלפון חייב להכיל 7 ספרות (ללא קידומת)'); setLoading(false); return
        }
        const phone = form.phone ? `${form.phone_prefix}${form.phone.replace(/\D/g,'')}` : undefined
        res = await axios.post('/api/auth/register', {
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          id_number: form.id_number || undefined,
          phone,
          org_name: form.org_name || undefined,
          applicant_message: form.applicant_message || undefined,
        })
      }
      if (res.data.requires_2fa) {
        setTempToken(res.data.temp_token)
        setTotpConfigured(!!res.data.totp_configured)
        setTwoFAMethod(null)
        setTwoFAStep(true)
        setLoading(false)
        return
      }
      login(res.data)
      navigate(res.data.role === 'broker' ? '/broker' : res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

  // ── 2FA Verify ──
  const handle2FAVerify = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/verify-2fa', { temp_token: tempToken, code: twoFACode, method: twoFAMethod })
      login(res.data)
      navigate(res.data.role === 'broker' ? '/broker' : res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || 'חוסר התאמה בזיהוי — נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot — שלב 1: שלח מייל, קבל שאלת אימות ──
  const handleForgotStep1 = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/forgot-password', { email: forgotEmail })
      setExtraField(res.data.extra_field || 'מה שמך המלא?')
      setForgotStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בשליחת הבקשה')
    } finally { setLoading(false) }
  }

  // ── Forgot — שלב 2: אמת זהות, backend שולח לינק ──
  const handleForgotStep2 = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await axios.post('/api/auth/forgot-password/verify', {
        email: forgotEmail,
        id_number: idNumber,
        extra_answer: extraAnswer,
      })
      setForgotStep(3)
    } catch (err) {
      setError(err.response?.data?.detail || 'פרטים שגויים — נסה שנית')
    } finally { setLoading(false) }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
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
        <div role="tablist" className="flex bg-slate-100 rounded-lg p-1 mb-6">
          {[['login','התחברות'],['register','הרשמה'],['forgot','שכחתי סיסמה']].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${tab === key ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {success && <p className="text-green-700 text-sm bg-green-50 p-3 rounded-lg mb-4">{success}</p>}

        {/* ── 2FA ─────────────────────────────────────────────────────────── */}
        {twoFAStep && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-800">אימות דו-שלבי</h2>
              <p className="text-sm text-slate-500 mt-1">בחר כיצד לאמת את זהותך</p>
            </div>

            {twoFAMethod === null && (
              <div className="space-y-2 pt-2">
                <button
                  onClick={async () => {
                    setLoading(true); setError('')
                    try {
                      const r = await axios.post('/api/auth/2fa/request-email-code', { temp_token: tempToken })
                      setTwoFAMethod('email')
                      setEmailCodeReady(true)
                      if (r.data.code) { setEmailCodeDisplay(r.data.code); setEmailSentMsg('מצב פיתוח') }
                      else setEmailSentMsg(r.data.message || `קוד נשלח לאימייל ${r.data.email}`)
                    } catch(e) { setError(e.response?.data?.detail || 'שגיאה בשליחת מייל') }
                    finally { setLoading(false) }
                  }}
                  disabled={loading}
                  className="w-full py-3.5 flex items-center gap-3 px-5 border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors min-h-[52px]"
                >
                  <span className="text-2xl">✉️</span>
                  <div className="text-right flex-1">
                    <p className="font-medium text-slate-800 text-sm">שלח קוד לאימייל ✓</p>
                    <p className="text-xs text-slate-500">קוד חד-פעמי ישלח לכתובת המייל שלך</p>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    setError('')
                    if (totpConfigured) { setTwoFAMethod('totp'); return }
                    setLoading(true)
                    try {
                      const r = await axios.post('/api/auth/2fa/setup-totp-login', { temp_token: tempToken })
                      setTotpSetupQR(r.data.qr_code)
                      setTwoFAMethod('totp')
                    } catch (e) {
                      setError(e.response?.data?.detail || 'שגיאה בהגדרת גוגל אותנטיקייטור')
                    } finally { setLoading(false) }
                  }}
                  disabled={loading}
                  className="w-full py-3.5 flex items-center gap-3 px-5 border-2 border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors min-h-[52px]"
                >
                  <span className="text-2xl">📱</span>
                  <div className="text-right flex-1">
                    <p className="font-medium text-slate-800 text-sm">קוד מגוגל אותנטיקייטור</p>
                    <p className="text-xs text-slate-500">פתח את האפליקציה והזן את הקוד בן 6 הספרות</p>
                  </div>
                </button>

                {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

                <button onClick={() => { setTwoFAStep(false); setError('') }}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                  חזור להתחברות
                </button>
              </div>
            )}

            {twoFAMethod === 'email' && (
              <div className="space-y-3">
                {emailCodeReady && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    {emailCodeDisplay ? (
                      <>
                        <p className="text-xs text-blue-600 mb-1">קוד אימות (מצב פיתוח):</p>
                        <p className="text-3xl font-bold text-blue-800 tracking-widest font-mono">{emailCodeDisplay}</p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-blue-800">✓ {emailSentMsg}</p>
                    )}
                    <p className="text-xs text-blue-500 mt-1.5">תוקף: 10 דקות</p>
                  </div>
                )}
                <form onSubmit={handle2FAVerify} className="space-y-3">
                  <div>
                    <label className="label">הזן את הקוד מהאימייל</label>
                    <input
                      className="input text-center tracking-widest text-xl"
                      maxLength={8}
                      value={twoFACode}
                      onChange={e => setTwoFACode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="XXXXXXXX"
                      autoFocus
                      required
                    />
                  </div>
                  {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
                  <button type="submit" disabled={loading || twoFACode.length < 8} className="btn-primary w-full py-3">
                    {loading ? 'מאמת...' : 'אמת קוד'}
                  </button>
                  <button type="button"
                    onClick={() => { setTwoFAMethod(null); setTwoFACode(''); setEmailCodeDisplay(''); setEmailCodeReady(false); setEmailSentMsg(''); setError('') }}
                    className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                    חזור לבחירת שיטה
                  </button>
                </form>
              </div>
            )}

            {twoFAMethod === 'totp' && (
              <form onSubmit={handle2FAVerify} className="space-y-3">
                {totpSetupQR && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-2">
                    <p className="text-xs font-medium text-slate-700">סרוק עם גוגל אותנטיקייטור</p>
                    <img src={totpSetupQR} alt="QR Code" className="mx-auto w-40 h-40" />
                    <p className="text-xs text-slate-500">לאחר הסריקה הזן את הקוד בן 6 הספרות</p>
                  </div>
                )}
                <div>
                  <label className="label">קוד מגוגל אותנטיקייטור</label>
                  <input
                    className="input text-center tracking-widest text-2xl"
                    maxLength={6}
                    value={twoFACode}
                    onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    required
                  />
                </div>
                {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
                <button type="submit" disabled={loading || twoFACode.length !== 6} className="btn-primary w-full py-3">
                  {loading ? 'מאמת...' : 'אמת קוד'}
                </button>
                <button type="button"
                  onClick={() => { setTwoFAMethod(null); setTwoFACode(''); setTotpSetupQR(''); setError('') }}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                  חזור לבחירת שיטה
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Login / Register ─────────────────────────────────────────────── */}
        {!twoFAStep && tab !== 'forgot' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="label">שם מלא <span className="text-red-500">*</span></label>
                <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="ישראל ישראלי" />
              </div>
            )}
            <div>
              <label className="label">אימייל <span className="text-red-500">*</span></label>
              <input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div>
              <label className="label">סיסמה <span className="text-red-500">*</span></label>
              <input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
            </div>
            {tab === 'register' && (<>
              {/* ת"ז */}
              <div>
                <label className="label">
                  מספר תעודת זהות
                  <span className="text-slate-400 font-normal text-xs mr-1">(לבדיקת זהות — לא יועבר לצד שלישי)</span>
                </label>
                <input
                  className={`input text-left tracking-widest ${
                    form.id_number && validateIsraeliId(form.id_number) === false
                      ? 'border-red-400' : form.id_number && validateIsraeliId(form.id_number)
                      ? 'border-green-400' : ''
                  }`}
                  inputMode="numeric"
                  maxLength={9}
                  value={form.id_number}
                  onChange={e => setForm({...form, id_number: e.target.value.replace(/\D/g,'')})}
                  placeholder="000000000"
                />
                {form.id_number && validateIsraeliId(form.id_number) === false && (
                  <p className="text-red-500 text-xs mt-1">מספר ת"ז לא תקין</p>
                )}
                {form.id_number && validateIsraeliId(form.id_number) === true && (
                  <p className="text-green-600 text-xs mt-1">✓ ת"ז תקין</p>
                )}
              </div>

              {/* טלפון */}
              <div>
                <label className="label">טלפון</label>
                <div className="flex gap-2">
                  <select
                    className="input w-24 flex-shrink-0 text-center"
                    value={form.phone_prefix}
                    onChange={e => setForm({...form, phone_prefix: e.target.value})}
                  >
                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    className="input flex-1 text-left tracking-widest"
                    inputMode="numeric"
                    maxLength={7}
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value.replace(/\D/g,'')})}
                    placeholder="1234567"
                  />
                </div>
              </div>

              {/* תפקיד */}
              <div>
                <label className="label">תפקיד</label>
                <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  <option value="manager">מנהל אירוע רפואי</option>
                  <option value="patient">מטופל</option>
                </select>
              </div>

              {/* ארגון */}
              <div>
                <label className="label">ארגון / מוסד <span className="text-slate-400 font-normal text-xs mr-1">(אופציונלי)</span></label>
                <input className="input" value={form.org_name} onChange={e => setForm({...form, org_name: e.target.value})} placeholder="שם הארגון שאתה מייצג" />
              </div>

              {/* הודעה לאדמין */}
              <div>
                <label className="label">הערה לאדמין <span className="text-slate-400 font-normal text-xs mr-1">(אופציונלי)</span></label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.applicant_message}
                  onChange={e => setForm({...form, applicant_message: e.target.value})}
                  placeholder="מי שלח אותך, במה תשתמש במערכת..."
                />
              </div>
            </>)}

            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? 'מתחבר...' : tab === 'login' ? 'התחברות' : 'שלח בקשת הרשמה'}
            </button>
          </form>
        )}

        {/* ── Forgot — שלב 1: הזן מייל ──────────────────────────────────── */}
        {!twoFAStep && tab === 'forgot' && forgotStep === 1 && (
          <form onSubmit={handleForgotStep1} className="space-y-4">
            <p className="text-sm text-slate-600">הזן את האימייל שלך. תישאל שאלת אימות כדי לאמת את זהותך.</p>
            <div>
              <label className="label">אימייל</label>
              <input type="email" className="input" value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)} required autoFocus />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'שולח...' : 'המשך'}
            </button>
          </form>
        )}

        {/* ── Forgot — שלב 2: אמת זהות ───────────────────────────────────── */}
        {!twoFAStep && tab === 'forgot' && forgotStep === 2 && (
          <form onSubmit={handleForgotStep2} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium mb-0.5">אימות זהות</p>
              <p className="text-sm text-blue-800">ענה על השאלות הבאות כדי לאמת שזה החשבון שלך.</p>
            </div>
            <div>
              <label className="label">מספר תעודת זהות</label>
              <input
                className="input text-left tracking-widest"
                inputMode="numeric"
                maxLength={9}
                value={idNumber}
                onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="000000000"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">{extraField}</label>
              <input
                className="input"
                value={extraAnswer}
                onChange={e => setExtraAnswer(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading || !idNumber || !extraAnswer} className="btn-primary w-full py-3">
              {loading ? 'בודק...' : 'שלח קישור לאיפוס'}
            </button>
            <button type="button" onClick={() => { setForgotStep(1); setError('') }}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
              חזור
            </button>
          </form>
        )}

        {/* ── Forgot — שלב 3: נשלח ────────────────────────────────────────── */}
        {!twoFAStep && tab === 'forgot' && forgotStep === 3 && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">קישור נשלח!</h3>
              <p className="text-sm text-slate-600">
                בדוק את תיבת הדואר של <span className="font-medium">{forgotEmail}</span>.<br />
                הקישור לאיפוס סיסמה בתוקף ל-15 דקות.
              </p>
            </div>
            <button onClick={() => switchTab('login')} className="btn-primary w-full py-3">
              חזור להתחברות
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
