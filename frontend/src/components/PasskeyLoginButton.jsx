import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser'

/**
 * PasskeyLoginButton — appears in the login modal.
 * Detects platform support, shows platform-appropriate label.
 * On click: triggers WebAuthn authentication flow.
 */
export default function PasskeyLoginButton({ email = '', onSuccess, onError }) {
  const [supported, setSupported] = useState(false)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return
    platformAuthenticatorIsAvailable().then(setSupported)
  }, [])

  if (!supported) return null

  function platformLabel() {
    const ua = navigator.userAgent
    if (/iPhone|iPad/.test(ua)) return 'Face ID'
    if (/Mac/.test(ua))         return 'Touch ID'
    if (/Windows/.test(ua))     return 'Windows Hello'
    if (/Android/.test(ua))     return 'זיהוי ביומטרי'
    return 'Passkey'
  }

  async function handleClick() {
    setLoading(true)
    try {
      // 1. Get challenge from server
      const beginRes = await axios.post('/api/auth/webauthn/login/begin', { email })
      // 2. Trigger biometric prompt
      const credential = await startAuthentication({ optionsJSON: beginRes.data })
      // 3. Verify on server
      const res = await axios.post('/api/auth/webauthn/login/complete', { credential, email })
      onSuccess(res.data)
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        onError?.('הזיהוי הביומטרי בוטל')
      } else {
        onError?.(e.response?.data?.detail || 'כניסה ביומטרית נכשלה')
      }
    } finally { setLoading(false) }
  }

  const label = platformLabel()

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">או</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 border border-slate-300 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="text-slate-500">מפעיל {label}...</span>
        ) : (
          <>
            <span className="text-lg">{/iPhone|iPad|Mac/.test(navigator.userAgent) ? '🔒' : '🪟'}</span>
            כניסה עם {label}
          </>
        )}
      </button>
    </div>
  )
}
