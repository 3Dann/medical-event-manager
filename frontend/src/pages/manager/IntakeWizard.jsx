import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { validateIsraeliId } from '../../utils/validateId'
import { CityAutocomplete, StreetAutocomplete } from '../../components/AddressAutocomplete'

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'personal',    label: 'פרטים אישיים' },
  { id: 'address',     label: 'כתובת' },
  { id: 'contact',     label: 'פרטי קשר' },
  { id: 'medical',     label: 'מידע רפואי' },
  { id: 'medications', label: 'תרופות' },
  { id: 'assessment',  label: 'הערכות תפקודיות' },
  { id: 'signatures',  label: 'חתימות' },
]

const PHONE_PREFIXES = ['050','051','052','053','054','055','056','057','058','059','02','03','04','08','09','072','073','074','076','077','078','079']

const HMO_OPTIONS = [
  { value: 'clalit',   label: 'כללית' },
  { value: 'maccabi',  label: 'מכבי' },
  { value: 'meuhedet', label: 'מאוחדת' },
  { value: 'leumit',   label: 'לאומית' },
]
const HMO_LEVELS = {
  clalit:   [{ value: 'basic', label: 'בסיסי' }, { value: 'mushlam', label: 'מושלם' }, { value: 'mushlam_plus', label: 'מושלם פלוס' }],
  maccabi:  [{ value: 'basic', label: 'כחול' }, { value: 'silver', label: 'כסף' }, { value: 'gold', label: 'זהב' }],
  meuhedet: [{ value: 'basic', label: 'בסיסי' }, { value: 'mushlam', label: 'שלם' }, { value: 'premium', label: 'עדיף' }],
  leumit:   [{ value: 'basic', label: 'בסיסי' }, { value: 'gold', label: 'זהב' }, { value: 'premium', label: 'פרמיום' }],
}

// ── ADL (Barthel Index) ───────────────────────────────────────────────────────
const ADL_ITEMS = [
  { key: 'feeding',   label: 'אכילה',                      options: [{v:0,l:'תלוי לחלוטין'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'bathing',   label: 'רחצה',                       options: [{v:0,l:'תלוי'},{v:5,l:'עצמאי'}] },
  { key: 'grooming',  label: 'טיפוח אישי',                 options: [{v:0,l:'צריך עזרה'},{v:5,l:'עצמאי'}] },
  { key: 'dressing',  label: 'הלבשה',                      options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'bowel',     label: 'שליטה על מעיים',             options: [{v:0,l:'אי-שליטה'},{v:5,l:'תקלות מדי פעם'},{v:10,l:'שליטה מלאה'}] },
  { key: 'bladder',   label: 'שליטה על שלפוחית',          options: [{v:0,l:'אי-שליטה / צנתר'},{v:5,l:'תקלות מדי פעם'},{v:10,l:'שליטה מלאה'}] },
  { key: 'toilet',    label: 'שימוש בשירותים',             options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'transfer',  label: 'מעבר מיטה-כיסא',            options: [{v:0,l:'תלוי'},{v:5,l:'עזרה רבה'},{v:10,l:'עזרה מינימלית'},{v:15,l:'עצמאי'}] },
  { key: 'mobility',  label: 'ניידות',                     options: [{v:0,l:'אינו מתנייד'},{v:5,l:'עצמאי בכיסא גלגלים'},{v:10,l:'הולך עם עזרה'},{v:15,l:'עצמאי'}] },
  { key: 'stairs',    label: 'עליה במדרגות',               options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
]

// ── IADL (Lawton Scale) ───────────────────────────────────────────────────────
const IADL_ITEMS = [
  { key: 'phone',     label: 'שימוש בטלפון',   options: [{v:1,l:'יוזם שיחות'},{v:2,l:'עונה בלבד'},{v:3,l:'אינו מסוגל'}] },
  { key: 'shopping',  label: 'קניות',           options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'צריך עזרה'},{v:3,l:'מסוגל לקניות קטנות'},{v:4,l:'אינו מסוגל'}] },
  { key: 'cooking',   label: 'הכנת אוכל',       options: [{v:1,l:'מתכנן ומכין עצמאית'},{v:2,l:'מכין ארוחות קטנות'},{v:3,l:'מחמם מזון מוכן'},{v:4,l:'זקוק לאכילה'}] },
  { key: 'housework', label: 'ניהול משק בית',   options: [{v:1,l:'שומר נקיון'},{v:2,l:'עושה עבודות קלות'},{v:3,l:'עובד בעזרה'},{v:4,l:'אינו משתתף'},{v:5,l:'אינו מסוגל'}] },
  { key: 'laundry',   label: 'כביסה',            options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'אינו מסוגל'}] },
  { key: 'transport', label: 'תחבורה / ניידות', options: [{v:1,l:'נוסע עצמאית'},{v:2,l:'מסתדר בתחב"צ'},{v:3,l:'נסיעה בהסעה'},{v:4,l:'מוגבל לטקסי'},{v:5,l:'אינו יוצא'}] },
  { key: 'meds',      label: 'ניהול תרופות',    options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'עם הכנה מוקדמת'},{v:3,l:'אינו מסוגל'}] },
  { key: 'finance',   label: 'ניהול כספים',     options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'מצומצם בלבד'}] },
]

