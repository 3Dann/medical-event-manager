import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import PasskeySection from '../../components/PasskeySection'

function TwoFASection() {
  const [status, setStatus] = useState(null) // {totp_enabled, totp_method}
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('idle') // idle | setup-totp | setup-email | confirm-totp | confirm-email
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const r = await axios.get('/api/auth/2fa/status')
      setStatus(r.data)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const startTOTP = async () => {
    setMsg(null); setCode('')
    try {
      const r = await axios.post('/api/auth/2fa/setup')
      setQrCode(r.data.qr_code)
      setSecret(r.data.secret)
      setView('confirm-totp')
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' }) }
  }

  const confirmTOTP = async (e) => {
    e.preventDefault(); setMsg(null)
    try {
      await axios.post('/api/auth/2fa/confirm', { code })
      setMsg({ ok: true, text: 'אימות דו-שלבי (QR) הופעל' })
      setView('idle'); setCode('')
      load()
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'קוד שגוי' }) }
  }

  const startEmail = async () => {
    setMsg(null); setCode('')
    try {
      const r = await axios.post('/api/auth/2fa/setup-email')
      // r.data.code is only set in dev mode (no SMTP configured)
      setEmailCode(r.data.code ? `DEV: ${r.data.code}` : r.data.message)
      setView('confirm-email')
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' }) }
  }

  const confirmEmail = async (e) => {
    e.preventDefault(); setMsg(null)
    try {
      await axios.post('/api/auth/2fa/confirm-email', { code })
      setMsg({ ok: true, text: 'אימות דו-שלבי (אימייל) הופעל' })
      setView('idle'); setCode(''); setEmailCode('')
      load()
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'קוד שגוי' }) }
  }


