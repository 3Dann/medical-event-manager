import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import PasskeySection from '../../components/PasskeySection'
import { useTranslation } from 'react-i18next'

const PHONE_PREFIXES_IL = ['050','051','052','053','054','055','056','057','058','072','073','074','076','077','078','079']

function TwoFASection() {
  const { t } = useTranslation('profile')
  const tfa_totp_activated = t('tfa_totp_activated')
  const tfa_email_activated = t('tfa_email_activated')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  // idle | confirm-totp | confirm-email | setup-sms | confirm-sms
  const [view, setView] = useState('idle')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [smsPhone, setSmsPhone] = useState({ prefix: '050', number: '' })
  const [smsMasked, setSmsMasked] = useState('')
  const [msg, setMsg] = useState(null)

  const load = async (signal) => {
    try {
      const r = await axios.get('/api/auth/2fa/status', { signal })
      setStatus(r.data)
    } catch (e) { if (axios.isCancel(e)) return }
    setLoading(false)
  }
  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [])

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
      setMsg({ ok: true, text: tfa_totp_activated })
      setView('idle'); setCode('')
      load()
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'קוד שגוי' }) }
  }

  const startEmail = async () => {
    setMsg(null); setCode('')
    try {
      const r = await axios.post('/api/auth/2fa/setup-email')
      setEmailCode(r.data.code ? `DEV: ${r.data.code}` : r.data.message)
      setView('confirm-email')
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' }) }
  }

  const confirmEmail = async (e) => {
    e.preventDefault(); setMsg(null)
    try {
      await axios.post('/api/auth/2fa/confirm-email', { code })
      setMsg({ ok: true, text: tfa_email_activated })
      setView('idle'); setCode(''); setEmailCode('')
      load()
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'קוד שגוי' }) }
  }

  const startSMS = async (e) => {
    e.preventDefault(); setMsg(null); setCode('')
    if (!smsPhone.number || smsPhone.number.length < 7) {
      setMsg({ ok: false, text: 'יש להזין מספר טלפון תקין' }); return
    }
    try {
      const r = await axios.post('/api/auth/2fa/setup-sms', {
        phone_prefix: smsPhone.prefix,
        phone: smsPhone.number,
      })
      setSmsMasked(r.data.phone_masked)
      if (r.data.code) setEmailCode(`DEV: ${r.data.code}`)
      else setEmailCode(r.data.message)
      setView('confirm-sms')
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה בשליחת SMS' }) }
  }

  const confirmSMS = async (e) => {
    e.preventDefault(); setMsg(null)
    try {
      await axios.post('/api/auth/2fa/confirm-sms', { code })
      setMsg({ ok: true, text: 'אימות דו-שלבי ב-SMS הופעל בהצלחה' })
      setView('idle'); setCode('')
      load()
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'קוד שגוי' }) }
  }