// ── MMSE sections ─────────────────────────────────────────────────────────────
const MMSE_SECTIONS = [
  { key: 'time_orient',  label: 'אוריינטציה לזמן',           max: 5,  hint: 'שנה, עונה, תאריך, יום, חודש' },
  { key: 'place_orient', label: 'אוריינטציה למקום',          max: 5,  hint: 'מדינה, מחוז, עיר, בניין, קומה' },
  { key: 'registration', label: 'רישום (3 מילים)',            max: 3,  hint: 'חזרה על 3 מילים: תפוח, מטבע, שולחן' },
  { key: 'attention',    label: 'קשב וחשבון',                 max: 5,  hint: '100 פחות 7, חמש פעמים (93,86,79,72,65)' },
  { key: 'recall',       label: 'זיכרון — היזכרות',          max: 3,  hint: 'זכירת 3 המילים מקודם' },
  { key: 'naming',       label: 'שפה — מינוי',               max: 2,  hint: 'שם 2 חפצים (שעון, עט)' },
  { key: 'repetition',   label: 'שפה — חזרה',                max: 1,  hint: '"לא כן, לא, אבל"' },
  { key: 'command',      label: 'שפה — פקודה תלת-שלבית',    max: 3,  hint: 'קח דף, קפל, שים על הרצפה' },
  { key: 'reading',      label: 'שפה — קריאה ומילוי',        max: 1,  hint: 'כתוב "עצום עיניים" ובצע' },
  { key: 'writing',      label: 'שפה — כתיבה',               max: 1,  hint: 'כתוב משפט שלם' },
  { key: 'copy',         label: 'מרחבי-חזותי — העתקה',       max: 1,  hint: 'העתק תמונה של שני מחומשים חופפים' },
]

// ── Signature Canvas ──────────────────────────────────────────────────────────

function SignatureCanvas({ label, onChange }) {
  const canvasRef = useRef()
  const drawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const startDraw = (e) => {
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    setIsEmpty(false)
  }

  const endDraw = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>
      <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none">
            חתום כאן
          </p>
        )}
      </div>
      {!isEmpty && (
        <button type="button" onClick={clear} className="mt-1 text-xs text-red-500 hover:text-red-700">
          נקה חתימה
        </button>
      )}
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  // Step 1
  full_name: '', id_number: '', birth_date: '', gender: '',
  marital_status: '', num_children: '', height_cm: '', weight_kg: '',
  // Step 2
  city: '', city_code: '', street: '', house_number: '',
  entrance: '', floor: '', apartment: '', postal_code: '',
  // Step 3
  phone_prefix: '050', phone: '',
  ec_name: '', ec_phone_prefix: '050', ec_phone: '', ec_relation: '',
  // Step 4
  hmo_name: '', hmo_level: '', medical_stage: '',
  diagnosis_status: 'no', diagnosis_details: '', notes: '',
  // Step 5
  medications: [],
  // Step 6
  adl_answers: {}, iadl_answers: {}, mmse_answers: {},
  // Step 7
  consent_agreed: false, consent_signature: null,
  poa_agreed: false, poa_signature: null,
}