if (loading) return <div className="card"><p className="text-slate-400 text-sm">טוען...</p></div>

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-800 mb-1">אימות דו-שלבי</h2>
      <p className="text-sm text-slate-500 mb-4">
        אימות דו-שלבי נדרש תמיד. ניתן לבחור בין QR (ברירת מחדל) לאימות אימייל.
      </p>

      {msg && (
        <p className={`text-sm p-3 rounded-lg mb-4 ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}

      {view === 'idle' && (
        <div className="space-y-2">
          {!status?.totp_enabled ? (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-amber-800 font-medium">אימות דו-שלבי נדרש</p>
                <p className="text-xs text-amber-700 mt-1">בחר שיטת אימות להפעלה:</p>
              </div>
              <button onClick={startTOTP} className="btn-primary w-full py-2 text-sm">
                הפעל אימות QR (מומלץ)
              </button>
              <button onClick={startEmail} className="w-full py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50">
                הפעל אימות אימייל
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-1">
                <p className="text-sm text-green-800 font-medium">✓ אימות דו-שלבי פעיל</p>
                <p className="text-xs text-green-700 mt-1">שיטה: {status.totp_method === 'email' ? 'אימייל' : 'אפליקציית QR (TOTP)'}</p>
              </div>
              <button onClick={() => { setMsg(null); setCode(''); status.totp_method === 'email' ? startTOTP() : startEmail() }}
                className="w-full py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                החלף שיטה ל-{status.totp_method === 'email' ? 'QR (TOTP)' : 'אימייל'}
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'confirm-totp' && (
        <div className="space-y-4">
          <div className="text-center">
            <img src={qrCode} alt="QR Code" className="mx-auto w-48 h-48 border rounded-lg p-2 bg-white" />
            <p className="text-xs text-slate-500 mt-2">סרוק עם Google Authenticator / Authy</p>
            <p className="text-xs text-slate-400 mt-1 font-mono break-all">{secret}</p>
          </div>
          <form onSubmit={confirmTOTP} className="space-y-3">
            <div>
              <label className="label">הזן קוד מהאפליקציה לאישור</label>
              <input className="input text-center tracking-widest" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </div>
            <button type="submit" disabled={code.length !== 6} className="btn-primary w-full py-2">אשר והפעל</button>
            <button type="button" onClick={() => setView('idle')} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">ביטול</button>
          </form>
        </div>
      )}

      {view === 'confirm-email' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            {emailCode?.startsWith('DEV:') ? (
              <>
                <p className="text-xs text-blue-600 mb-1">קוד אימות (מצב פיתוח):</p>
                <p className="text-2xl font-bold text-blue-800 tracking-widest">{emailCode.replace('DEV: ', '')}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-blue-800">✓ {emailCode}</p>
            )}
            <p className="text-xs text-blue-500 mt-1">הזן את הקוד שקיבלת — תוקף 10 דקות</p>
          </div>
          <form onSubmit={confirmEmail} className="space-y-3">
            <div>
              <label className="label">הזן קוד לאישור</label>
              <input className="input text-center tracking-widest uppercase" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} required autoFocus />
            </div>
            <button type="submit" disabled={code.length !== 6} className="btn-primary w-full py-2">אשר והפעל</button>
            <button type="button" onClick={() => setView('idle')} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">ביטול</button>
          </form>
        </div>
      )}

    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '', tfa_code: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tfaStatus, setTfaStatus] = useState(null)
  const [emailCodeDisplay, setEmailCodeDisplay] = useState('')
  const [showTfaField, setShowTfaField] = useState(false)

  useEffect(() => {
    axios.get('/api/auth/2fa/status').then(r => setTfaStatus(r.data)).catch(() => {})
  }, [])

  const requestEmailCode = async () => {
    try {
      const r = await axios.post('/api/auth/2fa/request-password-email-code')
      // Show code only in dev mode (no SMTP configured)
      setEmailCodeDisplay(r.data.code ? `DEV: ${r.data.code}` : `✓ ${r.data.message}`)
    } catch (e) { setStatus({ ok: false, msg: e.response?.data?.detail || 'שגיאה' }) }
  }

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
        tfa_code: tfaStatus?.totp_enabled ? form.tfa_code : undefined,
      })
      setStatus({ ok: true, msg: 'הסיסמה עודכנה בהצלחה' })
      setForm({ current_password: '', new_password: '', confirm: '', tfa_code: '' })
      setEmailCodeDisplay('')
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.detail || 'שגיאה בעדכון' })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 md:p-8 max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">פרופיל</h1>
        <p className="text-slate-500 text-sm">הגדרות חשבון ואבטחה</p>
      </div>

      <div className="card">
        <p className="text-sm text-slate-500">שם</p>
        <p className="font-medium text-slate-800">{user?.full_name}</p>
        <p className="text-sm text-slate-400 mt-1">{user?.email}</p>
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
          {tfaStatus?.totp_enabled && (
            <div>
              <label className="label">
                קוד אימות דו-שלבי ({tfaStatus.totp_method === 'email' ? 'אימייל' : 'TOTP'})
              </label>
              {tfaStatus.totp_method === 'email' && !emailCodeDisplay && (
                <button type="button" onClick={requestEmailCode}
                  className="mb-2 text-sm text-blue-600 hover:underline">
                  שלח קוד לאימייל
                </button>
              )}
              {emailCodeDisplay && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center mb-2">
                  {emailCodeDisplay.startsWith('DEV:') ? (
                    <>
                      <p className="text-xs text-blue-600">קוד (מצב פיתוח):</p>
                      <p className="text-xl font-bold text-blue-800 tracking-widest">{emailCodeDisplay.replace('DEV: ', '')}</p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-blue-800">{emailCodeDisplay}</p>
                  )}
                </div>
              )}
              <input className="input text-center tracking-widest uppercase" maxLength={6}
                value={form.tfa_code}
                onChange={e => setForm({ ...form, tfa_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="קוד 6 תווים" required />
            </div>
          )}
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

      <TwoFASection />
      <PasskeySection />
    </div>
  )
}
