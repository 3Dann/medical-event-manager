import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function PatientLoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [idNumber, setIdNumber] = useState('')
  const [captcha, setCaptcha] = useState(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef([])

  useEffect(() => {
    loadCaptcha()
  }, [])

  async function loadCaptcha() {
    setError('')
    try {
      const res = await axios.get('/api/patient-auth/captcha')
      setCaptcha(res.data)
      setCaptchaAnswer('')
    } catch {
      setError('שגיאה בטעינת שאלת האימות. אנא נסה לרענן את הדף.')
    }
  }

  async function handleSendOTP(e) {
    e.preventDefault()
    if (!idNumber.trim() || !captcha || !captchaAnswer.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/patient-auth/otp', {
        id_number: idNumber.trim(),
        captcha_id: captcha.captcha_id,
        captcha_answer: captchaAnswer.trim(),
      })
      setMaskedPhone(res.data.masked_phone)
      setStep(2)
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'אירעה שגיאה. אנא נסה שנית.')
      await loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  function handleDigitChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleDigitKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = ['', '', '', '', '', '']
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setDigits(next)
    const focusIdx = Math.min(pasted.length, 5)
    inputRefs.current[focusIdx]?.focus()
  }

  async function handleVerify(e) {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/patient-auth/verify', {
        id_number: idNumber.trim(),
        otp,
      })
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('role', 'patient')
      navigate('/patient')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'קוד שגוי. אנא נסה שנית.')
    } finally {
      setLoading(false)
    }
  }

  function handleBackToStep1() {
    setStep(1)
    setDigits(['', '', '', '', '', ''])
    setError('')
    loadCaptcha()
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 leading-relaxed">
            כניסה לפורטל המטופל
          </h1>
          <p className="text-slate-500 mt-2" style={{ fontSize: '16px' }}>
            {step === 1 ? 'הזן את מספר הזהות שלך לקבלת קוד SMS' : `שלחנו קוד אל ${maskedPhone}`}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={handleSendOTP} className="space-y-6">
            <div>
              <label
                htmlFor="id_number"
                className="block font-semibold text-slate-700 mb-2"
                style={{ fontSize: '18px' }}
              >
                מספר זהות
              </label>
              <input
                id="id_number"
                type="text"
                inputMode="numeric"
                maxLength={9}
                value={idNumber}
                onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="000000000"
                dir="ltr"
                className="w-full border border-slate-300 rounded-xl px-4 text-center tracking-widest font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '22px', minHeight: '56px' }}
                required
              />
            </div>

            {captcha && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label
                    htmlFor="captcha_answer"
                    className="block font-semibold text-slate-700"
                    style={{ fontSize: '18px' }}
                  >
                    כמה זה {captcha.question}
                  </label>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="text-slate-400 hover:text-blue-500 transition-colors"
                    title="שאלה חדשה"
                    aria-label="רענן שאלת אימות"
                  >
                    🔄
                  </button>
                </div>
                <input
                  id="captcha_answer"
                  type="text"
                  inputMode="numeric"
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value.replace(/\D/g, ''))}
                  placeholder="הזן את התשובה"
                  className="w-full border border-slate-300 rounded-xl px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: '20px', minHeight: '56px' }}
                  required
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700" style={{ fontSize: '16px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !idNumber || !captchaAnswer || !captcha}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              style={{ fontSize: '20px', minHeight: '56px' }}
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  שולח...
                </>
              ) : 'שלח קוד SMS'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <p className="text-center font-semibold text-slate-700 mb-4" style={{ fontSize: '18px' }}>
                הזן את הקוד בן 6 הספרות
              </p>
              <div className="flex justify-center gap-2" dir="ltr" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleDigitKeyDown(i, e)}
                    className="border-2 border-slate-300 rounded-xl text-center font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    style={{ width: '48px', height: '56px', fontSize: '24px' }}
                    aria-label={`ספרה ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700" style={{ fontSize: '16px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || digits.join('').length !== 6}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              style={{ fontSize: '20px', minHeight: '56px' }}
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  מאמת...
                </>
              ) : 'כניסה לפורטל'}
            </button>

            <button
              type="button"
              onClick={handleBackToStep1}
              className="w-full text-slate-500 hover:text-slate-700 font-medium py-2 rounded-xl transition-colors"
              style={{ fontSize: '17px' }}
            >
              שלח קוד חדש
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
