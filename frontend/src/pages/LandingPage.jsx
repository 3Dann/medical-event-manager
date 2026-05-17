import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import PasskeyLoginButton from '../components/PasskeyLoginButton'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useTranslation } from 'react-i18next'
import { getLandingOverrides, LANDING_DEFAULTS } from '../components/LandingEditor'

// Returns translated value when override matches the Hebrew default (not customized by admin)
function ovOrT(overrides, field, tVal) {
  const val = overrides[field]
  const def = LANDING_DEFAULTS[field]
  return (val && val !== def) ? val : tVal
}

// ── Login Modal ───────────────────────────────────────────────────────────────
function LoginModal({ onClose, initialTab = 'login' }) {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const { t } = useTranslation()

  const [tab, setTab]                 = useState(initialTab)
  const [form, setForm]               = useState({ email: '', password: '', full_name: '', role: 'manager', org_name: '', applicant_message: '', id_number: '', phone: '' })
  const [forgotEmail, setForgotEmail]   = useState('')
  const [resetForm, setResetForm]       = useState({ token: '', new_password: '', confirm: '' })
  const [forgotStep, setForgotStep]     = useState(1)
  const [resetToken, setResetToken]     = useState('')
  const [extraField, setExtraField]     = useState('')
  const [idNumber, setIdNumber]         = useState('')
  const [extraAnswer, setExtraAnswer]   = useState('')
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [twoFAStep,        setTwoFAStep]        = useState(false)
  const [tempToken,        setTempToken]        = useState('')
  const [twoFACode,        setTwoFACode]        = useState('')
  const [twoFAMethod,      setTwoFAMethod]      = useState(null)   // null = choice screen
  const [totpConfigured,   setTotpConfigured]   = useState(false)
  const [totpSetupQR,      setTotpSetupQR]      = useState('')
  const [emailCodeDisplay, setEmailCodeDisplay] = useState('')
  const [emailSentMsg,     setEmailSentMsg]     = useState('')
  const [emailCodeReady,   setEmailCodeReady]   = useState(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const switchTab = (t) => { setTab(t); setError(''); setSuccess(''); setForgotStep(1); setIdNumber(''); setExtraAnswer(''); setExtraField('') }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      let res
      if (tab === 'login') {
        const params = new URLSearchParams()
        params.append('username', form.email)
        params.append('password', form.password)
        res = await axios.post('/api/auth/login', params)
      } else {
        // client-side password strength check before sending
        const pwd = form.password
        if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
          setError('הסיסמה חייבת להכיל לפחות 8 תווים, אות גדולה באנגלית, אות קטנה וספרה')
          setLoading(false)
          return
        }
        res = await axios.post('/api/auth/register', {
          full_name: form.full_name, email: form.email,
          password: form.password, role: form.role,
          org_name: form.org_name || null,
          applicant_message: form.applicant_message || null,
          id_number: form.id_number || null,
          phone: form.phone || null,
        })
        if (res.data.pending) {
          setSuccess('בקשתך התקבלה! נשלח אליך מייל לאחר אישור האדמין.')
          setForm({ email: '', password: '', full_name: '', role: 'manager', org_name: '', applicant_message: '', id_number: '', phone: '' })
          return
        }
      }
      if (res.data.requires_2fa) {
        setTempToken(res.data.temp_token)
        setTotpConfigured(!!res.data.totp_configured)
        setTwoFAMethod(null)
        setTwoFAStep(true)
        return
      }
      login(res.data)
      navigate(res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || t('auth:error_login'))
    } finally { setLoading(false) }
  }

  const handle2FAVerify = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await axios.post('/api/auth/verify-2fa', { temp_token: tempToken, code: twoFACode, method: twoFAMethod })
      login(res.data)
      navigate(res.data.role === 'manager' ? '/manager' : '/patient')
    } catch (err) {
      setError(err.response?.data?.detail || t('auth:error_wrong_code'))
    } finally { setLoading(false) }
  }

  const handleForgotStep1 = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await axios.post('/api/auth/forgot-password', { email: forgotEmail })
      setExtraField(res.data.extra_field || '')
      setIdNumber('')
      setExtraAnswer('')
      setForgotStep('1b')
    } catch (err) { setError(err.response?.data?.detail || t('common:error')) }
    finally { setLoading(false) }
  }

  const handleForgotVerify = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await axios.post('/api/auth/forgot-password/verify', {
        email: forgotEmail,
        id_number: idNumber,
        extra_answer: extraAnswer,
      })
      setForgotStep(2)
    } catch (err) {
      const detail = err.response?.data?.detail || t('common:error')
      setError(detail)
    } finally { setLoading(false) }
  }

  const handleForgotStep2 = async (e) => {
    e.preventDefault(); setError('')
    if (resetForm.new_password !== resetForm.confirm) { setError(t('auth:passwords_mismatch')); return }
    setLoading(true)
    try {
      await axios.post('/api/auth/reset-password', {
        email: forgotEmail, token: resetForm.token, new_password: resetForm.new_password,
      })
      setSuccess(t('auth:password_updated'))
      switchTab('login')
    } catch (err) { setError(err.response?.data?.detail || t('common:error')) }
    finally { setLoading(false) }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 z-10 max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">{t('landing:hero_title')}</h2>
          <p className="text-slate-500 text-sm mt-0.5">{t('landing:login_modal_title')}</p>
        </div>

        {/* Tabs */}
        {!twoFAStep && (
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
            {[['login', t('auth:login')],['register', t('auth:register')],['forgot', t('auth:forgot_password')]].map(([tabKey, label]) => (
              <button key={tabKey} onClick={() => switchTab(tabKey)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === tabKey ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {success && <p className="text-green-700 text-sm bg-green-50 p-3 rounded-lg mb-4">{success}</p>}

        {/* ── 2FA Step ── */}
        {twoFAStep && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800">{t('auth:two_fa_title')}</h3>
              <p className="text-sm text-slate-500 mt-1">בחר כיצד לאמת את זהותך</p>
            </div>

            {/* ── בחירת שיטה ── */}
            {twoFAMethod === null && (
              <div className="space-y-2">
                <button onClick={async () => {
                  setLoading(true); setError('')
                  try {
                    const r = await axios.post('/api/auth/2fa/request-email-code', { temp_token: tempToken })
                    setTwoFAMethod('email')
                    setEmailCodeReady(true)
                    if (r.data.code) { setEmailCodeDisplay(r.data.code) }
                    else setEmailSentMsg(r.data.message || `קוד נשלח לאימייל`)
                  } catch(e) { setError(e.response?.data?.detail || t('common:error')) }
                  finally { setLoading(false) }
                }} disabled={loading}
                  className="w-full py-3.5 flex items-center gap-3 px-5 border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors min-h-[52px]">
                  <span className="text-2xl">✉️</span>
                  <div className="text-right flex-1">
                    <p className="font-medium text-slate-800 text-sm">שלח קוד לאימייל</p>
                    <p className="text-xs text-slate-500">קוד חד-פעמי ישלח לכתובת המייל שלך</p>
                  </div>
                </button>

                <button onClick={async () => {
                  setError('')
                  if (totpConfigured) { setTwoFAMethod('totp'); return }
                  setLoading(true)
                  try {
                    const r = await axios.post('/api/auth/2fa/setup-totp-login', { temp_token: tempToken })
                    setTotpSetupQR(r.data.qr_code)
                    setTwoFAMethod('totp')
                  } catch(e) { setError(e.response?.data?.detail || 'שגיאה בהגדרת גוגל אותנטיקייטור') }
                  finally { setLoading(false) }
                }} disabled={loading}
                  className="w-full py-3.5 flex items-center gap-3 px-5 border-2 border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors min-h-[52px]">
                  <span className="text-2xl">📱</span>
                  <div className="text-right flex-1">
                    <p className="font-medium text-slate-800 text-sm">קוד מגוגל אותנטיקייטור</p>
                    <p className="text-xs text-slate-500">פתח את האפליקציה והזן את הקוד בן 6 הספרות</p>
                  </div>
                </button>

                {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
                <button onClick={() => { setTwoFAStep(false); setError('') }}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                  {t('auth:back_to_login')}
                </button>
              </div>
            )}

            {/* ── קוד מייל ── */}
            {twoFAMethod === 'email' && (
              <div className="space-y-3">
                {emailCodeReady && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    {emailCodeDisplay ? (
                      <><p className="text-xs text-blue-600 mb-1">קוד האימות (מצב פיתוח):</p>
                      <p className="text-2xl font-bold text-blue-800 tracking-widest font-mono">{emailCodeDisplay}</p></>
                    ) : (
                      <p className="text-sm font-medium text-blue-800">✓ {emailSentMsg}</p>
                    )}
                    <p className="text-xs text-blue-500 mt-1">{t('auth:validity_10min')}</p>
                  </div>
                )}
                <form onSubmit={handle2FAVerify} className="space-y-3">
                  <div>
                    <label className="label">הזן את הקוד מהאימייל</label>
                    <input className="input text-center tracking-widest text-xl" maxLength={8}
                      value={twoFACode}
                      onChange={e => setTwoFACode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="XXXXXXXX" autoFocus required />
                  </div>
                  {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
                  <button type="submit" disabled={loading || twoFACode.length < 8}
                    className="btn-primary w-full py-3">
                    {loading ? t('auth:verifying') : t('auth:verify_code')}
                  </button>
                  <button type="button" onClick={() => { setTwoFAMethod(null); setTwoFACode(''); setEmailCodeDisplay(''); setEmailCodeReady(false); setEmailSentMsg(''); setError('') }}
                    className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                    חזור לבחירת שיטה
                  </button>
                </form>
              </div>
            )}

            {/* ── קוד TOTP ── */}
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
                  <input className="input text-center tracking-widest text-2xl" maxLength={6}
                    value={twoFACode}
                    onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoFocus required />
                </div>
                {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
                <button type="submit" disabled={loading || twoFACode.length !== 6}
                  className="btn-primary w-full py-3">
                  {loading ? t('auth:verifying') : t('auth:verify_code')}
                </button>
                <button type="button" onClick={() => { setTwoFAMethod(null); setTwoFACode(''); setTotpSetupQR(''); setError('') }}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
                  חזור לבחירת שיטה
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Login / Register ── */}
        {!twoFAStep && tab !== 'forgot' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div><label className="label">{t('auth:full_name')}</label>
                <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required /></div>
            )}
            <div><label className="label">{tab === 'login' ? t('auth:email_or_id') : t('auth:email')}</label>
              <input type={tab === 'login' ? 'text' : 'email'} className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
            <div><label className="label">{t('auth:password')}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className="input w-full pl-10" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div></div>
            {tab === 'register' && (
              <div><label className="label">{t('auth:role')}</label>
                <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  <option value="manager">{t('auth:role_manager')}</option>
                  <option value="patient">{t('auth:role_patient')}</option>
                </select></div>
            )}
            {tab === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">מספר ת"ז <span className="text-slate-400 text-xs">(אופציונלי)</span></label>
                  <input
                    className="input"
                    maxLength={9}
                    inputMode="numeric"
                    placeholder="123456782"
                    value={form.id_number}
                    onChange={e => setForm({...form, id_number: e.target.value.replace(/\D/g, '')})}
                  />
                </div>
                <div>
                  <label className="label">טלפון <span className="text-slate-400 text-xs">(אופציונלי)</span></label>
                  <input
                    className="input"
                    inputMode="tel"
                    placeholder="0501234567"
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value.replace(/[^\d+]/g, '')})}
                  />
                </div>
              </div>
            )}
            {tab === 'register' && (() => {
              const pwd = form.password
              const checks = [
                pwd.length >= 8,
                /[A-Z]/.test(pwd),
                /[a-z]/.test(pwd),
                /[0-9]/.test(pwd),
              ]
              const strength = checks.filter(Boolean).length
              if (!pwd) return null
              const colors = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500']
              const labels = ['', 'חלשה', 'בינונית', 'טובה', 'חזקה']
              return (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? colors[strength] : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  <div className="flex gap-3 text-[11px] text-slate-500 flex-wrap">
                    <span className={checks[0] ? 'text-green-600' : 'text-slate-400'}>8+ תווים</span>
                    <span className={checks[1] ? 'text-green-600' : 'text-slate-400'}>אות גדולה</span>
                    <span className={checks[2] ? 'text-green-600' : 'text-slate-400'}>אות קטנה</span>
                    <span className={checks[3] ? 'text-green-600' : 'text-slate-400'}>ספרה</span>
                    <span className={`font-medium ${strength === 4 ? 'text-green-600' : 'text-slate-500'}`}>{labels[strength]}</span>
                  </div>
                </div>
              )
            })()}
            {tab === 'register' && (
              <div><label className="label">שם ארגון / מרפאה <span className="text-slate-400 text-xs">(אופציונלי)</span></label>
                <input className="input" value={form.org_name} onChange={e => setForm({...form, org_name: e.target.value})} placeholder="לדוגמה: מרפאת הדסה, אסף הרופא..." /></div>
            )}
            {tab === 'register' && (
              <div><label className="label">הערה <span className="text-slate-400 text-xs">(אופציונלי)</span></label>
                <textarea className="input resize-none" rows={3} value={form.applicant_message} onChange={e => setForm({...form, applicant_message: e.target.value})} placeholder="ספר לנו בקצרה על עצמך" /></div>
            )}
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? t('common:saving') : tab === 'login' ? t('auth:login') : t('auth:register')}
            </button>
            {tab === 'login' && (
              <PasskeyLoginButton
                email={form.email}
                onSuccess={(data) => { login(data); navigate(data.role === 'manager' ? '/manager' : '/patient') }}
                onError={(msg) => setError(msg)}
              />
            )}
          </form>
        )}

        {/* ── Forgot password ── */}
        {!twoFAStep && tab === 'forgot' && forgotStep === 1 && (
          <form onSubmit={handleForgotStep1} className="space-y-4">
            <p className="text-sm text-slate-600">{t('auth:forgot_password')}</p>
            <div><label className="label">{t('auth:email')}</label>
              <input type="email" className="input" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required /></div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? t('common:loading') : t('auth:send_code')}
            </button>
          </form>
        )}
        {!twoFAStep && tab === 'forgot' && forgotStep === '1b' && (
          <form onSubmit={handleForgotVerify} className="space-y-4" dir="rtl">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              אמת את זהותך כדי להמשיך בשחזור הסיסמה
            </div>
            <div>
              <label className="label">מספר זהות (ת.ז)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="input"
                value={idNumber}
                onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                maxLength={9}
                required
              />
            </div>
            <div>
              <label className="label">{extraField}</label>
              <input
                type="text"
                className="input"
                value={extraAnswer}
                onChange={e => setExtraAnswer(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? t('common:loading') : 'אמת זהות'}
            </button>
            <button type="button" onClick={() => { setForgotStep(1); setError('') }}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
              חזור
            </button>
          </form>
        )}
        {!twoFAStep && tab === 'forgot' && forgotStep === 2 && (
          <div className="space-y-4 text-center">
            <div className="text-5xl mb-2">📬</div>
            <h3 className="font-bold text-slate-800 text-lg">קישור נשלח לאימייל שלך</h3>
            <p className="text-slate-600 leading-relaxed">
              בדוק את תיבת הדואר שלך ולחץ על הקישור לאיפוס הסיסמה.<br />
              הקישור תקף ל-15 דקות בלבד.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
              לא קיבלת מייל? בדוק בתיקיית ספאם, או חזור ונסה שנית.
            </div>
            <button onClick={() => switchTab('login')} className="btn-secondary w-full py-2.5 mt-2">
              חזרה לכניסה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── FEATURE meta (non-translatable props only) ───────────────────────────────
const FEATURE_META = [
  { id: 'journey',    icon: '🗺️',  color: 'from-blue-500 to-blue-600',    ring: 'border-blue-200',    text: 'text-blue-700'    },
  { id: 'doctors',    icon: '👨‍⚕️', color: 'from-emerald-500 to-emerald-600', ring: 'border-emerald-200', text: 'text-emerald-700' },
  { id: 'insurance',  icon: '🛡️',  color: 'from-violet-500 to-violet-600', ring: 'border-violet-200', text: 'text-violet-700'  },
  { id: 'strategy',   icon: '💡',  color: 'from-amber-500 to-amber-600',   ring: 'border-amber-200',  text: 'text-amber-700'   },
  { id: 'responsive', icon: '⭐',  color: 'from-rose-500 to-rose-600',     ring: 'border-rose-200',   text: 'text-rose-700'    },
  { id: 'security',   icon: '🔒',  color: 'from-slate-600 to-slate-700',   ring: 'border-slate-200',  text: 'text-slate-700'   },
]

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ onLoginClick, onRegisterClick }) {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const { t }       = useTranslation()
  const [open, setOpen] = useState(false)

  const navLinks = [
    { label: t('landing:feat_journey'),    href: '#journey'    },
    { label: t('nav:doctors'),             href: '#doctors'    },
    { label: t('landing:feat_insurance'),  href: '#insurance'  },
    { label: t('landing:feat_strategy'),   href: '#strategy'   },
    { label: t('nav:responsiveness'),      href: '#responsive' },
    { label: t('landing:feat_security'),   href: '#security'   },
  ]

  const scrollTo = (href) => {
    setOpen(false)
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className="fixed top-0 right-0 left-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800 text-sm leading-tight">{t('landing:hero_title')}</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navLinks.map(l => (
              <button key={l.href} onClick={() => scrollTo(l.href)}
                className="text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                {l.label}
              </button>
            ))}
          </div>

          {/* Language Switcher + CTA */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user ? (
              <button onClick={() => navigate(user.role === 'patient' ? '/patient' : '/manager')}
                className="btn-primary text-sm py-1.5 px-4 whitespace-nowrap">
                {user.role === 'patient' ? t('patient_portal:title') : t('nav:dashboard')} ←
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={onRegisterClick} className="text-sm py-1.5 px-4 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                  {t('auth:register')}
                </button>
                <button onClick={onLoginClick} className="btn-primary text-sm py-1.5 px-4 whitespace-nowrap">
                  {t('auth:login')}
                </button>
              </div>
            )}
            <button onClick={() => setOpen(v => !v)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="lg:hidden border-t border-slate-100 py-3 space-y-0.5">
            {navLinks.map(l => (
              <button key={l.href} onClick={() => scrollTo(l.href)}
                className="w-full text-right text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors block">
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate           = useNavigate()
  const location           = useLocation()
  const { user }           = useAuth()
  const { t, i18n }        = useTranslation()
  const [showLogin, setShowLogin]   = useState(false)
  const [loginTab,  setLoginTab]    = useState('login')
  const [overrides, setOverrides]   = useState(() => getLandingOverrides(i18n.language))

  // Reload overrides when language changes
  useEffect(() => {
    setOverrides(getLandingOverrides(i18n.language))
  }, [i18n.language])

  // Fetch overrides from backend on load; cache in localStorage for next visit
  useEffect(() => {
    axios.get('/api/settings/landing').then(res => {
      const data = res.data
      if (data && Object.keys(data).length > 0) {
        localStorage.setItem('landing_overrides', JSON.stringify(data))
        setOverrides(getLandingOverrides(i18n.language))
      }
    }).catch(() => { /* use localStorage fallback */ })
  }, [])

  useEffect(() => {
    const handler = () => setOverrides(getLandingOverrides(i18n.language))
    window.addEventListener('landing_overrides_changed', handler)
    return () => window.removeEventListener('landing_overrides_changed', handler)
  }, [i18n.language])

  const FEATURES = FEATURE_META.map((m, i) => {
    const ov  = overrides.features?.[i]
    const def = LANDING_DEFAULTS.features?.[i]
    return {
      ...m,
      title:  (ov?.title  && ov.title  !== def?.title)  ? ov.title  : t(`landing:feat_${m.id}`),
      desc:   (ov?.desc   && ov.desc   !== def?.desc)   ? ov.desc   : t(`landing:feat_${m.id}_desc`),
      points: (ov?.points && JSON.stringify(ov.points) !== JSON.stringify(def?.points)) ? ov.points : [
        t(`landing:feat_${m.id}_p1`),
        t(`landing:feat_${m.id}_p2`),
        t(`landing:feat_${m.id}_p3`),
        t(`landing:feat_${m.id}_p4`),
      ],
    }
  })

  const isDefaultSteps = JSON.stringify(overrides.steps) === JSON.stringify(LANDING_DEFAULTS.steps)
  const STEPS = isDefaultSteps ? [
    { num: '01', title: t('landing:step1_title'), desc: t('landing:step1_desc') },
    { num: '02', title: t('landing:step2_title'), desc: t('landing:step2_desc') },
    { num: '03', title: t('landing:step3_title'), desc: t('landing:step3_desc') },
  ] : overrides.steps

  // If navigated here from /login redirect, open modal immediately
  useEffect(() => {
    if (location.state?.openLogin) setShowLogin(true)
  }, [location.state])

  const openLogin    = () => { setLoginTab('login');    setShowLogin(true) }
  const openRegister = () => { setLoginTab('register'); setShowLogin(true) }
  const closeLogin   = () => setShowLogin(false)
  const toDashboard  = () => navigate(user?.role === 'patient' ? '/patient' : '/manager')

  return (
    <div className="min-h-screen bg-white">
      <Navbar onLoginClick={openLogin} onRegisterClick={openRegister} />
      {showLogin && <LoginModal onClose={closeLogin} initialTab={loginTab} />}

      {/* ── Hero ── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-blue-600 via-blue-700 to-slate-800" />
        <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-600 rounded-full opacity-20 blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 text-sm px-4 py-1.5 rounded-full mb-6 border border-white/20">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {ovOrT(overrides, 'heroBadge', t('landing:hero_badge'))}
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
            {ovOrT(overrides, 'heroTitle', t('landing:hero_title'))}
          </h1>
          <p className="text-blue-100 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {ovOrT(overrides, 'heroSubtitle', t('landing:hero_subtitle'))}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user && (
              <button onClick={toDashboard}
                className="bg-white text-blue-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base whitespace-nowrap">
                {user.role === 'patient' ? t('patient_portal:title') : t('nav:dashboard')} ←
              </button>
            )}
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="border border-white/30 text-white font-medium px-8 py-3.5 rounded-xl hover:bg-white/10 transition-colors text-base">
              {t('landing:discover_features')}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {overrides.stats.map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-3xl font-bold text-white">{s.val}</p>
                  <p className="text-blue-200 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
          </div>
        </div>
        <svg viewBox="0 0 1440 60" className="w-full block" preserveAspectRatio="none" style={{ height: 60 }}>
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" fill="white" />
        </svg>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 max-w-5xl mx-auto px-6">
        <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">{t('landing:how_it_works')}</p>
        <h2 className="text-3xl font-bold text-slate-800 text-center mb-12">{ovOrT(overrides, 'stepsTitle', t('landing:three_steps'))}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div key={step.num} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4 shadow-md">
                {step.num}
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-2">{step.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ── */}
      <section id="features" className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">{t('landing:features_label')}</p>
          <h2 className="text-3xl font-bold text-slate-800 text-center mb-12">{ovOrT(overrides, 'featuresTitle', t('landing:all_features'))}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.id} id={f.id} className={`bg-white rounded-2xl border ${f.ring} p-6 hover:shadow-md transition-shadow`}>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-2xl mb-4 shadow-sm`}>
                  {f.icon}
                </div>
                <h3 className={`text-lg font-bold ${f.text} mb-2`}>{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{f.desc}</p>
                <ul className="space-y-1.5">
                  {f.points.map(p => (
                    <li key={p} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gradient-to-br ${f.color}`} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-gradient-to-bl from-blue-600 to-slate-800 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white mb-4">{ovOrT(overrides, 'ctaTitle', t('landing:cta_title'))}</h2>
          <p className="text-blue-200 mb-8 text-lg">{ovOrT(overrides, 'ctaSubtitle', t('landing:cta_subtitle'))}</p>
          {user ? (
            <button onClick={toDashboard}
              className="bg-white text-blue-700 font-semibold px-10 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-base">
              {user.role === 'patient' ? t('landing:go_to_journey') : t('landing:go_to_dashboard')}
            </button>
          ) : (
            <p className="text-blue-300 text-sm">
              {t('landing:login_hint_before')} <span className="text-white font-medium">{t('landing:hero_cta')}</span> {t('landing:login_hint_after')}
            </p>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="text-slate-300 font-medium text-sm">{t('landing:hero_title')}</span>
          </div>
          <p className="text-xs text-slate-500">Orly Medical © {new Date().getFullYear()}</p>
          <div className="flex gap-4 text-xs">
            {[
              { label: t('landing:feat_journey'),   href: '#journey'   },
              { label: t('nav:doctors'),            href: '#doctors'   },
              { label: t('landing:feat_insurance'), href: '#insurance' },
              { label: t('landing:feat_strategy'),  href: '#strategy'  },
            ].map(l => (
              <button key={l.href} onClick={() => document.getElementById(l.href.slice(1))?.scrollIntoView({ behavior: 'smooth' })}
                className="hover:text-slate-200 transition-colors">{l.label}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
