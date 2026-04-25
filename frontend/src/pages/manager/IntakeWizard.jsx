import React, { useState, useRef, useEffect, useContext, createContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { validateIsraeliId } from '../../utils/validateId'
import { CityAutocomplete, StreetAutocomplete } from '../../components/AddressAutocomplete'
import { useDemoMode } from '../../context/DemoModeContext'

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

// ── Contexts ──────────────────────────────────────────────────────────────────
const ErrorCtx = createContext({})
const FormCtx  = createContext({})

function F({ label, name, required, children, valid: validOverride }) {
  const errors = useContext(ErrorCtx)
  const form   = useContext(FormCtx)
  const hasError = !!errors[name]
  // Determine validity: use override if provided, otherwise field has a non-empty value
  const val = form[name]
  const isValid = validOverride !== undefined
    ? validOverride
    : (val !== undefined && val !== null && String(val).length > 0 && !hasError)
  return (
    <div>
      <label className="flex items-center gap-1 text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
        {isValid && <span className="text-green-500 text-xs leading-none">✓</span>}
      </label>
      {children}
      {hasError && <p className="text-xs text-red-500 mt-1">{errors[name]}</p>}
    </div>
  )
}

// ── Date Input — day on right, month middle, year on left + dropdowns ────────
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const CURRENT_YEAR = new Date().getFullYear()

function DateSegment({ inputRef, value, onChange, onFilled, items, placeholder, width, hasError, itemLabel }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef()

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (v) => {
    onChange(v)
    setOpen(false)
    onFilled?.(v)
  }

  return (
    <div ref={wrapRef} className="relative flex-shrink-0" style={{ width }}>
      <div className="flex">
        <input
          ref={inputRef}
          className={`border rounded-r-lg px-2 py-2 text-sm text-center w-full focus:outline-none focus:ring-2 focus:ring-blue-400 ${hasError ? 'border-red-400' : 'border-slate-300'}`}
          value={value}
          onChange={e => {
            const maxLen = items.maxLen
            const v = e.target.value.replace(/\D/g,'').slice(0, maxLen)
            onChange(v)
            if (v.length === maxLen) { setOpen(false); onFilled?.(v) }
          }}
          placeholder={placeholder}
          inputMode="numeric"
          dir="ltr"
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
          className={`px-1.5 border-t border-b border-l rounded-l-lg text-slate-400 hover:bg-slate-50 text-xs ${hasError ? 'border-red-400' : 'border-slate-300'}`}
        >▾</button>
      </div>
      {open && (
        <ul className="absolute z-50 bg-white border border-slate-200 rounded-lg shadow-lg mt-0.5 max-h-44 overflow-y-auto w-full min-w-max">
          {items.options.map(item => {
            const v = String(item.v).padStart(items.maxLen, '0')
            const active = value === v || value === String(item.v)
            return (
              <li
                key={item.v}
                onMouseDown={() => select(v)}
                className={`px-3 py-1.5 text-sm cursor-pointer ${active ? 'bg-blue-100 font-semibold text-blue-700' : 'hover:bg-slate-50'}`}
              >
                {item.label ?? item.v}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function DateInput({ value, onChange, hasError }) {
  const [day,   setDay]   = useState('')
  const [month, setMonth] = useState('')
  const [year,  setYear]  = useState('')
  const monthRef = useRef()
  const yearRef  = useRef()
  const dayRef   = useRef()

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-')
      setDay(d); setMonth(m); setYear(y)
    } else if (!value) {
      setDay(''); setMonth(''); setYear('')
    }
  }, [value])

  const emit = (d, m, y) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      if (!isNaN(new Date(iso).getTime())) onChange(iso)
      else onChange('')
    } else {
      onChange('')
    }
  }

  const days    = { maxLen: 2, options: Array.from({length:31},(_,i)=>({ v: i+1, label: String(i+1).padStart(2,'0') })) }
  const months  = { maxLen: 2, options: MONTHS_HE.map((l,i)=>({ v: i+1, label: `${String(i+1).padStart(2,'0')} — ${l}` })) }
  const years   = { maxLen: 4, options: Array.from({length: CURRENT_YEAR-1919},(_,i)=>({ v: CURRENT_YEAR-i })) }

  // Explicit dir="ltr" + DOM order [year][month][day] → year on LEFT, day on RIGHT
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <DateSegment
        inputRef={yearRef}
        value={year}
        onChange={v => { setYear(v); emit(day, month, v) }}
        items={years}
        placeholder="שנה"
        width={88}
        hasError={hasError}
      />
      <span className="text-slate-400 font-medium">/</span>
      <DateSegment
        inputRef={monthRef}
        value={month}
        onChange={v => { setMonth(v); emit(day, v, year) }}
        onFilled={() => dayRef.current?.focus()}
        items={months}
        placeholder="חודש"
        width={74}
        hasError={hasError}
      />
      <span className="text-slate-400 font-medium">/</span>
      <DateSegment
        inputRef={dayRef}
        value={day}
        onChange={v => { setDay(v); emit(v, month, year) }}
        onFilled={() => monthRef.current?.focus()}
        items={days}
        placeholder="יום"
        width={68}
        hasError={hasError}
      />
    </div>
  )
}

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
      {label && <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>}
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-slate-50" style={{ height: 120 }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={120}
          style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
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
  full_name: '', id_number: '', birth_date: '', gender: '',
  marital_status: '', num_children: '', height_cm: '', weight_kg: '',
  city: '', city_code: '', street: '', house_number: '',
  entrance: '', floor: '', apartment: '', postal_code: '',
  phone_prefix: '050', phone: '',
  ec_name: '', ec_phone_prefix: '050', ec_phone: '', ec_relation: '',
  hmo_name: '', hmo_level: '', medical_stage: '',
  diagnosis_status: 'no', diagnosis_details: '', notes: '',
  specialty: '', sub_specialty: '',
  medications: [],
  adl_answers: {}, iadl_answers: {}, mmse_answers: {},
  consent_agreed: false, consent_signature: null,
  poa_agreed: false, poa_signature: null,
}

export default function IntakeWizard() {
  const navigate = useNavigate()
  const { isDemoMode } = useDemoMode()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // ── Auto-suggest specialty from diagnosis ───────────────────────────────────
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [specialtyAutoFilled, setSpecialtyAutoFilled] = useState(false)
  const [subSpecialtyAutoFilled, setSubSpecialtyAutoFilled] = useState(false)
  const suggestTimer = useRef(null)

  const triggerSuggest = useCallback((diagnosis) => {
    clearTimeout(suggestTimer.current)
    if (!diagnosis || diagnosis.length < 3) return
    suggestTimer.current = setTimeout(async () => {
      setSuggestLoading(true)
      try {
        const res = await axios.post('/api/specialties/suggest', { diagnosis })
        if (res.data.specialty || res.data.sub_specialty) {
          setForm(f => ({
            ...f,
            specialty: res.data.specialty || f.specialty,
            sub_specialty: res.data.sub_specialty || f.sub_specialty,
          }))
          if (res.data.specialty) setSpecialtyAutoFilled(true)
          if (res.data.sub_specialty) setSubSpecialtyAutoFilled(true)
        }
      } catch (_) {}
      finally { setSuggestLoading(false) }
    }, 600)
  }, [])

  // ── Validation per step ─────────────────────────────────────────────────────
  const validate = (stepIdx) => {
    if (isDemoMode) return {}
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
      else if (form.phone.replace(/\D/g,'').length !== 7) e.phone = 'יש להזין 7 ספרות'
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
  const adlScore  = Object.values(form.adl_answers).reduce((s, v) => s + Number(v || 0), 0)
  const iadlScore = Object.values(form.iadl_answers).reduce((s, v) => s + (Number(v) === 1 ? 1 : 0), 0)
  const mmseScore = Object.entries(form.mmse_answers).reduce((s, [k, v]) => {
    const sec = MMSE_SECTIONS.find(x => x.key === k)
    return s + Math.min(Number(v || 0), sec?.max || 0)
  }, 0)

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (isDemoMode) { navigate('/manager'); return }
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
        city: form.city, city_code: form.city_code,
        street: form.street, house_number: form.house_number,
        entrance: form.entrance || null, floor: form.floor || null,
        apartment: form.apartment || null, postal_code: form.postal_code || null,
        phone_prefix: form.phone_prefix, phone: form.phone,
        ec_name: form.ec_name, ec_phone_prefix: form.ec_phone_prefix,
        ec_phone: form.ec_phone, ec_relation: form.ec_relation,
        hmo_name: form.hmo_name || null, hmo_level: form.hmo_level || null,
        medical_stage: form.medical_stage || null,
        diagnosis_status: form.diagnosis_status,
        diagnosis_details: form.diagnosis_details || null,
        specialty: form.specialty || null,
        sub_specialty: form.sub_specialty || null,
        notes: form.notes || null,
        medications: JSON.stringify(form.medications),
        adl_answers: JSON.stringify(form.adl_answers),
        iadl_answers: JSON.stringify(form.iadl_answers),
        mmse_answers: JSON.stringify(form.mmse_answers),
        adl_score: adlScore, iadl_score: iadlScore, mmse_score: mmseScore,
      }
      const res = await axios.post('/api/patients', payload)
      const patientId = res.data.id
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

  // ── Field helper (NOT a component — just returns className + value + onChange)
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
            <F label='מספר ת"ז' name="id_number" required valid={form.id_number.length === 9 && validateIsraeliId(form.id_number)}>
              <input
                {...inp('id_number', { maxLength: 9, inputMode: 'numeric' })}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'')
                  set('id_number', v)
                  if (v.length === 9) {
                    if (!validateIsraeliId(v))
                      setErrors(er => ({ ...er, id_number: 'מספר ת"ז לא תקין' }))
                    else
                      setErrors(er => { const { id_number: _, ...rest } = er; return rest })
                  } else {
                    setErrors(er => { const { id_number: _, ...rest } = er; return rest })
                  }
                }}
              />
            </F>
            <F label="תאריך לידה" name="birth_date" required valid={!!form.birth_date}>
              <DateInput
                value={form.birth_date}
                onChange={v => set('birth_date', v)}
                hasError={!!errors.birth_date}
              />
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
            <F label="מספר טלפון" name="phone" required valid={form.phone.replace(/\D/g,'').length === 7}>
              <div className="flex gap-2">
                <input
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${errors.phone ? 'border-red-400' : 'border-slate-300'}`}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value.replace(/\D/g, ''))}
                  maxLength={7}
                  placeholder="1234567"
                  dir="ltr"
                />
                <select
                  className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-24 flex-shrink-0"
                  value={form.phone_prefix}
                  onChange={e => set('phone_prefix', e.target.value)}
                >
                  {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
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
              <F label="טלפון" name="ec_phone" required valid={form.ec_phone.replace(/\D/g,'').length === 7}>
                <div className="flex gap-2">
                  <input
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm ${errors.ec_phone ? 'border-red-400' : 'border-slate-300'}`}
                    value={form.ec_phone}
                    onChange={e => set('ec_phone', e.target.value.replace(/\D/g, ''))}
                    maxLength={7}
                    placeholder="1234567"
                    dir="ltr"
                  />
                  <select
                    className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-24 flex-shrink-0"
                    value={form.ec_phone_prefix}
                    onChange={e => set('ec_phone_prefix', e.target.value)}
                  >
                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
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
              <select
                {...inp('diagnosis_status')}
                onChange={e => {
                  set('diagnosis_status', e.target.value)
                  if (e.target.value === 'yes' && form.diagnosis_details) {
                    setSpecialtyAutoFilled(false)
                    setSubSpecialtyAutoFilled(false)
                    triggerSuggest(form.diagnosis_details)
                  }
                }}
              >
                <option value="no">ללא אבחון</option>
                <option value="yes">אבחון קיים</option>
                <option value="pending">בבירור</option>
              </select>
            </F>
          </div>
          <F label="פרטי אבחנה" name="diagnosis_details">
            <textarea
              {...inp('diagnosis_details')}
              rows={3}
              onChange={e => {
                set('diagnosis_details', e.target.value)
                setSpecialtyAutoFilled(false)
                setSubSpecialtyAutoFilled(false)
                triggerSuggest(e.target.value)
              }}
            />
          </F>

          {/* Specialty auto-suggest */}
          <div className="grid grid-cols-2 gap-4">
            <F label="תחום רפואה" name="specialty">
              <div className="relative">
                <input
                  {...inp('specialty')}
                  placeholder={suggestLoading ? 'מזהה תחום...' : 'למשל: אונקולוגיה'}
                  onChange={e => { set('specialty', e.target.value); setSpecialtyAutoFilled(false) }}
                />
                {suggestLoading && (
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 animate-pulse">⏳</span>
                )}
                {specialtyAutoFilled && form.specialty && !suggestLoading && (
                  <span className="absolute left-2 top-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">הוצע</span>
                )}
              </div>
            </F>
            <F label="תת-התמחות" name="sub_specialty">
              <div className="relative">
                <input
                  {...inp('sub_specialty')}
                  placeholder={suggestLoading ? 'מזהה...' : 'למשל: אונקולוגיה גינקולוגית'}
                  onChange={e => { set('sub_specialty', e.target.value); setSubSpecialtyAutoFilled(false) }}
                />
                {suggestLoading && (
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 animate-pulse">⏳</span>
                )}
                {subSpecialtyAutoFilled && form.sub_specialty && !suggestLoading && (
                  <span className="absolute left-2 top-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">הוצע</span>
                )}
              </div>
            </F>
          </div>

          <F label="הערות" name="notes">
            <textarea {...inp('notes')} rows={2} />
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
                      type="range" min={0} max={sec.max} step={1}
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
            <SignatureCanvas label="חתימה *" onChange={sig => set('consent_signature', sig)} />
            {errors.consent_sig && <p className="text-xs text-red-500 mt-1">{errors.consent_sig}</p>}
          </div>

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
              <SignatureCanvas label="חתימה על ייפוי כוח" onChange={sig => set('poa_signature', sig)} />
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
    <ErrorCtx.Provider value={errors}>
    <FormCtx.Provider value={form}>
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
                <div
                  onClick={() => isDemoMode && setStep(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isDemoMode ? 'cursor-pointer hover:opacity-80' : ''
                  } ${
                    i === step ? 'bg-blue-600 text-white' :
                    i < step  ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-200 text-slate-500'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${i < step ? 'bg-blue-600 text-white' : ''}`}>
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
    </FormCtx.Provider>
    </ErrorCtx.Provider>
  )
}