if (loading) return <div className="card"><p className="text-slate-400 text-sm">{t('common:loading', { ns: 'common' })}</p></div>

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-800 mb-1">{t('tfa_title')}</h2>
      <p className="text-sm text-slate-500 mb-4">
        {t('tfa_required_desc')}
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
                <p className="text-sm text-amber-800 font-medium">{t('tfa_required')}</p>
                <p className="text-xs text-amber-700 mt-1">{t('tfa_choose_method')}</p>
              </div>
              <button onClick={startTOTP} className="btn-primary w-full py-2 text-sm">
                📱 {t('tfa_enable_qr')}
              </button>
              <button onClick={startEmail}
                className="w-full py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50">
                ✉️ {t('tfa_enable_email')}
              </button>
              <button onClick={() => { setMsg(null); setCode(''); setView('setup-sms') }}
                className="w-full py-2 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50">
                💬 קוד ב-SMS לטלפון
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-1">
                <p className="text-sm text-green-800 font-medium">✓ {t('tfa_active')}</p>
                <p className="text-xs text-green-700 mt-1">
                  {t('tfa_method_label')}:{' '}
                  {status.totp_method === 'email' ? t('tfa_method_email')
                   : status.totp_method === 'sms' ? `SMS ${status.phone_masked || ''}`
                   : t('tfa_method_qr')}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {status.totp_method !== 'totp' && (
                  <button onClick={() => { setMsg(null); setCode(''); startTOTP() }}
                    className="flex-1 py-2 text-xs border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                    עבור ל-QR
                  </button>
                )}
                {status.totp_method !== 'email' && (
                  <button onClick={() => { setMsg(null); setCode(''); startEmail() }}
                    className="flex-1 py-2 text-xs border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                    עבור למייל
                  </button>
                )}
                {status.totp_method !== 'sms' && (
                  <button onClick={() => { setMsg(null); setCode(''); setView('setup-sms') }}
                    className="flex-1 py-2 text-xs border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">
                    עבור ל-SMS
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'confirm-totp' && (
        <div className="space-y-4">
          <div className="text-center">
            <img src={qrCode} alt="QR Code" className="mx-auto w-48 h-48 border rounded-lg p-2 bg-white" />
            <p className="text-xs text-slate-500 mt-2">{t('tfa_scan_hint')}</p>
            <p className="text-xs text-slate-400 mt-1 font-mono break-all">{secret}</p>
          </div>
          <form onSubmit={confirmTOTP} className="space-y-3">
            <div>
              <label className="label">{t('tfa_enter_app_code')}</label>
              <input className="input text-center tracking-widest" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </div>
            <button type="submit" disabled={code.length !== 6} className="btn-primary w-full py-2">{t('tfa_confirm_activate')}</button>
            <button type="button" onClick={() => setView('idle')} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">{t('common:cancel', { ns: 'common' })}</button>
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
            <p className="text-xs text-blue-500 mt-1">{t('tfa_code_validity')}</p>
          </div>
          <form onSubmit={confirmEmail} className="space-y-3">
            <div>
              <label className="label">{t('tfa_enter_code')}</label>
              <input className="input text-center tracking-widest uppercase" maxLength={8} value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} required autoFocus />
            </div>
            <button type="submit" disabled={code.length < 6} className="btn-primary w-full py-2">{t('tfa_confirm_activate')}</button>
            <button type="button" onClick={() => setView('idle')} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">{t('common:cancel', { ns: 'common' })}</button>
          </form>
        </div>
      )}

      {/* ── SMS setup — enter phone number ── */}
      {view === 'setup-sms' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800">💬 אימות דו-שלבי ב-SMS</p>
            <p className="text-xs text-green-700 mt-1">הכנס את מספר הטלפון — נשלח קוד אימות.</p>
          </div>
          <form onSubmit={startSMS} className="space-y-3">
            <div>
              <label className="label">מספר טלפון ישראלי</label>
              <div className="flex gap-2" dir="ltr">
                <select
                  className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-24 flex-shrink-0"
                  value={smsPhone.prefix}
                  onChange={e => setSmsPhone(p => ({ ...p, prefix: e.target.value }))}
                >
                  {PHONE_PREFIXES_IL.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  className="input flex-1 text-left"
                  placeholder="1234567"
                  maxLength={7}
                  value={smsPhone.number}
                  onChange={e => setSmsPhone(p => ({ ...p, number: e.target.value.replace(/\D/g, '') }))}
                  autoFocus
                  required
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">לדוגמה: 050 + 1234567</p>
            </div>
            <button type="submit"
              disabled={!smsPhone.number || smsPhone.number.length < 7}
              className="btn-primary w-full py-2">
              שלח קוד ב-SMS
            </button>
            <button type="button" onClick={() => setView('idle')}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
              {t('common:cancel', { ns: 'common' })}
            </button>
          </form>
        </div>
      )}

      {/* ── SMS confirm — enter the code received ── */}
      {view === 'confirm-sms' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            {emailCode?.startsWith('DEV:') ? (
              <>
                <p className="text-xs text-green-600 mb-1">קוד SMS (מצב פיתוח):</p>
                <p className="text-2xl font-bold text-green-800 tracking-widest">{emailCode.replace('DEV: ', '')}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-green-800">✓ {emailCode}</p>
            )}
            <p className="text-xs text-green-600 mt-1">
              קוד נשלח ל-{smsMasked} · תקף ל-10 דקות
            </p>
          </div>
          <form onSubmit={confirmSMS} className="space-y-3">
            <div>
              <label className="label">הכנס את הקוד שקיבלת ב-SMS</label>
              <input
                className="input text-center tracking-widest uppercase text-lg"
                maxLength={8}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={code.length < 6} className="btn-primary w-full py-2">
              אמת והפעל SMS אימות
            </button>
            <button type="button" onClick={() => setView('setup-sms')}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700">
              שלח קוד מחדש
            </button>
            <button type="button" onClick={() => setView('idle')}
              className="w-full py-2 text-sm text-slate-400">
              {t('common:cancel', { ns: 'common' })}
            </button>
          </form>
        </div>
      )}

    </div>
  )
}