export default function IntakeWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // ── Validation per step ─────────────────────────────────────────────────────
  const validate = (stepIdx) => {
    const e = {}
    if (stepIdx === 0) {
      if (!form.full_name.trim()) e.full_name = 'שדה חובה'
      if (!form.id_number) e.id_number = 'שדה חובה'
      else if (!validateIsraeliId(form.id_number)) e.id_number = 'מספר ת"ז לא תקין'
      if (!form.birth_date) e.birth_date = 'שדה חובה'
      if (!form.gender) e.gender = 'שדה חובה'
    }
    if (stepIdx === 1) {
      if (!form.city) e.city = 'יש לבחור עיר מהרשימה'
      if (!form.street) e.street = 'יש לבחור רחוב מהרשימה'
      if (!form.house_number) e.house_number = 'שדה חובה'
      else if (!/^\d+[א-ת]?$/.test(form.house_number.trim())) e.house_number = 'מספר בית לא תקין'
    }
    if (stepIdx === 2) {
      if (!form.phone) e.phone = 'שדה חובה'
      else {
        const digits = form.phone.replace(/\D/g, '')
        const expected = form.phone_prefix.startsWith('0') && form.phone_prefix.length === 3 ? 7 : 7
        if (digits.length !== expected) e.phone = `יש להזין ${expected} ספרות`
      }
      if (!form.ec_name.trim()) e.ec_name = 'שדה חובה'
      if (!form.ec_phone) e.ec_phone = 'שדה חובה'
      if (!form.ec_relation.trim()) e.ec_relation = 'שדה חובה'
    }
    if (stepIdx === 3) {
      if (!form.hmo_name) e.hmo_name = 'שדה חובה'
    }
    if (stepIdx === 6) {
      if (!form.consent_agreed) e.consent = 'יש לאשר ויתור סודיות'
      if (!form.consent_signature) e.consent_sig = 'יש לחתום'
    }
    return e
  }

  const next = () => {
    const e = validate(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(s => s + 1)
  }

  const back = () => { setErrors({}); setStep(s => s - 1) }

  // ── Scores ──────────────────────────────────────────────────────────────────
  const adlScore = Object.values(form.adl_answers).reduce((s, v) => s + Number(v || 0), 0)
  const iadlScore = Object.values(form.iadl_answers).reduce((s, v) => {
    // IADL: 1 = independent for each item
    return s + (Number(v) === 1 ? 1 : 0)
  }, 0)
  const mmseScore = Object.entries(form.mmse_answers).reduce((s, [k, v]) => {
    const sec = MMSE_SECTIONS.find(x => x.key === k)
    return s + Math.min(Number(v || 0), sec?.max || 0)
  }, 0)

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    const e = validate(6)
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        id_number: form.id_number,
        birth_date: form.birth_date,
        gender: form.gender,
        marital_status: form.marital_status || null,
        num_children: form.num_children !== '' ? Number(form.num_children) : null,
        height_cm: form.height_cm !== '' ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg !== '' ? Number(form.weight_kg) : null,
        city: form.city,
        city_code: form.city_code,
        street: form.street,
        house_number: form.house_number,
        entrance: form.entrance || null,
        floor: form.floor || null,
        apartment: form.apartment || null,
        postal_code: form.postal_code || null,
        phone_prefix: form.phone_prefix,
        phone: form.phone,
        ec_name: form.ec_name,
        ec_phone_prefix: form.ec_phone_prefix,
        ec_phone: form.ec_phone,
        ec_relation: form.ec_relation,
        hmo_name: form.hmo_name || null,
        hmo_level: form.hmo_level || null,
        medical_stage: form.medical_stage || null,
        diagnosis_status: form.diagnosis_status,
        diagnosis_details: form.diagnosis_details || null,
        notes: form.notes || null,
        medications: JSON.stringify(form.medications),
        adl_answers: JSON.stringify(form.adl_answers),
        iadl_answers: JSON.stringify(form.iadl_answers),
        mmse_answers: JSON.stringify(form.mmse_answers),
        adl_score: adlScore,
        iadl_score: iadlScore,
        mmse_score: mmseScore,
      }
      const res = await axios.post('/api/patients', payload)
      const patientId = res.data.id

      // Save signatures separately
      await axios.post(`/api/patients/${patientId}/signatures`, {
        consent_agreed: form.consent_agreed,
        consent_signature_b64: form.consent_signature,
        poa_agreed: form.poa_agreed,
        poa_signature_b64: form.poa_signature,
      })

      navigate(`/manager/patients/${patientId}`)
    } catch (err) {
      setErrors({ submit: err.response?.data?.detail || 'שגיאה בשמירה' })
    } finally {
      setSaving(false)
    }
  }

  // ── Field helpers ───────────────────────────────────────────────────────────
  const F = ({ label, name, children, required }) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name]}</p>}
    </div>
  )

  const inp = (name, extra = {}) => ({
    className: `w-full border rounded-lg px-3 py-2 text-sm ${errors[name] ? 'border-red-400' : 'border-slate-300'}`,
    value: form[name],
    onChange: e => set(name, e.target.value),
    ...extra,
  })

  // ── Steps render ────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: פרטים אישיים ────────────────────────────────────────────────
      case 0: return (
        <div className="space-y-4">
          <F label="שם מלא" name="full_name" required>
            <input {...inp('full_name')} />
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label='מספר ת"ז' name="id_number" required>
              <input {...inp('id_number', { maxLength: 9 })} />
            </F>
            <F label="תאריך לידה" name="birth_date" required>
              <input {...inp('birth_date', { type: 'date' })} />
            </F>
            <F label="מגדר" name="gender" required>
              <select {...inp('gender')}>
                <option value="">בחר...</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </F>
            <F label="מצב משפחתי" name="marital_status">
              <select {...inp('marital_status')}>
                <option value="">בחר...</option>
                <option value="single">רווק/ה</option>
                <option value="married">נשוי/אה</option>
                <option value="divorced">גרוש/ה</option>
                <option value="widowed">אלמן/ה</option>
              </select>
            </F>
            <F label="מספר ילדים" name="num_children">
              <input {...inp('num_children', { type: 'number', min: 0 })} />
            </F>
            <div />
            <F label="גובה (ס״מ)" name="height_cm">
              <input {...inp('height_cm', { type: 'number', min: 50, max: 250 })} />
            </F>
            <F label="משקל (ק״ג)" name="weight_kg">
              <input {...inp('weight_kg', { type: 'number', min: 10, max: 300 })} />
            </F>
          </div>
          {form.height_cm && form.weight_kg && (
            <p className="text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              BMI: <strong>{(form.weight_kg / ((form.height_cm / 100) ** 2)).toFixed(1)}</strong>
            </p>
          )}
        </div>
      )

      // ── Step 2: כתובת ───────────────────────────────────────────────────────
      case 1: return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <F label="עיר" name="city" required>
              <CityAutocomplete
                value={form.city}
                cityCode={form.city_code}
                onChange={(name, code) => { set('city', name); set('city_code', code) }}
                required
                error={!!errors.city}
              />
            </F>
            <F label="רחוב" name="street" required>
              <StreetAutocomplete
                value={form.street}
                cityCode={form.city_code}
                onChange={name => set('street', name)}
                required
                error={!!errors.street}
                disabled={!form.city_code}
              />
            </F>
            <F label="מספר בית" name="house_number" required>
              <input {...inp('house_number', { placeholder: 'למשל: 12 או 12א' })} />
            </F>
            <F label="כניסה" name="entrance">
              <input {...inp('entrance', { placeholder: 'א, ב, ג...' })} />
            </F>
            <F label="קומה" name="floor">
              <input {...inp('floor')} />
            </F>
            <F label="דירה" name="apartment">
              <input {...inp('apartment')} />
            </F>
            <F label="מיקוד" name="postal_code">
              <input {...inp('postal_code', { maxLength: 7, placeholder: '7 ספרות' })} />
            </F>
          </div>
        </div>
      )

      // ── Step 3: פרטי קשר ────────────────────────────────────────────────────
      case 2: return (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-700 mb-3">טלפון המטופל</h3>
            <F label="מספר טלפון" name="phone" required>
              <div className="flex gap-2">
                <select
                  className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-28 flex-shrink-0"
                  value={form.phone_prefix}
                  onChange={e => set('phone_prefix', e.target.value)}
                >
                  {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-slate-300'}`}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value.replace(/\D/g, ''))}
                  maxLength={7}
                  placeholder="7 ספרות"
                  dir="ltr"
                />
              </div>
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </F>
          </div>

          <div>
            <h3 className="font-semibold text-slate-700 mb-3">איש קשר לחירום</h3>
            <div className="grid grid-cols-2 gap-4">
              <F label="שם מלא" name="ec_name" required>
                <input {...inp('ec_name')} />
              </F>
              <F label="קשר למטופל" name="ec_relation" required>
                <input {...inp('ec_relation', { placeholder: 'בן/בת זוג, ילד/ה, אח...' })} />
              </F>
              <F label="טלפון" name="ec_phone" required>
                <div className="flex gap-2">
                  <select
                    className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-28 flex-shrink-0"
                    value={form.ec_phone_prefix}
                    onChange={e => set('ec_phone_prefix', e.target.value)}
                  >
                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm ${errors.ec_phone ? 'border-red-400' : 'border-slate-300'}`}
                    value={form.ec_phone}
                    onChange={e => set('ec_phone', e.target.value.replace(/\D/g, ''))}
                    maxLength={7}
                    placeholder="7 ספרות"
                    dir="ltr"
                  />
                </div>
                {errors.ec_phone && <p className="text-xs text-red-500 mt-1">{errors.ec_phone}</p>}
              </F>
            </div>
          </div>
        </div>
      )

      // ── Step 4: מידע רפואי ──────────────────────────────────────────────────
      case 3: return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <F label="קופת חולים" name="hmo_name" required>
              <select {...inp('hmo_name')}>
                <option value="">בחר קופה...</option>
                {HMO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </F>
            <F label="רמת ביטוח" name="hmo_level">
              <select {...inp('hmo_level')} disabled={!form.hmo_name}>
                <option value="">בחר רמה...</option>
                {(HMO_LEVELS[form.hmo_name] || []).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </F>
            <F label="שלב רפואי" name="medical_stage">
              <select {...inp('medical_stage')}>
                <option value="">בחר שלב...</option>
                <option value="pre_diagnosis">לפני אבחון</option>
                <option value="active_treatment">טיפול פעיל</option>
                <option value="recovery">החלמה</option>
                <option value="monitoring">מעקב</option>
              </select>
            </F>
            <F label="סטטוס אבחנה" name="diagnosis_status">
              <select {...inp('diagnosis_status')}>
                <option value="no">ללא אבחון</option>
                <option value="yes">אבחון קיים</option>
                <option value="pending">בבירור</option>
              </select>
            </F>
          </div>
          <F label="פרטי אבחנה" name="diagnosis_details">
            <textarea {...inp('diagnosis_details')} rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </F>
          <F label="הערות" name="notes">
            <textarea {...inp('notes')} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </F>
        </div>
      )

      // ── Step 5: תרופות ──────────────────────────────────────────────────────
      case 4: return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">הוסף תרופות שהמטופל נוטל</p>
            <button
              type="button"
              onClick={() => set('medications', [...form.medications, { name: '', dosage: '' }])}
              className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
            >
              + הוסף תרופה
            </button>
          </div>
          {form.medications.length === 0 && (
            <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-xl">
              אין תרופות — לחץ "הוסף תרופה" להתחלה
            </div>
          )}
          <div className="space-y-3">
            {form.medications.map((med, idx) => (
              <div key={idx} className="flex gap-3 items-start bg-slate-50 rounded-xl p-3 border border-slate-200">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="שם תרופה *"
                    value={med.name}
                    onChange={e => {
                      const meds = [...form.medications]
                      meds[idx] = { ...meds[idx], name: e.target.value }
                      set('medications', meds)
                    }}
                  />
                  <input
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="מינון (למשל: 10mg פעמיים ביום)"
                    value={med.dosage}
                    onChange={e => {
                      const meds = [...form.medications]
                      meds[idx] = { ...meds[idx], dosage: e.target.value }
                      set('medications', meds)
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set('medications', form.medications.filter((_, i) => i !== idx))}
                  className="text-red-400 hover:text-red-600 mt-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )

      // ── Step 6: הערכות תפקודיות ─────────────────────────────────────────────
      case 5: return (
        <div className="space-y-6">
          {/* ADL */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">ADL — מדד ברתל <span className="text-slate-400 font-normal text-sm">(0-100)</span></h3>
              <span className="text-lg font-bold text-blue-600">{adlScore}/100</span>
            </div>
            <div className="space-y-3">
              {ADL_ITEMS.map(item => (
                <div key={item.key} className="grid grid-cols-3 gap-3 items-center">
                  <span className="text-sm text-slate-700 col-span-1">{item.label}</span>
                  <div className="col-span-2 flex gap-2 flex-wrap">
                    {item.options.map(opt => (
                      <label key={opt.v} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                        Number(form.adl_answers[item.key]) === opt.v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200 hover:border-blue-300 text-slate-600'
                      }`}>
                        <input type="radio" className="hidden"
                          checked={Number(form.adl_answers[item.key]) === opt.v}
                          onChange={() => set('adl_answers', { ...form.adl_answers, [item.key]: opt.v })}
                        />
                        {opt.l} ({opt.v})
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* IADL */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">IADL — מדד לאוטון <span className="text-slate-400 font-normal text-sm">(0-8)</span></h3>
              <span className="text-lg font-bold text-blue-600">{iadlScore}/8</span>
            </div>
            <div className="space-y-3">
              {IADL_ITEMS.map(item => (
                <div key={item.key} className="grid grid-cols-3 gap-3 items-center">
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <div className="col-span-2 flex gap-2 flex-wrap">
                    {item.options.map(opt => (
                      <label key={opt.v} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                        Number(form.iadl_answers[item.key]) === opt.v
                          ? 'bg-green-600 text-white border-green-600'
                          : 'border-slate-200 hover:border-green-300 text-slate-600'
                      }`}>
                        <input type="radio" className="hidden"
                          checked={Number(form.iadl_answers[item.key]) === opt.v}
                          onChange={() => set('iadl_answers', { ...form.iadl_answers, [item.key]: opt.v })}
                        />
                        {opt.l}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* MMSE */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">MMSE — מצב מנטלי <span className="text-slate-400 font-normal text-sm">(0-30)</span></h3>
              <span className={`text-lg font-bold ${mmseScore >= 24 ? 'text-green-600' : mmseScore >= 18 ? 'text-amber-600' : 'text-red-600'}`}>
                {mmseScore}/30
              </span>
            </div>
            <div className="space-y-3">
              {MMSE_SECTIONS.map(sec => (
                <div key={sec.key} className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{sec.label}</p>
                    <p className="text-xs text-slate-400">{sec.hint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">0</span>
                    <input
                      type="range"
                      min={0}
                      max={sec.max}
                      step={1}
                      value={form.mmse_answers[sec.key] ?? 0}
                      onChange={e => set('mmse_answers', { ...form.mmse_answers, [sec.key]: Number(e.target.value) })}
                      className="w-24"
                    />
                    <span className="text-xs text-slate-400">{sec.max}</span>
                    <span className="text-sm font-bold text-slate-800 w-5 text-center">
                      {form.mmse_answers[sec.key] ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )

      // ── Step 7: חתימות ──────────────────────────────────────────────────────
      case 6: return (
        <div className="space-y-8">
          {/* Consent */}
          <div className="border border-slate-200 rounded-2xl p-5">
            <h3 className="font-semibold text-slate-800 mb-1">ויתור סודיות</h3>
            <p className="text-sm text-slate-500 mb-4">
              אני מאשר/ת בזאת לניהול האירוע הרפואי לעיין במידע רפואי, ביטוחי, ופיננסי הקשור לטיפולי.
            </p>
            <label className={`flex items-center gap-3 mb-4 cursor-pointer ${errors.consent ? 'text-red-500' : 'text-slate-700'}`}>
              <input
                type="checkbox"
                checked={form.consent_agreed}
                onChange={e => set('consent_agreed', e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">אני מסכים/ה לתנאי ויתור הסודיות *</span>
            </label>
            {errors.consent && <p className="text-xs text-red-500 mb-3">{errors.consent}</p>}
            <SignatureCanvas
              label="חתימה *"
              onChange={sig => set('consent_signature', sig)}
            />
            {errors.consent_sig && <p className="text-xs text-red-500 mt-1">{errors.consent_sig}</p>}
          </div>

          {/* POA */}
          <div className="border border-slate-200 rounded-2xl p-5">
            <h3 className="font-semibold text-slate-800 mb-1">ייפוי כוח (אופציונלי)</h3>
            <p className="text-sm text-slate-500 mb-4">
              אני מייפה את כוחו/ה של מנהל האירוע הרפואי לפעול בשמי מול גורמים רפואיים וביטוחיים.
            </p>
            <label className="flex items-center gap-3 mb-4 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={form.poa_agreed}
                onChange={e => set('poa_agreed', e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">אני מסכים/ה לייפוי כוח</span>
            </label>
            {form.poa_agreed && (
              <SignatureCanvas
                label="חתימה על ייפוי כוח"
                onChange={sig => set('poa_signature', sig)}
              />
            )}
          </div>

          {errors.submit && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl px-4 py-3">{errors.submit}</p>
          )}
        </div>
      )

      default: return null
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate('/manager')} className="text-sm text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1">
            → חזרה ללוח בקרה
          </button>
          <h1 className="text-2xl font-bold text-slate-800">פתיחת תיק מטופל חדש</h1>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i === step ? 'bg-blue-600 text-white' :
                i < step ? 'bg-blue-100 text-blue-700' :
                'bg-slate-200 text-slate-500'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                  i < step ? 'bg-blue-600 text-white' : ''
                }`}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className="w-3 h-0.5 bg-slate-300 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-6">{STEPS[step].label}</h2>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={back}
            disabled={step === 0}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 text-sm font-medium"
          >
            ← חזרה
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              המשך →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'שומר...' : 'סיום ושמירה'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
