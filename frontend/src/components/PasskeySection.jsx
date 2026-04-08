import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser'

/**
 * PasskeySection — manage WebAuthn / passkeys in ProfilePage.
 * Shows registered passkeys, lets user add / remove them.
 */
export default function PasskeySection() {
  const [supported,    setSupported]    = useState(null)   // null = detecting
  const [creds,        setCreds]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [deviceName,   setDeviceName]   = useState('')
  const [msg,          setMsg]          = useState(null)   // {ok, text}
  const [adding,       setAdding]       = useState(false)

  useEffect(() => {
    detect()
    loadCreds()
  }, [])

  async function detect() {
    if (!browserSupportsWebAuthn()) { setSupported(false); return }
    const ok = await platformAuthenticatorIsAvailable()
    setSupported(ok)
    if (ok) setDeviceName(guessDeviceName())
  }

  function guessDeviceName() {
    const ua = navigator.userAgent
    if (/iPhone/.test(ua))  return 'iPhone Face ID'
    if (/iPad/.test(ua))    return 'iPad Face ID'
    if (/Mac/.test(ua))     return 'Mac Touch ID'
    if (/Windows/.test(ua)) return 'Windows Hello'
    if (/Android/.test(ua)) return 'Android Biometric'
    return 'מכשיר'
  }

  async function loadCreds() {
    try {
      const r = await axios.get('/api/auth/webauthn/credentials')
      setCreds(r.data)
    } catch {}
  }

  async function addPasskey() {
    setMsg(null); setLoading(true)
    try {
      // 1. Get options from server
      const beginRes = await axios.post('/api/auth/webauthn/register/begin')
      // 2. Trigger browser biometric prompt
      const credential = await startRegistration({ optionsJSON: beginRes.data })
      // 3. Complete on server
      await axios.post('/api/auth/webauthn/register/complete', {
        credential,
        device_name: deviceName || guessDeviceName(),
      })
      setMsg({ ok: true, text: 'Passkey נרשם בהצלחה!' })
      setAdding(false)
      loadCreds()
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setMsg({ ok: false, text: 'הזיהוי הביומטרי בוטל' })
      } else {
        setMsg({ ok: false, text: e.response?.data?.detail || e.message || 'שגיאה' })
      }
    } finally { setLoading(false) }
  }

  async function removeCred(id) {
    if (!confirm('למחוק את ה-Passkey הזה?')) return
    try {
      await axios.delete(`/api/auth/webauthn/credentials/${id}`)
      setCreds(c => c.filter(x => x.id !== id))
      setMsg({ ok: true, text: 'Passkey נמחק' })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' })
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (supported === null) return null   // still detecting

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800">כניסה ביומטרית (Passkey)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Face ID · Touch ID · Windows Hello — כניסה ללא סיסמה
          </p>
        </div>
        {supported && !adding && (
          <button
            onClick={() => { setAdding(true); setMsg(null) }}
            className="btn-primary text-sm py-1.5 px-3"
          >
            + הוסף Passkey
          </button>
        )}
      </div>

      {!supported && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          המכשיר או הדפדפן הנוכחי אינם תומכים בכניסה ביומטרית.
          נסה דרך Safari ב-iPhone/iPad/Mac, או Chrome ב-Android/Windows.
        </div>
      )}

      {supported && adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-sm text-slate-600">
            תן שם למכשיר כדי לזהות אותו בעתיד:
          </p>
          <input
            className="input"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            placeholder="לדוגמה: iPhone שלי"
          />
          <div className="flex gap-2">
            <button
              onClick={addPasskey}
              disabled={loading}
              className="btn-primary flex-1 py-2 text-sm"
            >
              {loading ? 'מפעיל זיהוי...' : '🔐 הפעל זיהוי ביומטרי'}
            </button>
            <button
              onClick={() => { setAdding(false); setMsg(null) }}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`p-3 rounded-lg text-sm mb-3 ${
          msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {msg.text}
        </div>
      )}

      {creds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 mb-1">מכשירים רשומים:</p>
          {creds.map(c => (
            <div key={c.id}
                 className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  🔐 {c.device_name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  נרשם: {fmtDate(c.created_at)}
                  {c.last_used && ` · שימוש אחרון: ${fmtDate(c.last_used)}`}
                </p>
              </div>
              <button
                onClick={() => removeCred(c.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                מחק
              </button>
            </div>
          ))}
        </div>
      )}

      {creds.length === 0 && supported && !adding && (
        <p className="text-sm text-slate-400 text-center py-4">
          אין Passkeys רשומים עדיין
        </p>
      )}
    </div>
  )
}