export default function ProfilePage() {
  const { t } = useTranslation('profile')
  const { user } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '', tfa_code: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tfaStatus, setTfaStatus] = useState(null)
  const [emailCodeDisplay, setEmailCodeDisplay] = useState('')
  const [showTfaField, setShowTfaField] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/auth/2fa/status', { signal: ctrl.signal })
      .then(r => setTfaStatus(r.data))
      .catch(e => { if (axios.isCancel(e)) return })
    return () => ctrl.abort()
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
      setStatus({ ok: false, msg: t('passwords_mismatch') })
      return
    }
    setLoading(true)
    try {
      await axios.put('/api/auth/profile/password', {
        current_password: form.current_password,
        new_password: form.new_password,
        tfa_code: tfaStatus?.totp_enabled ? form.tfa_code : undefined,
      })
      setStatus({ ok: true, msg: t('password_updated') })
      setForm({ current_password: '', new_password: '', confirm: '', tfa_code: '' })
      setEmailCodeDisplay('')
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.detail || t('update_error') })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 md:p-8 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('title')}</h1>
        <p className="text-slate-500 text-sm">{t('account_settings')}</p>
      </div>

      <div className="card">
        <p className="text-sm text-slate-500">{t('name_label')}</p>
        <p className="font-medium text-slate-800">{user?.full_name}</p>
        <p className="text-sm text-slate-400 mt-1">{user?.email}</p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-4">{t('change_password')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('current_password')}</label>
            <input type="password" className="input" value={form.current_password}
              onChange={e => setForm({ ...form, current_password: e.target.value })} required />
          </div>
          <div>
            <label className="label">{t('new_password')}</label>
            <input type="password" className="input" value={form.new_password}
              onChange={e => setForm({ ...form, new_password: e.target.value })} required minLength={6} />
          </div>
          <div>
            <label className="label">{t('confirm_new_password')}</label>
            <input type="password" className="input" value={form.confirm}
              onChange={e => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          {tfaStatus?.totp_enabled && (
            <div>
              <label className="label">
                {t('tfa_code_label')} ({tfaStatus.totp_method === 'email' ? t('tfa_method_email') : 'TOTP'})
              </label>
              {tfaStatus.totp_method === 'email' && !emailCodeDisplay && (
                <button type="button" onClick={requestEmailCode}
                  className="mb-2 text-sm text-blue-600 hover:underline">
                  {t('send_email_code')}
                </button>
              )}
              {emailCodeDisplay && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center mb-2">
                  {emailCodeDisplay.startsWith('DEV:') ? (
                    <>
                      <p className="text-xs text-blue-600">{t('dev_code_label')}</p>
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
                placeholder={t('code_6_chars')} required />
            </div>
          )}
          {status && (
            <p className={`text-sm p-3 rounded-lg ${status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {status.ok ? '✓ ' : '✗ '}{status.msg}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('updating') : t('update_password')}
          </button>
        </form>
      </div>

      <TwoFASection />
      <PasskeySection />
    </div>
  )
}
