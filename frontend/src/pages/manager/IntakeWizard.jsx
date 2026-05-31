import React, { useState, useRef, useEffect, useContext, createContext, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { validateIsraeliId } from '../../utils/validateId'
import { CityAutocomplete, StreetAutocomplete } from '../../components/AddressAutocomplete'
import { MedicationCard, MedRow } from '../../components/DrugFormComponents'
import { useDemoMode } from '../../context/DemoModeContext'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../components/ConfirmDialog'

// ── Constants ─────────────────────────────────────────────────────────────────

// Labels use i18n keys — resolved at render time with t('intake:step_*')
const STEP_KEYS = [
  { id: 'personal',    key: 'step_personal' },
  { id: 'address',     key: 'step_address' },
  { id: 'contact',     key: 'step_contact' },
  { id: 'medical',     key: 'step_medical' },
  { id: 'medications', key: 'step_medications' },
  { id: 'assessment',  key: 'step_assessment' },
  { id: 'documents',   key: 'step_documents' },
  { id: 'signatures',  key: 'step_signatures' },
]

const PHONE_PREFIXES = ['050','051','052','053','054','055','056','057','058','059','02','03','04','08','09','072','073','074','076','077','078','079']

const HMO_OPTIONS = [
  { value: 'clalit',   label: 'כללית' },
  { value: 'maccabi',  label: 'מכבי' },
  { value: 'meuhedet', label: 'מאוחדת' },
  { value: 'leumit',   label: 'לאומית' },
]
const HMO_LEVELS = {
  clalit:   [
    { value: 'mogen',        label: 'מוגן' },
    { value: 'mushlam',      label: 'מושלם' },
    { value: 'mushlam_plus', label: 'מושלם פלוס' },
    { value: 'mushlam_gold', label: 'מושלם גולד' },
  ],
  maccabi:  [
    { value: 'blue',     label: 'כחול' },
    { value: 'silver',   label: 'כסף' },
    { value: 'gold',     label: 'זהב' },
    { value: 'platinum', label: 'פלטינום' },
  ],
  meuhedet: [
    { value: 'basic', label: 'בסיסי' },
    { value: 'shlam', label: 'שלם' },
    { value: 'adif',  label: 'עדיף' },
  ],
  leumit: [
    { value: 'basic',    label: 'בסיסי' },
    { value: 'gold',     label: 'זהב' },
    { value: 'platinum', label: 'פלטינום' },
  ],
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

// ── Referral goals (multi-select) ────────────────────────────────────────────
const REFERRAL_GOALS = [
  { value: 'initial_clarity',    label: 'בהירות ראשונית',       description: 'הסדרת סביבת המטופל מרגע האבחון' },
  { value: 'financial_mapping',  label: 'מיפוי פיננסי',         description: 'זכאויות ביטוחים, קרנות סיוע וכלכלה רפואית' },
  { value: 'formal_diagnosis',   label: 'אבחון סופי רשמי',      description: 'סיוע בתהליך קבלת אבחנה רשמית' },
  { value: 'treatment_protocol', label: 'ליווי פרוטוקול טיפולי', description: 'ניהול מהלך הטיפול ומעקב אחר תוצאות' },
  { value: 'other',              label: 'אחר',                  description: null },
]

// ── Functional sub-steps (declared here so all references are unambiguous) ────
const FUNC_SUB_STEPS = [
  { key: 'adl',  label: 'ADL',  desc: 'תפקוד יומיומי',    color: 'blue',  range: '0–100' },
  { key: 'iadl', label: 'IADL', desc: 'תפקוד עצמאי',      color: 'green', range: '0–8'   },
  { key: 'mmse', label: 'MMSE', desc: 'תפקוד קוגניטיבי',  color: 'purple', range: '0–30' },
]

// ── Contexts ──────────────────────────────────────────────────────────────────
const ErrorCtx  = createContext({})
const FormCtx   = createContext({ form: {}, set: () => {}, inp: () => ({}), setErrors: () => {} })
const StepCtx   = createContext({})  // per-step handlers (triggerSuggest, etc.)

function F({ label, name, required, children, valid: validOverride }) {
  const errors = useContext(ErrorCtx)
  const { form } = useContext(FormCtx)
  const hasError = !!errors[name]
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

  const borderColor = hasError ? 'border-red-400' : 'border-slate-300'

  return (
    <div ref={wrapRef} className="relative flex-shrink-0" style={{ width }}>
      {/* ▾ button on the LEFT, input on the RIGHT */}
      <div className="flex">
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
          className={`px-1.5 border-t border-b border-l border-r rounded-l-lg text-slate-500 hover:bg-slate-50 text-xs flex-shrink-0 ${borderColor}`}
          tabIndex={-1}
          aria-label={`בחר ${itemLabel || placeholder}`}
        >▾</button>
        <input
          ref={inputRef}
          className={`border-t border-b border-r rounded-r-lg px-2 py-2 text-sm text-center w-full focus:outline-none focus:ring-2 focus:ring-blue-400 focus:z-10 ${borderColor}`}
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
      </div>
      {open && (
        <ul
          role="listbox"
          aria-label={itemLabel || placeholder}
          className="absolute z-50 bg-white border border-slate-200 rounded-lg shadow-lg mt-0.5 max-h-44 overflow-y-auto w-full min-w-max"
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        >
          {items.options.map(item => {
            const v = String(item.v).padStart(items.maxLen, '0')
            const active = value === v || value === String(item.v)
            return (
              <li
                key={item.v}
                role="option"
                aria-selected={active}
                tabIndex={0}
                onMouseDown={() => select(v)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(v) } }}
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
  // editing=false → show completed date as single field; editing=true → show 3 segments
  const [editing, setEditing] = useState(() =>
    !(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
  )
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
      setEditing(false)
    } else if (!value) {
      setDay(''); setMonth(''); setYear('')
      setEditing(true)
    }
  }, [value])

  const emit = (d, m, y) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      if (!isNaN(new Date(iso).getTime())) {
        onChange(iso)
        setEditing(false)   // switch to display mode on valid complete date
      } else onChange('')
    } else {
      onChange('')
    }
  }

  // Display mode — completed date as a single clickable field
  if (!editing && day && month && year) {
    return (
      <button
        type="button"
        dir="ltr"
        onClick={() => { setEditing(true); setTimeout(() => dayRef.current?.focus(), 0) }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors
          ${hasError
            ? 'border-red-400 text-red-700 bg-red-50'
            : 'border-slate-300 text-slate-800 hover:border-blue-400 hover:bg-blue-50'}`}
        aria-label={`תאריך ${day}/${month}/${year} — לחץ לעריכה`}
      >
        <span className="font-medium tracking-wide">{day}/{month}/{year}</span>
        <span className="text-slate-400 text-xs">✎</span>
      </button>
    )
  }

  // Editing mode — 3 segments
  const days   = { maxLen: 2, options: Array.from({length:31},(_,i)=>({ v: i+1, label: String(i+1).padStart(2,'0') })) }
  const months = { maxLen: 2, options: MONTHS_HE.map((l,i)=>({ v: i+1, label: `${String(i+1).padStart(2,'0')} — ${l}` })) }
  const years  = { maxLen: 4, options: Array.from({length: CURRENT_YEAR-1919},(_,i)=>({ v: CURRENT_YEAR-i })) }

  return (
    <div className="flex items-center gap-1" dir="ltr">
      <DateSegment
        inputRef={dayRef}
        value={day}
        onChange={v => { setDay(v); emit(v, month, year) }}
        onFilled={() => monthRef.current?.focus()}
        items={days}
        placeholder="יום"
        width={72}
        hasError={hasError}
        itemLabel="יום"
      />
      <span className="text-slate-400 font-medium select-none">/</span>
      <DateSegment
        inputRef={monthRef}
        value={month}
        onChange={v => { setMonth(v); emit(day, v, year) }}
        onFilled={() => yearRef.current?.focus()}
        items={months}
        placeholder="חודש"
        width={80}
        hasError={hasError}
        itemLabel="חודש"
      />
      <span className="text-slate-400 font-medium select-none">/</span>
      <DateSegment
        inputRef={yearRef}
        value={year}
        onChange={v => { setYear(v); emit(day, month, v) }}
        items={years}
        placeholder="שנה"
        width={92}
        hasError={hasError}
        itemLabel="שנה"
      />
    </div>
  )
}

// ── Signature Canvas ──────────────────────────────────────────────────────────

function SignatureCanvas({ label, onChange }) {
  const canvasRef = useRef()
  const drawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const isEmptyRef = useRef(true)

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
    isEmptyRef.current = false
  }

  const endDraw = () => {
    if (!drawing.current) return
    drawing.current = false
    if (isEmptyRef.current) return
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    isEmptyRef.current = true
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
          <p className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
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

// ── DocSign — מסמך לחתימה עם חובת קריאה ─────────────────────────────────────

function DocSign({ title, text, required, signerName, agreed, signature, onAgreed, onSignature, errorAgreed, errorSig, hideAgreedCheckbox }) {
  const [hasRead, setHasRead] = useState(false)

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollTop + clientHeight >= scrollHeight - 20) setHasRead(true)
  }

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      {title && (
        <div className="bg-slate-800 px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">{title}</h3>
          {required && <span className="text-xs text-red-300 bg-red-900/30 px-2 py-0.5 rounded-full">חובה</span>}
        </div>
      )}
      <div className="p-5 space-y-4">
        {/* גוף המסמך */}
        <div
          onScroll={handleScroll}
          className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-44 overflow-y-auto text-sm text-slate-700 leading-relaxed whitespace-pre-line font-mono"
          dir="rtl"
        >
          {text}
          {signerName && (
            <div className="mt-4 pt-3 border-t border-slate-300 text-slate-600 text-xs">
              שם החותם: <strong>{signerName}</strong>
              {'  '}|{'  '}
              תאריך: <strong>{new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            </div>
          )}
        </div>

        {!hasRead && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            יש לגלול ולקרוא את המסמך במלואו לפני החתימה
          </p>
        )}

        {/* אישור קריאה */}
        {!hideAgreedCheckbox && (
          <label className={`flex items-center gap-3 cursor-pointer ${!hasRead ? 'opacity-40 pointer-events-none' : ''}`}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => onAgreed(e.target.checked)}
              disabled={!hasRead}
              className="w-4 h-4"
            />
            <span className={`text-sm font-medium ${errorAgreed ? 'text-red-600' : 'text-slate-700'}`}>
              קראתי את המסמך במלואו ואני מסכים/ה לתוכנו {required && '*'}
            </span>
          </label>
        )}
        {errorAgreed && <p className="text-xs text-red-500">{errorAgreed}</p>}

        {/* לוח חתימה */}
        <div className={`${(!agreed && !hideAgreedCheckbox) ? 'opacity-40 pointer-events-none' : ''}`}>
          <SignatureCanvas label={`חתימה${required ? ' *' : ''}`} onChange={onSignature} />
          {errorSig && <p className="text-xs text-red-500 mt-1">{errorSig}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  full_name: '', id_number: '', father_name: '', id_issue_date: '', id_expiry_date: '',
  birth_date: '', gender: '',
  marital_status: '', num_children: '', height_cm: '', weight_kg: '',
  referral_goal: '', referral_goal_sub: '', referral_goal_notes: '',
  referral_source: '', referral_name: '', referral_sub: '',
  city: '', city_code: '', street: '', house_number: '',
  entrance: '', floor: '', apartment: '', postal_code: '',
  phone_prefix: '050', phone: '', phone2_prefix: '050', phone2: '',
  ec_name: '', ec_phone_prefix: '050', ec_phone: '', ec_relation: '',
  ec2_name: '', ec2_phone_prefix: '050', ec2_phone: '', ec2_relation: '',
  hmo_name: '', hmo_level: '', medical_stage: '',
  diagnosis_status: 'no', diagnosis_details: '', notes: '',
  specialty: '', sub_specialty: '',
  medications: [],
  adl_answers: {}, iadl_answers: {},
  mmse_answers: {},  // empty = untouched; default 0 applied at render time only
  consent_agreed: false, consent_signature: null,
  financial_consent_agreed: false, financial_consent_signature: null,
  poa_agreed: false, poa_signature: null,
  signer_is_self: true, signer_name: '', signer_relation: '',
}

// ── MedicationsStep — same card as PatientMedications ─────────────────────────
function MedicationsStep({ medications, onChange }) {
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ name: '', generic_name: '', dosage: '', frequency: '', indication: '' })
  const [editIdx, setEditIdx] = useState(null)

  const openAdd = () => {
    setDraft({ name: '', generic_name: '', dosage: '', frequency: '', indication: '' })
    setEditIdx(null)
    setShowAdd(true)
  }

  const openEdit = (idx) => {
    setDraft({ ...medications[idx] })
    setEditIdx(idx)
    setShowAdd(true)
  }

  const handleSave = () => {
    if (!draft.name?.trim()) return
    if (editIdx !== null) {
      const updated = [...medications]
      updated[editIdx] = draft
      onChange(updated)
    } else {
      onChange([...medications, draft])
    }
    setShowAdd(false)
  }

  const handleRemove = (idx) => {
    onChange(medications.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
        <span className="text-lg leading-tight">ℹ️</span>
        <span>שדה זה <strong>אינו חובה</strong> — התרופות יזוהו אוטומטית מהמסמכים הרפואיים שיועלו למערכת, או שניתן להוסיף ידנית בכל עת לאחר השלמת האינטייק.</span>
      </div>
      {/* List */}
      {medications.length === 0 ? (
        <div className="text-center py-10 text-slate-600 bg-slate-50 rounded-xl text-sm">
          אין תרופות — לחץ "הוסף תרופה" להתחלה
        </div>
      ) : (
        <div className="space-y-2">
          {medications.map((med, idx) => (
            <MedRow
              key={idx}
              med={{ ...med, id: idx, is_active: true }}
              onEdit={() => openEdit(idx)}
              onDelete={() => handleRemove(idx)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="w-full border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        + הוסף תרופה
      </button>

      {/* Modal — same card as PatientMedications */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={editIdx !== null ? 'עריכת תרופה' : 'הוספת תרופה'}
          onKeyDown={e => e.key === 'Escape' && setShowAdd(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-slate-800">{editIdx !== null ? 'עריכת תרופה' : 'הוספת תרופה'}</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-700 text-xl leading-none p-2 -m-2 rounded-lg" aria-label="סגור">✕</button>
            </div>
            <div className="p-6">
              <MedicationCard
                med={draft}
                onChange={setDraft}
              />
              <div className="flex gap-3 justify-end border-t pt-4 mt-4">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">ביטול</button>
                <button type="button" onClick={handleSave} disabled={!draft.name?.trim()} className="btn-primary disabled:opacity-50">
                  {editIdx !== null ? 'עדכן' : 'הוסף'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DRAFT_KEY = 'intake_wizard_draft'
const DRAFT_PATIENT_KEY = 'intake_draft_patient_id'

export default function IntakeWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resumeId = searchParams.get('resume')
  const isEditMode = !!resumeId
  const { isDemoMode } = useDemoMode()
  const { showToast } = useToast()
  const { t } = useTranslation(['intake', 'common'])
  const [confirm, ConfirmUI] = useConfirm()
  const [missingFunctionalItems, setMissingFunctionalItems] = useState([])
  const STEPS = STEP_KEYS.map(s => ({ ...s, label: t(`intake:${s.key}`) }))
  const [step, setStep] = useState(() => {
    const stepParam = searchParams.get('step')
    return stepParam !== null ? Number(stepParam) : 0
  })
  const [funcSubStep, setFuncSubStep] = useState(0) // 0=ADL 1=IADL 2=MMSE within step 5
  // draftPatientId — patient already created in DB (draft mode)
  const [draftPatientId, setDraftPatientId] = useState(() => {
    if (resumeId) return Number(resumeId)
    return sessionStorage.getItem(DRAFT_PATIENT_KEY) ? Number(sessionStorage.getItem(DRAFT_PATIENT_KEY)) : null
  })
  const [form, setForm] = useState(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      return saved ? JSON.parse(saved) : EMPTY_FORM
    } catch { return EMPTY_FORM }
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const draftTimer        = useRef(null)
  const draftFadeTimer    = useRef(null)
  const autoSaveRef       = useRef(null)
  const autoSavePending   = useRef(false)
  const formRef           = useRef(form)
  const stepRef           = useRef(step)
  const draftPatientIdRef = useRef(draftPatientId)

  // Load existing patient data when resuming
  useEffect(() => {
    const resumeId = searchParams.get('resume')
    if (!resumeId) return
    // Clear any stale sessionStorage draft so we load from API only
    sessionStorage.removeItem(DRAFT_KEY)
    axios.get(`/api/patients/${resumeId}`).then(res => {
      const p = res.data
      setForm(f => ({
        ...f,
        full_name: p.full_name || '',
        id_number: p.id_number || '',
        father_name: p.father_name || '',
        id_issue_date: p.id_issue_date || '',
        id_expiry_date: p.id_expiry_date || '',
        birth_date: p.birth_date || '',
        gender: p.gender || '',
        marital_status: p.marital_status || '',
        num_children: p.num_children ?? '',
        height_cm: p.height_cm ?? '',
        weight_kg: p.weight_kg ?? '',
        referral_goal: p.referral_goal || '',
        referral_goal_sub: p.referral_goal_sub || '',
        referral_goal_notes: p.referral_goal_notes || '',
        referral_source: p.referral_source || '',
        referral_name: p.referral_name || '',
        referral_sub: p.referral_sub || '',
        city: p.city || '', city_code: p.city_code || '',
        street: p.street || '', house_number: p.house_number || '',
        entrance: p.entrance || '', floor: p.floor || '',
        apartment: p.apartment || '', postal_code: p.postal_code || '',
        phone_prefix: p.phone_prefix || '050', phone: p.phone || '',
        phone2_prefix: p.phone2_prefix || '050', phone2: p.phone2 || '',
        ec_name: p.ec_name || '', ec_phone_prefix: p.ec_phone_prefix || '050',
        ec_phone: p.ec_phone || '', ec_relation: p.ec_relation || '',
        ec2_name: p.ec2_name || '', ec2_phone_prefix: p.ec2_phone_prefix || '050',
        ec2_phone: p.ec2_phone || '', ec2_relation: p.ec2_relation || '',
        hmo_name: p.hmo_name || '', hmo_level: p.hmo_level || '',
        medical_stage: p.medical_stage || '',
        diagnosis_status: p.diagnosis_status || 'no',
        diagnosis_details: p.diagnosis_details || '',
        specialty: p.specialty || '', sub_specialty: p.sub_specialty || '',
        notes: p.notes || '',
        adl_answers:  p.adl_answers  ? (() => { try { return JSON.parse(p.adl_answers)  } catch { return {} } })()  : {},
        iadl_answers: p.iadl_answers ? (() => { try { return JSON.parse(p.iadl_answers) } catch { return {} } })() : {},
        mmse_answers: p.mmse_answers ? (() => { try { return JSON.parse(p.mmse_answers) } catch { return {} } })() : {},
      }))
      const stepParam = searchParams.get('step')
      if (stepParam !== null) setStep(Number(stepParam))
      else if (p.intake_step) setStep(p.intake_step)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // Keep refs in sync so cleanup/beforeunload can access latest values
  useEffect(() => { formRef.current = form },                  [form])
  useEffect(() => { stepRef.current = step },                  [step])
  useEffect(() => { draftPatientIdRef.current = draftPatientId }, [draftPatientId])

  // Build the draft payload — same fields as the old "שמור וצא"
  const buildDraftPayload = useCallback((formData, stepIdx) => ({
    full_name:            formData.full_name.trim(),
    intake_step:          stepIdx,
    id_number:            formData.id_number || null,
    father_name:          formData.father_name || null,
    id_issue_date:        formData.id_issue_date || null,
    id_expiry_date:       formData.id_expiry_date || null,
    birth_date:           formData.birth_date || null,
    gender:               formData.gender || null,
    marital_status:       formData.marital_status || null,
    num_children:         formData.num_children !== '' ? Number(formData.num_children) : null,
    city:                 formData.city || null,
    city_code:            formData.city_code || null,
    street:               formData.street || null,
    house_number:         formData.house_number || null,
    entrance:             formData.entrance || null,
    floor:                formData.floor || null,
    apartment:            formData.apartment || null,
    postal_code:          formData.postal_code || null,
    phone_prefix:         formData.phone_prefix || null,
    phone:                formData.phone || null,
    phone2_prefix:        formData.phone2 ? (formData.phone2_prefix || '050') : null,
    phone2:               formData.phone2 || null,
    ec_name:              formData.ec_name || null,
    ec_phone_prefix:      formData.ec_phone_prefix || null,
    ec_phone:             formData.ec_phone || null,
    ec_relation:          formData.ec_relation || null,
    ec2_name:             formData.ec2_name || null,
    ec2_phone_prefix:     formData.ec2_phone ? (formData.ec2_phone_prefix || '050') : null,
    ec2_phone:            formData.ec2_phone || null,
    ec2_relation:         formData.ec2_relation || null,
    hmo_name:             formData.hmo_name || null,
    hmo_level:            formData.hmo_level || null,
    medical_stage:        formData.medical_stage || null,
    diagnosis_status:     formData.diagnosis_status || 'no',
    diagnosis_details:    formData.diagnosis_details || null,
    specialty:            formData.specialty || null,
    sub_specialty:        formData.sub_specialty || null,
    referral_goal:        formData.referral_goal || null,
    referral_goal_sub:    formData.referral_goal_sub || null,
    referral_goal_notes:  formData.referral_goal_notes || null,
    referral_source:      formData.referral_source || null,
    referral_name:        formData.referral_name || null,
    referral_sub:         formData.referral_sub || null,
    notes:                formData.notes || null,
  }), [])

  // Fire-and-forget silent save to backend
  const silentSave = useCallback(async (formData, stepIdx, pid) => {
    if (!pid || !formData.full_name?.trim()) return
    autoSavePending.current = false
    try {
      await axios.patch(`/api/patients/${pid}/intake-draft`, buildDraftPayload(formData, stepIdx))
    } catch {}
  }, [buildDraftPayload])

  // On unmount (SPA navigation away): flush pending save immediately
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveRef.current)
      if (draftPatientIdRef.current && autoSavePending.current) {
        silentSave(formRef.current, stepRef.current, draftPatientIdRef.current)
      }
    }
  }, [silentSave]) // eslint-disable-line react-hooks/exhaustive-deps

  // On tab close / hard navigation: use keepalive fetch
  useEffect(() => {
    const onUnload = () => {
      const pid = draftPatientIdRef.current
      if (!pid || !formRef.current.full_name?.trim()) return
      const token = localStorage.getItem('token')
      fetch(`/api/patients/${pid}/intake-draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(buildDraftPayload(formRef.current, stepRef.current)),
        keepalive: true,
      }).catch(() => {})
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [buildDraftPayload])

  // Exit without explicit save — data already persisted by auto-save
  const handleExit = () => {
    if (draftPatientIdRef.current) {
      clearTimeout(autoSaveRef.current)
      silentSave(formRef.current, stepRef.current, draftPatientIdRef.current)
    }
    if (missingFunctionalItems.length > 0) {
      showToast(
        `שים לב: לא חולצו מהמסמכים — ${missingFunctionalItems.slice(0, 4).join(', ')}${missingFunctionalItems.length > 4 ? ' ועוד...' : ''}. ניתן להשלים ידנית בשלב ההערכה.`,
        'warning',
      )
    }
    navigate(isEditMode ? `/manager/patients/${resumeId}/intake` : '/manager')
  }

  useEffect(() => {
    clearTimeout(draftTimer.current)
    clearTimeout(draftFadeTimer.current)
    draftTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form))
        setDraftSaved(true)
        draftFadeTimer.current = setTimeout(() => setDraftSaved(false), 1500)
      } catch {}
    }, 800)

    // Auto-save to backend (silent) — only for new intakes, not edit-mode
    // In edit-mode the user has an explicit submit; auto-save could overwrite with stale sessionStorage data
    const pid = draftPatientIdRef.current
    if (pid && !isEditMode && form.full_name?.trim()) {
      autoSavePending.current = true
      clearTimeout(autoSaveRef.current)
      autoSaveRef.current = setTimeout(() => {
        silentSave(formRef.current, stepRef.current, pid)
      }, 2000)
    }

    return () => {
      clearTimeout(draftTimer.current)
      clearTimeout(draftFadeTimer.current)
      // Note: autoSaveRef is NOT cleared here — it lives across re-renders
    }
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearDraft = () => {
    clearTimeout(draftTimer.current)
    clearTimeout(draftFadeTimer.current)
    clearTimeout(autoSaveRef.current)
    sessionStorage.removeItem(DRAFT_KEY)
    sessionStorage.removeItem(DRAFT_PATIENT_KEY)
    setDraftPatientId(null)
    draftPatientIdRef.current = null
    autoSavePending.current = false
    setDraftSaved(false)
    setForm(EMPTY_FORM)
    setStep(0)
  }

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

  // Clear debounce timer on unmount to prevent state updates on unmounted component
  useEffect(() => () => clearTimeout(suggestTimer.current), [])

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
      if (!form.city) e.city = 'יש להזין עיר'
      if (!form.street) e.street = 'יש להזין רחוב'
      if (!form.house_number) e.house_number = 'שדה חובה'
      else if (!/^\d+[א-ת]?$/.test(form.house_number.trim())) e.house_number = 'מספר בית לא תקין'
      if (!form.phone) e.phone = 'שדה חובה'
      else if (form.phone.replace(/\D/g,'').length !== 7) e.phone = 'יש להזין 7 ספרות'
    }
    if (stepIdx === 2) {
      if (!form.ec_name.trim()) e.ec_name = 'שדה חובה'
      if (!form.ec_phone) e.ec_phone = 'שדה חובה'
      else if (form.ec_phone.replace(/\D/g,'').length !== 7) e.ec_phone = 'יש להזין 7 ספרות'
      if (!form.ec_relation.trim()) e.ec_relation = 'שדה חובה'
    }
    if (stepIdx === 3) {
      if (!form.hmo_name) e.hmo_name = 'שדה חובה'
    }
    if (stepIdx === 5) {
      const adlTouched = Object.keys(form.adl_answers).length > 0
      if (adlTouched && Object.values(form.adl_answers).every(v => Number(v) === 0)) {
        e._adl_warning = 'כל ערכי ADL הם 0 — האם המטופל תלוי לחלוטין? ודא שהנתונים מדויקים.'
      }
      if (Object.keys(form.mmse_answers).length > 0) {
        const total = Object.entries(form.mmse_answers).reduce((s, [k, v]) => {
          const sec = MMSE_SECTIONS.find(x => x.key === k)
          return s + Math.min(Number(v || 0), sec?.max || 0)
        }, 0)
        if (total > 30) e.mmse_score = 'ניקוד MMSE חייב להיות 0-30'
      }
    }
    if (stepIdx === 7 && !isEditMode) {
      if (!form.signer_is_self && !form.signer_name.trim()) e.signer_name = 'יש להזין שם החותם'
      if (!form.consent_agreed) e.consent = 'יש לאשר ולחתום על ויתור סודיות רפואית'
      if (!form.consent_signature) e.consent_sig = 'יש לחתום'
      if (!form.financial_consent_agreed) e.financial_consent = 'יש לאשר ולחתום על ויתור סודיות פיננסי'
      if (!form.financial_consent_signature) e.financial_consent_sig = 'יש לחתום'
    }
    return e
  }

  const next = async () => {
    const e = validate(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})

    // Compute target step before state update (state updates are async)
    const isFuncSubAdvance = step === 5 && funcSubStep < 2
    const targetStep = isFuncSubAdvance ? step : step + 1

    // Auto-create patient when leaving step 0 for the first time
    let pid = draftPatientId
    if (step === 0 && !pid && !isDemoMode) {
      try {
        const res = await axios.post('/api/patients', buildDraftPayload(form, targetStep))
        pid = res.data.id
        setDraftPatientId(pid)
        sessionStorage.setItem(DRAFT_PATIENT_KEY, String(pid))
        draftPatientIdRef.current = pid
      } catch (err) {
        setErrors({ submit: err.response?.data?.detail || 'שגיאה ביצירת הטיוטה — נסה שוב' })
        return
      }
    }
    // For step 6 with missing items we defer silentSave until after confirm
    const deferSilentSave = pid && !isDemoMode && !isEditMode && step === 6 && missingFunctionalItems.length > 0
    if (pid && !isDemoMode && !deferSilentSave) {
      // Save new step immediately — don't wait for debounce
      clearTimeout(autoSaveRef.current)
      autoSavePending.current = false
      silentSave(form, targetStep, pid)
    }

    if (isFuncSubAdvance) { setFuncSubStep(s => s + 1); return }
    if (step === 5) setFuncSubStep(0)

    // Advancing from documents step → signatures: warn about missing functional items
    // Skip this dialog in edit mode — the patient already exists; the wizard is purely for data editing
    if (!isEditMode && step === 6 && missingFunctionalItems.length > 0) {
      const ok = await confirm({
        title:        'פריטי תפקוד לא הושלמו',
        message:      `המסמכים לא כללו נתונים עבור: ${missingFunctionalItems.join(', ')}.\n\nניתן לחזור לשלב ההערכה ולמלא ידנית, או להמשיך לחתימות ולהשלים מאוחר יותר.`,
        confirmLabel: 'המשך לחתימות',
        cancelLabel:  'חזור להשלמה',
        danger:       false,
      })
      if (!ok) { setStep(5); return }   // go back to assessment
      // User confirmed — now safe to persist step 7
      if (pid && !isDemoMode) {
        clearTimeout(autoSaveRef.current)
        autoSavePending.current = false
        silentSave(form, targetStep, pid)
      }
    }

    setStep(s => s + 1)
  }

  const SIGNATURE_STEP = 7
  const back = () => {
    setErrors({})
    if (step === 5 && funcSubStep > 0) { setFuncSubStep(s => s - 1); return }
    setStep(s => {
      if (s === SIGNATURE_STEP) {
        setForm(f => ({
          ...f,
          consent_agreed: false,
          consent_signature: null,
          financial_consent_agreed: false,
          financial_consent_signature: null,
          poa_agreed: false,
          poa_signature: null,
        }))
      }
      return s - 1
    })
  }

  const adlTouched  = useMemo(() => Object.keys(form.adl_answers).length > 0,  [form.adl_answers])
  const iadlTouched = useMemo(() => Object.keys(form.iadl_answers).length > 0, [form.iadl_answers])
  const mmseTouched = useMemo(() => Object.values(form.mmse_answers).some(v => v > 0), [form.mmse_answers])

  // ── Scores ──────────────────────────────────────────────────────────────────
  const adlScore  = useMemo(() => Object.values(form.adl_answers).reduce((s, v) => s + Number(v || 0), 0), [form.adl_answers])
  // IADL Lawton scale: value 1 = full independence (best), higher = more dependent.
  // Score = count of fully-independent items (value===1). Range 0–8; higher = more capable.
  const iadlScore = useMemo(() => Object.values(form.iadl_answers).reduce((s, v) => s + (Number(v) === 1 ? 1 : 0), 0), [form.iadl_answers])
  const mmseScore = useMemo(() => Object.entries(form.mmse_answers).reduce((s, [k, v]) => {
    const sec = MMSE_SECTIONS.find(x => x.key === k)
    return s + Math.min(Number(v || 0), sec?.max || 0)
  }, 0), [form.mmse_answers])

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (isDemoMode) { sessionStorage.removeItem(DRAFT_KEY); navigate('/manager'); return }
    const e = validate(7)
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)

    // Edit mode — PATCH existing patient and return to intake tab
    if (isEditMode) {
      try {
        await axios.patch(`/api/patients/${resumeId}`, {
          full_name: form.full_name.trim(),
          id_number: form.id_number,
          father_name: form.father_name || null,
          id_issue_date: form.id_issue_date || null,
          id_expiry_date: form.id_expiry_date || null,
          birth_date: form.birth_date,
          gender: form.gender,
          marital_status: form.marital_status || null,
          num_children: form.num_children !== '' ? Number(form.num_children) : null,
          city: form.city, city_code: form.city_code,
          street: form.street, house_number: form.house_number,
          entrance: form.entrance || null, floor: form.floor || null,
          apartment: form.apartment || null, postal_code: form.postal_code || null,
          phone_prefix: form.phone_prefix, phone: form.phone,
          phone2_prefix: form.phone2 ? (form.phone2_prefix || '050') : null, phone2: form.phone2 || null,
          ec_name: form.ec_name, ec_phone_prefix: form.ec_phone_prefix,
          ec_phone: form.ec_phone, ec_relation: form.ec_relation,
          ec2_name: form.ec2_name || null, ec2_phone_prefix: form.ec2_phone ? (form.ec2_phone_prefix || '050') : null,
          ec2_phone: form.ec2_phone || null, ec2_relation: form.ec2_relation || null,
          hmo_name: form.hmo_name || null, hmo_level: form.hmo_level || null,
          medical_stage: form.medical_stage || null,
          diagnosis_status: form.diagnosis_status,
          diagnosis_details: form.diagnosis_details || null,
          specialty: form.specialty || null, sub_specialty: form.sub_specialty || null,
          referral_goal: form.referral_goal || null,
          referral_goal_sub: form.referral_goal_sub || null,
          referral_goal_notes: form.referral_goal_notes || null,
          referral_source: form.referral_source || null,
          referral_name: form.referral_name || null, referral_sub: form.referral_sub || null,
          notes: form.notes || null,
          adl_answers: JSON.stringify(form.adl_answers),
          iadl_answers: JSON.stringify(form.iadl_answers),
          mmse_answers: JSON.stringify(form.mmse_answers),
          adl_score:  adlTouched  ? adlScore  : undefined,
          iadl_score: iadlTouched ? iadlScore : undefined,
          mmse_score: mmseTouched ? mmseScore : undefined,
          intake_step: 7,
          intake_completed: true,
        })
        // Save signatures only if newly signed
        if (form.consent_agreed && form.consent_signature) {
          await axios.post(`/api/patients/${resumeId}/signatures`, {
            consent_agreed: form.consent_agreed,
            consent_signature_b64: form.consent_signature,
            financial_consent_agreed: form.financial_consent_agreed,
            financial_consent_signature_b64: form.financial_consent_signature,
            poa_agreed: form.poa_agreed,
            poa_signature_b64: form.poa_signature,
            signer_name: form.signer_is_self ? form.full_name : form.signer_name,
            signer_relation: form.signer_is_self ? 'המטופל/ת עצמו/ה' : form.signer_relation,
          })
        }
        sessionStorage.removeItem(DRAFT_KEY)
        sessionStorage.removeItem(DRAFT_PATIENT_KEY)
        navigate(`/manager/patients/${resumeId}/intake`)
      } catch (err) {
        setErrors({ submit: err.response?.data?.detail || 'שגיאה בשמירה' })
      } finally {
        setSaving(false)
      }
      return
    }

    try {
      const payload = {
        full_name: form.full_name.trim(),
        id_number: form.id_number,
        father_name: form.father_name || null,
        id_issue_date: form.id_issue_date || null,
        id_expiry_date: form.id_expiry_date || null,
        birth_date: form.birth_date,
        gender: form.gender,
        marital_status: form.marital_status || null,
        num_children: form.num_children !== '' ? Number(form.num_children) : null,
        referral_goal:        form.referral_goal || null,
        referral_goal_sub:    form.referral_goal_sub || null,
        referral_goal_notes:  form.referral_goal_notes || null,
        referral_source:      form.referral_source || null,
        referral_name:        form.referral_name || null,
        referral_sub:         form.referral_sub || null,
        city: form.city, city_code: form.city_code,
        street: form.street, house_number: form.house_number,
        entrance: form.entrance || null, floor: form.floor || null,
        apartment: form.apartment || null, postal_code: form.postal_code || null,
        phone_prefix: form.phone_prefix, phone: form.phone,
        phone2_prefix: form.phone2 ? (form.phone2_prefix || '050') : null, phone2: form.phone2 || null,
        ec_name: form.ec_name, ec_phone_prefix: form.ec_phone_prefix,
        ec_phone: form.ec_phone, ec_relation: form.ec_relation,
        ec2_name: form.ec2_name || null, ec2_phone_prefix: form.ec2_phone ? (form.ec2_phone_prefix || '050') : null,
        ec2_phone: form.ec2_phone || null, ec2_relation: form.ec2_relation || null,
        hmo_name: form.hmo_name || null, hmo_level: form.hmo_level || null,
        medical_stage: form.medical_stage || null,
        diagnosis_status: form.diagnosis_status,
        diagnosis_details: form.diagnosis_details || null,
        specialty: form.specialty || null,
        sub_specialty: form.sub_specialty || null,
        notes: form.notes || null,
        adl_answers: JSON.stringify(form.adl_answers),
        iadl_answers: JSON.stringify(form.iadl_answers),
        mmse_answers: JSON.stringify(form.mmse_answers),
        adl_score: adlTouched ? adlScore : null,
        iadl_score: iadlTouched ? iadlScore : null,
        mmse_score: mmseTouched ? mmseScore : null,
      }
      // If a draft patient was already created (auto-save), update it; otherwise create new
      let patientId = draftPatientId
      if (patientId) {
        await axios.patch(`/api/patients/${patientId}`, { ...payload, intake_step: 7, intake_completed: true })
      } else {
        const res = await axios.post('/api/patients', payload)
        patientId = res.data.id
      }
      // Save medications to patient_medications table (same as PatientMedications tab)
      for (const med of form.medications) {
        if (!med.name?.trim()) continue
        await axios.post(`/api/patients/${patientId}/medications`, {
          name: med.name.trim(),
          generic_name: med.generic_name || null,
          dosage: med.dosage || null,
          frequency: med.frequency || null,
          indication: med.indication || null,
        }).catch(() => showToast(`שגיאה בשמירת תרופה: ${med.name}`))
      }
      if (form.consent_agreed && form.consent_signature) {
        await axios.post(`/api/patients/${patientId}/signatures`, {
          consent_agreed: form.consent_agreed,
          consent_signature_b64: form.consent_signature,
          financial_consent_agreed: form.financial_consent_agreed,
          financial_consent_signature_b64: form.financial_consent_signature,
          poa_agreed: form.poa_agreed,
          poa_signature_b64: form.poa_signature,
          signer_name: form.signer_is_self ? form.full_name : form.signer_name,
          signer_relation: form.signer_is_self ? 'המטופל/ת עצמו/ה' : form.signer_relation,
        })
      }
      sessionStorage.removeItem(DRAFT_KEY)
      sessionStorage.removeItem(DRAFT_PATIENT_KEY)
      // Cancel any pending auto-save so it doesn't overwrite intake_completed after navigate
      clearTimeout(autoSaveRef.current)
      autoSavePending.current = false
      draftPatientIdRef.current = null
      navigate(`/manager/patients/${patientId}`)
    } catch (err) {
      setErrors({ submit: err.response?.data?.detail || 'שגיאה בשמירה' })
    } finally {
      setSaving(false)
    }
  }

  // ── Field helper (NOT a component — just returns className + value + onChange)
  const FIELD_LABELS = {
    full_name: 'שם מלא', id_number: 'מספר זהות', birth_date: 'תאריך לידה',
    gender: 'מין', marital_status: 'מצב משפחתי', num_children: 'מספר ילדים',
    referral_goal: 'מטרת פניה', referral_source: 'מקור הפניה',
    phone: 'טלפון', email: 'אימייל', street: 'רחוב', house_number: 'מספר בית',
    city: 'עיר', zip_code: 'מיקוד', diagnosis: 'אבחנה', diagnosis_details: 'פרטי אבחנה',
    hmo_name: 'קופת חולים', hmo_level: 'רמת ביטוח',
  }

  const inp = (name, extra = {}) => ({
    className: `w-full border rounded-lg px-3 py-2 text-sm ${errors[name] ? 'border-red-400' : 'border-slate-300'}`,
    value: form[name],
    onChange: e => set(name, e.target.value),
    'aria-label': FIELD_LABELS[name] || name,
    'aria-invalid': errors[name] ? 'true' : undefined,
    id: `field-${name}`,
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
            <F label="שם האב" name="father_name">
              <input {...inp('father_name')} />
            </F>
            <F label="תאריך הנפקת ת״ז" name="id_issue_date">
              <DateInput
                value={form.id_issue_date}
                onChange={v => set('id_issue_date', v)}
                hasError={false}
              />
            </F>
            <F label="תוקף ת״ז" name="id_expiry_date">
              <DateInput
                value={form.id_expiry_date}
                onChange={v => set('id_expiry_date', v)}
                hasError={false}
              />
            </F>
            <F label="מגדר" name="gender" required>
              <select {...inp('gender')}>
                <option value="">בחר...</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
                <option value="other">אחר</option>
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
            <div>
              <label className="label">מטרת הפניה <span className="font-normal text-slate-400 text-xs">(ניתן לבחור יותר מאחת)</span></label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {REFERRAL_GOALS.map(goal => {
                  const selected = (form.referral_goal || '').split(',').filter(Boolean)
                  const checked = selected.includes(goal.value)
                  return (
                    <label
                      key={goal.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors select-none
                        ${checked
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selected, goal.value]
                            : selected.filter(v => v !== goal.value)
                          set('referral_goal', next.join(','))
                          if (!e.target.checked && goal.value === 'financial_mapping') set('referral_goal_sub', '')
                          if (!e.target.checked && goal.value === 'other') set('referral_goal_notes', '')
                        }}
                        className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${checked ? 'text-blue-800' : 'text-slate-700'}`}>
                          {goal.label}
                        </p>
                        {goal.description && (
                          <p className={`text-xs mt-0.5 leading-snug ${checked ? 'text-blue-600' : 'text-slate-400'}`}>
                            {goal.description}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
            <F label="כיצד הגיע/ה?" name="referral_source">
              <select {...inp('referral_source')}>
                <option value="">בחר...</option>
                <option value="word_of_mouth">פה לאוזן</option>
                <option value="social_media">רשתות חברתיות</option>
                <option value="professional">גורם מקצועי</option>
                <option value="case_manager">מנהל אירוע רפואי</option>
                <option value="other">אחר</option>
              </select>
            </F>
          </div>

          {/* Referral goal sub-fields */}
          {(form.referral_goal || '').split(',').includes('financial_mapping') && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-800 mb-3">נושאי המיפוי הפיננסי <span className="font-normal text-blue-600">(אפשר לבחור יותר מאחד)</span></p>
              <div className="space-y-2">
                {[
                  { value: 'foreign_worker', label: 'היתרים עובד זר' },
                  { value: 'national_insurance', label: 'זכאויות ביטוח לאומי' },
                  { value: 'work_capacity', label: 'זכאויות כושר עבודה' },
                ].map(opt => {
                  const selected = (form.referral_goal_sub || '').split(',').filter(Boolean)
                  const checked = selected.includes(opt.value)
                  return (
                    <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selected, opt.value]
                            : selected.filter(v => v !== opt.value)
                          set('referral_goal_sub', next.join(','))
                        }}
                        className="w-4 h-4 rounded accent-blue-600"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          {(form.referral_goal || '').split(',').includes('other') && (
            <F label="פרט את מטרת הפניה" name="referral_goal_notes">
              <input {...inp('referral_goal_notes', { placeholder: 'תאר את מטרת הפניה' })} />
            </F>
          )}

          {/* Referral sub-fields */}
          {form.referral_source === 'word_of_mouth' && (
            <F label="שם המפנה" name="referral_name">
              <input {...inp('referral_name', { placeholder: 'שם מלא של המפנה' })} />
            </F>
          )}
          {form.referral_source === 'social_media' && (
            <F label="רשת חברתית" name="referral_sub">
              <select {...inp('referral_sub')}>
                <option value="">בחר רשת...</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
                <option value="youtube">YouTube</option>
                <option value="other">אחר</option>
              </select>
            </F>
          )}
          {form.referral_source === 'professional' && (
            <div className="grid grid-cols-2 gap-4">
              <F label="סוג הגורם" name="referral_sub">
                <select {...inp('referral_sub')}>
                  <option value="">בחר...</option>
                  <option value="doctor">רופא</option>
                  <option value="nurse">אחות</option>
                  <option value="clinic">מרפאה</option>
                  <option value="social_worker">עו"ס</option>
                  <option value="hospital">בית חולים</option>
                </select>
              </F>
              <F label="שם הגורם" name="referral_name">
                <input {...inp('referral_name', { placeholder: 'שם הגורם המפנה' })} />
              </F>
            </div>
          )}
          {form.referral_source === 'case_manager' && (
            <F label="שם המנהל/ת" name="referral_name">
              <input {...inp('referral_name', { placeholder: 'שם מנהל האירוע הרפואי' })} />
            </F>
          )}
          {form.referral_source === 'other' && (
            <F label="פרט" name="referral_name">
              <input {...inp('referral_name', { placeholder: 'כיצד הגיע/ה?' })} />
            </F>
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
                onChange={(name, code) => { set('city', name); set('city_code', code); if (!name) set('postal_code', '') }}
                required
                error={!!errors.city}
              />
            </F>
            <F label="רחוב" name="street" required>
              <StreetAutocomplete
                value={form.street}
                cityCode={form.city_code}
                cityName={form.city}
                onChange={name => set('street', name)}
                onPostalCode={zip => set('postal_code', zip)}
                required
                error={!!errors.street}
                disabled={!form.city}
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

          <div>
            <div className="grid grid-cols-2 gap-4">
              <F label="טלפון" name="phone" required valid={form.phone.replace(/\D/g,'').length === 7}>
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
              <F label="טלפון נוסף" name="phone2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={form.phone2}
                    onChange={e => set('phone2', e.target.value.replace(/\D/g, ''))}
                    maxLength={7}
                    placeholder="1234567"
                    dir="ltr"
                  />
                  <select
                    className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-24 flex-shrink-0"
                    value={form.phone2_prefix}
                    onChange={e => set('phone2_prefix', e.target.value)}
                  >
                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </F>
            </div>
          </div>
        </div>
      )

      // ── Step 3: פרטי קשר ────────────────────────────────────────────────────
      case 2: return (
        <div className="space-y-6">
          {/* איש/אשת קשר ראשי/ת */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">איש/אשת קשר ראשי/ת</h3>
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

          {/* איש/אשת קשר נוסף/ת */}
          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">איש/אשת קשר נוסף/ת <span className="text-slate-400 font-normal">(אופציונלי)</span></h3>
            <div className="grid grid-cols-2 gap-4">
              <F label="שם מלא" name="ec2_name">
                <input {...inp('ec2_name')} />
              </F>
              <F label="קשר למטופל" name="ec2_relation">
                <input {...inp('ec2_relation', { placeholder: 'בן/בת זוג, ילד/ה, אח...' })} />
              </F>
              <F label="טלפון" name="ec2_phone">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={form.ec2_phone}
                    onChange={e => set('ec2_phone', e.target.value.replace(/\D/g, ''))}
                    maxLength={7}
                    placeholder="1234567"
                    dir="ltr"
                  />
                  <select
                    className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-24 flex-shrink-0"
                    value={form.ec2_phone_prefix}
                    onChange={e => set('ec2_phone_prefix', e.target.value)}
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
              <select {...inp('hmo_name')} onChange={e => { set('hmo_name', e.target.value); set('hmo_level', '') }}>
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
          <F label={
            form.diagnosis_status === 'yes' ? 'שם האבחון' :
            form.diagnosis_status === 'pending' ? 'חשד ל...' :
            'סיבת הפנייה / מצב רפואי'
          } name="diagnosis_details">
            <textarea
              {...inp('diagnosis_details')}
              rows={3}
              placeholder={
                form.diagnosis_status === 'yes'
                  ? 'למשל: סרטן ריאה (NSCLC) שלב IIIA'
                  : form.diagnosis_status === 'pending'
                  ? 'למשל: חשד לממאירות — ממתין לתוצאות ביופסיה'
                  : 'למשל: תסמינים לא מוסברים, ייעוץ, מניעה'
              }
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
                  <span className="absolute left-3 top-2.5 text-xs text-slate-600 animate-pulse">⏳</span>
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
                  <span className="absolute left-3 top-2.5 text-xs text-slate-600 animate-pulse">⏳</span>
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
        <MedicationsStep
          medications={form.medications}
          onChange={meds => set('medications', meds)}
        />
      )

      // ── Step 6: הערכות תפקודיות ─────────────────────────────────────────────
      case 5: return (
        <FunctionalStep adlScore={adlScore} iadlScore={iadlScore} mmseScore={mmseScore} subStep={funcSubStep} />
      )

      // ── Step 7: העלאת מסמכים ────────────────────────────────────────────────
      case 6: return (
        <IntakeDocumentsStep
          patientId={draftPatientId}
          currentAdl={form.adl_answers}
          currentIadl={form.iadl_answers}
          currentMmse={form.mmse_answers}
          onApplyFunctional={data => {
            // Merge: only fill items not already set by user
            if (data.adl_answers) set('adl_answers', {
              ...Object.fromEntries(Object.entries(data.adl_answers).filter(([,v]) => v != null)),
              ...form.adl_answers,
            })
            if (data.iadl_answers) set('iadl_answers', {
              ...Object.fromEntries(Object.entries(data.iadl_answers).filter(([,v]) => v != null)),
              ...form.iadl_answers,
            })
            if (data.mmse_answers) set('mmse_answers', {
              ...Object.fromEntries(Object.entries(data.mmse_answers).filter(([,v]) => v != null)),
              // Existing user values (including genuine 0) take precedence — use != null same as ADL/IADL
              ...Object.fromEntries(Object.entries(form.mmse_answers).filter(([,v]) => v != null)),
            })
          }}
          onMissingItems={setMissingFunctionalItems}
        />
      )

      // ── Step 8: חתימות ──────────────────────────────────────────────────────
      case 7: return (
        <SignaturesStep />
      )

      default: return null
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <ErrorCtx.Provider value={errors}>
    <FormCtx.Provider value={{ form, set, inp, setErrors }}>
    <StepCtx.Provider value={{ triggerSuggest, suggestLoading, specialtyAutoFilled, setSpecialtyAutoFilled, subSpecialtyAutoFilled, setSubSpecialtyAutoFilled }}>
      <div className="min-h-full bg-slate-50 p-4 md:p-6" dir="rtl">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={handleExit}
              className="text-sm text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1"
            >
              ← {isEditMode ? 'חזרה לתיק המטופל' : t('intake:back_to_dashboard')}
            </button>
            <h1 className="text-2xl font-bold text-slate-800">
              {isEditMode ? 'עריכת אינטייק' : t('intake:title')}
            </h1>
            <div className="flex items-center gap-3">
              {draftSaved && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <span>✓</span> טיוטה נשמרה
                </span>
              )}
              {!draftSaved && !isEditMode && (
                <button
                  onClick={clearDraft}
                  className="text-xs text-slate-500 hover:text-red-500 transition-colors"
                  title="נקה את הטיוטה והתחל מחדש"
                >
                  נקה טיוטה
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label={`שלב ${step + 1} מתוך ${STEPS.length}`}
              className="flex items-center mb-3"
            >
              {STEPS.map((s, i) => (
                <React.Fragment key={s.id}>
                  <button
                    onClick={() => isDemoMode && setStep(i)}
                    disabled={!isDemoMode && i > step}
                    aria-label={s.label}
                    aria-current={i === step ? 'step' : undefined}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      isDemoMode ? 'cursor-pointer' : i > step ? 'cursor-default' : 'cursor-pointer'
                    } ${
                      i === step ? 'bg-blue-600 text-white shadow-md scale-110' :
                      i < step  ? 'bg-blue-500 text-white' :
                      'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${i < step ? 'bg-blue-400' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <p className="text-sm font-medium text-slate-500">
              שלב {step + 1} מתוך {STEPS.length} —{' '}
              <span className="text-slate-800 font-semibold">{STEPS[step].label}</span>
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-6">{STEPS[step].label}</h2>
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={back}
              disabled={step === 0 && funcSubStep === 0}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 text-sm font-medium min-h-[44px]"
            >
              ← חזרה
            </button>
            <button
              onClick={handleExit}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium min-h-[44px]"
            >
              יציאה
            </button>
            {(step < STEPS.length - 1 || (step === 5 && funcSubStep < 2)) ? (
              <button
                onClick={next}
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium min-h-[44px]"
              >
                {step === 5 && funcSubStep < 2
                  ? `המשך — ${FUNC_SUB_STEPS[funcSubStep + 1].label} ←`
                  : 'המשך ←'}
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-60 min-h-[44px]"
              >
                {saving ? 'שומר...' : isEditMode ? 'שמור שינויים' : 'סיום ושמירה'}
              </button>
            )}
          </div>
        </div>
      </div>
      {ConfirmUI}
    </StepCtx.Provider>
    </FormCtx.Provider>
    </ErrorCtx.Provider>
  )
}

// ── IntakeDocumentsStep sub-component ─────────────────────────────────────────

// DropZone is defined at module level (outside IntakeDocumentsStep) to prevent
// full remount on every render of the parent component.
function DropZone({ category, label, icon, docs, inputRef, dragOver, setDragOver, handleDrop, upload, uploading, removeDoc }) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-700 flex items-center gap-2">
        <span>{icon}</span> {label}
      </h3>
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors cursor-pointer
          ${dragOver === category ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(category) }}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => handleDrop(e, category)}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        aria-label={`העלה ${label}`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
          onChange={e => upload(e.target.files, category)}
        />
        {uploading === category ? (
          <div className="text-blue-600 text-sm">מעלה...</div>
        ) : (
          <>
            <div className="text-3xl mb-2">⬆️</div>
            <p className="text-sm text-slate-600 font-medium">גרור קבצים לכאן או לחץ לבחירה</p>
            <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, תמונות — עד 20MB</p>
          </>
        )}
      </div>

      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map(doc => (
            <li key={doc.id} className="flex items-center gap-2 text-sm bg-white border border-slate-100 rounded-xl px-3 py-2">
              <span className="text-lg flex-shrink-0">{fileIcon(doc.file_type)}</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">{doc.original_name}</span>
              <span className="text-xs text-slate-400 flex-shrink-0">{fmtSize(doc.file_size)}</span>
              <button
                onClick={() => removeDoc(category, doc.id)}
                className="text-slate-400 hover:text-red-500 text-xs px-1 flex-shrink-0"
                aria-label="הסר"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const FILE_ICONS = {
  'application/pdf':  '📄',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.ms-excel': '📊',
  'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/gif': '🖼️', 'image/webp': '🖼️',
}

function fileIcon(mimeType) {
  return FILE_ICONS[mimeType] || '📎'
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Labels for missing item warnings
const ADL_LABELS  = { feeding:'אכילה', bathing:'רחצה', grooming:'טיפוח', dressing:'הלבשה',
                      bowel:'מעיים', bladder:'שלפוחית', toilet:'שירותים',
                      transfer:'מיטה-כיסא', mobility:'ניידות', stairs:'מדרגות' }
const IADL_LABELS = { phone:'טלפון', shopping:'קניות', cooking:'בישול', housework:'משק בית',
                      laundry:'כביסה', transport:'תחבורה', meds:'תרופות', finance:'כספים' }
const MMSE_LABELS = { time_orient:'זמן', place_orient:'מקום', registration:'רישום',
                      attention:'קשב', recall:'היזכרות', naming:'מינוי', repetition:'חזרה',
                      command:'פקודה', reading:'קריאה', writing:'כתיבה', copy:'העתקה' }

function _computeMissing(functional, currentAdl, currentIadl, currentMmse) {
  if (!functional) return []
  const missing = []

  // ADL: if extraction found at least one item, report missing ones
  const adlExtracted = Object.values(functional.adl_answers || {}).some(v => v != null)
  if (adlExtracted) {
    Object.keys(ADL_LABELS).forEach(k => {
      if ((functional.adl_answers?.[k] == null) && (currentAdl?.[k] == null)) {
        missing.push(ADL_LABELS[k])
      }
    })
  }

  const iadlExtracted = Object.values(functional.iadl_answers || {}).some(v => v != null)
  if (iadlExtracted) {
    Object.keys(IADL_LABELS).forEach(k => {
      if ((functional.iadl_answers?.[k] == null) && (currentIadl?.[k] == null)) {
        missing.push(IADL_LABELS[k])
      }
    })
  }

  const mmseExtracted = Object.values(functional.mmse_answers || {}).some(v => v != null)
  if (mmseExtracted) {
    Object.keys(MMSE_LABELS).forEach(k => {
      if ((functional.mmse_answers?.[k] == null) && (currentMmse?.[k] == null)) {
        missing.push(MMSE_LABELS[k])
      }
    })
  }

  return missing
}

function IntakeDocumentsStep({ patientId, currentAdl, currentIadl, currentMmse, onApplyFunctional, onMissingItems }) {
  const { showToast } = useToast()
  const [medDocs, setMedDocs]       = useState([])
  const [insDocs, setInsDocs]       = useState([])
  const [uploading, setUploading]   = useState(null)
  const [dragOver, setDragOver]     = useState(null)
  const [functional, setFunctional] = useState(null)
  const [missing, setMissing]       = useState([])
  const [applied, setApplied]       = useState(false)
  const medInputRef = useRef()
  const insInputRef = useRef()

  const upload = async (files, category) => {
    if (!patientId) return
    setUploading(category)
    const failed = []
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('category', category)
        const res = await axios.post(`/api/patients/${patientId}/documents/intake-extract`, fd)
        const doc = res.data
        if (category === 'medical') {
          setMedDocs(d => [...d, doc])
          if (doc.functional) {
            setFunctional(prev => {
              if (prev) {
                // A previous extraction already exists — inform user but keep the first result
                showToast('נמצאו נתוני תפקוד במסמך נוסף. נשמרים נתוני המסמך הראשון.', 'info')
                return prev
              }
              return doc.functional
            })
            setApplied(false)
            const m = _computeMissing(doc.functional, currentAdl, currentIadl, currentMmse)
            setMissing(m)
            onMissingItems?.(m)
          }
        } else {
          setInsDocs(d => [...d, doc])
        }
      } catch {
        failed.push(file.name)
      }
    }
    setUploading(null)
    if (failed.length) {
      showToast(`העלאת ${failed.join(', ')} נכשלה`, 'error')
    }
  }

  const handleDrop = (e, category) => {
    e.preventDefault(); setDragOver(null)
    upload(e.dataTransfer.files, category)
  }

  const removeDoc = async (category, docId) => {
    if (patientId) {
      try {
        await axios.delete(`/api/patients/${patientId}/documents/${docId}`)
      } catch {
        // non-fatal: still remove from local state so the UI stays consistent
      }
    }
    if (category === 'medical') setMedDocs(d => d.filter(x => x.id !== docId))
    else setInsDocs(d => d.filter(x => x.id !== docId))
  }

  const applyFunctional = () => {
    if (!functional) return
    onApplyFunctional(functional)
    // Compute the merged values locally (same logic as onApplyFunctional) so that
    // _computeMissing sees the post-merge state rather than the stale prop values.
    const mergedAdl = functional.adl_answers
      ? { ...Object.fromEntries(Object.entries(functional.adl_answers).filter(([,v]) => v != null)), ...currentAdl }
      : currentAdl
    const mergedIadl = functional.iadl_answers
      ? { ...Object.fromEntries(Object.entries(functional.iadl_answers).filter(([,v]) => v != null)), ...currentIadl }
      : currentIadl
    const mergedMmse = functional.mmse_answers
      ? { ...Object.fromEntries(Object.entries(functional.mmse_answers).filter(([,v]) => v != null)), ...currentMmse }
      : currentMmse
    const m = _computeMissing(functional, mergedAdl, mergedIadl, mergedMmse)
    setMissing(m)
    onMissingItems?.(m)
    setApplied(true)
  }

  return (
    <div className="space-y-6" dir="rtl">
      {!patientId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          יש לסיים את מילוי שלב הפרטים האישיים כדי להפעיל העלאת מסמכים.
        </div>
      )}

      <DropZone
        category="medical"
        label="מסמכים רפואיים"
        icon="🏥"
        docs={medDocs}
        inputRef={medInputRef}
        dragOver={dragOver}
        setDragOver={setDragOver}
        handleDrop={handleDrop}
        upload={upload}
        uploading={uploading}
        removeDoc={removeDoc}
      />

      <DropZone
        category="insurance"
        label="מסמכי ביטוח"
        icon="📋"
        docs={insDocs}
        inputRef={insInputRef}
        dragOver={dragOver}
        setDragOver={setDragOver}
        handleDrop={handleDrop}
        upload={upload}
        uploading={uploading}
        removeDoc={removeDoc}
      />

      {/* Functional data extraction banner */}
      {functional && !applied && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-blue-800 text-sm">נמצאו נתוני הערכה תפקודית במסמך</p>
              <div className="mt-1 space-y-0.5">
                {functional.mmse_total != null && (
                  <p className="text-xs text-blue-700">MMSE: <strong>{functional.mmse_total}</strong> / 30</p>
                )}
                {functional.adl_total != null && (
                  <p className="text-xs text-blue-700">ADL (ברתל): <strong>{functional.adl_total}</strong> / 100</p>
                )}
                {functional.iadl_total != null && (
                  <p className="text-xs text-blue-700">IADL (לוטון): <strong>{functional.iadl_total}</strong></p>
                )}
                {functional.raw_mentions?.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">{functional.raw_mentions[0]}</p>
                )}
              </div>
            </div>
            <button
              onClick={applyFunctional}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 flex-shrink-0"
            >
              ייבא לאינטייק
            </button>
          </div>
        </div>
      )}
      {applied && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          ✓ נתוני ההערכה יובאו — חזור לשלב ההערכה לאישור ועריכה
        </div>
      )}

      {/* Missing items warning — shown after apply or when functional found but items missing */}
      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            {missing.length} פריטים לא נמצאו במסמכים
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            {missing.join(' · ')}
          </p>
          <p className="text-xs text-amber-600 mt-2">
            ניתן לחזור לשלב ההערכה ולמלא ידנית, או להמשיך ולהשלים מאוחר יותר.
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        המסמכים נשמרים מוצפנים בתיק המטופל. ניתן לנהל אותם בטאב "מסמכים" לאחר הקליטה.
      </p>
    </div>
  )
}

// ── FunctionalStep sub-component ──────────────────────────────────────────────

function FunctionalStep({ adlScore, iadlScore, mmseScore, subStep }) {
  const { form, set } = useContext(FormCtx)
  const scores = [adlScore, iadlScore, mmseScore]
  const maxes  = [100, 8, 30]
  const current = FUNC_SUB_STEPS[subStep]

  return (
    <div className="space-y-5">
      {/* Sub-step progress */}
      <div className="flex gap-2 items-center">
        {FUNC_SUB_STEPS.map((s, i) => (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === subStep
                ? 'bg-blue-600 text-white shadow-sm'
                : i < subStep
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-400'
            }`}>
              {i < subStep ? '✓ ' : ''}{s.label}
            </div>
            {i < 2 && <div className={`flex-1 h-0.5 ${i < subStep ? 'bg-blue-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
        <div>
          <p className="font-bold text-slate-800">{current.label} — {current.desc}</p>
          <p className="text-xs text-slate-500">טווח ניקוד: {current.range} • {subStep + 1} מתוך 3</p>
        </div>
        <span className="text-2xl font-bold text-blue-600">
          {scores[subStep]}<span className="text-sm font-normal text-slate-500">/{maxes[subStep]}</span>
        </span>
      </div>

      {/* ADL */}
      {subStep === 0 && (
        <div className="space-y-3">
          {ADL_ITEMS.map(item => (
            <fieldset key={item.key} className="grid grid-cols-3 gap-3 items-center">
              <legend className="text-sm text-slate-700 col-span-1">{item.label}</legend>
              <div className="col-span-2 flex gap-2 flex-wrap" role="radiogroup" aria-label={item.label}>
                {item.options.map(opt => (
                  <label key={opt.v} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all min-h-[36px] ${
                    Number(form.adl_answers[item.key]) === opt.v
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 hover:border-blue-300 text-slate-600'
                  }`}>
                    <input type="radio" className="sr-only"
                      name={`adl_${item.key}`} value={opt.v}
                      checked={Number(form.adl_answers[item.key]) === opt.v}
                      onChange={() => set('adl_answers', { ...form.adl_answers, [item.key]: opt.v })}
                      aria-label={`${item.label}: ${opt.l}`}
                    />
                    {opt.l} ({opt.v})
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {/* IADL */}
      {subStep === 1 && (
        <div className="space-y-3">
          {IADL_ITEMS.map(item => (
            <fieldset key={item.key} className="grid grid-cols-3 gap-3 items-center">
              <legend className="text-sm text-slate-700">{item.label}</legend>
              <div className="col-span-2 flex gap-2 flex-wrap" role="radiogroup" aria-label={item.label}>
                {item.options.map(opt => (
                  <label key={opt.v} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all min-h-[36px] ${
                    Number(form.iadl_answers[item.key]) === opt.v
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-slate-200 hover:border-green-300 text-slate-600'
                  }`}>
                    <input type="radio" className="sr-only"
                      name={`iadl_${item.key}`} value={opt.v}
                      checked={Number(form.iadl_answers[item.key]) === opt.v}
                      onChange={() => set('iadl_answers', { ...form.iadl_answers, [item.key]: opt.v })}
                      aria-label={`${item.label}: ${opt.l}`}
                    />
                    {opt.l}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {/* MMSE */}
      {subStep === 2 && (
        <div className="space-y-3">
          {MMSE_SECTIONS.map(sec => (
            <div key={sec.key} className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-slate-700">{sec.label}</p>
                <p className="text-xs text-slate-500">{sec.hint}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">0</span>
                <input
                  type="range" min={0} max={sec.max} step={1}
                  value={form.mmse_answers[sec.key] ?? 0}
                  onChange={e => set('mmse_answers', { ...form.mmse_answers, [sec.key]: Number(e.target.value) })}
                  className="w-24"
                  aria-label={sec.label}
                />
                <span className="text-xs text-slate-500">{sec.max}</span>
                <span className="text-sm font-bold text-slate-800 w-6 text-center">
                  {form.mmse_answers[sec.key] ?? 0}
                </span>
              </div>
            </div>
          ))}
          {mmseScore < 24 && mmseScore > 0 && (
            <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${mmseScore >= 18 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {mmseScore >= 18 ? '⚠ ירידה קלה-בינונית — שקול הפניה לנוירולוג' : '🔴 ירידה משמעותית — נדרש הערכה נוירולוגית'}
              <span className="mr-2 font-normal">({mmseScore}/30)</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SignaturesStep sub-component ───────────────────────────────────────────────
function SignaturesStep() {
  const { form, set } = useContext(FormCtx)
  const errors = useContext(ErrorCtx)
  return (
    <div className="space-y-6">
      {/* אזהרה משפטית */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3">
        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-bold text-amber-800">טיוטה בלבד — לא אושרה משפטית</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            המסמכים שלהלן הם טיוטות שנוסחו על בסיס חוק זכויות החולה, חוק הפיקוח על הביטוח וחוק ייפוי הכוח.
            הם <strong>טרם עברו בדיקה של עורך דין</strong> ואין בהם משום ייעוץ משפטי.
            יש להעבירם לאישור משפטי לפני שימוש מחייב.
          </p>
        </div>
      </div>

      {/* חותם */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-sm font-semibold text-slate-700 mb-3">מי חותם על המסמכים?</p>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={form.signer_is_self} onChange={() => set('signer_is_self', true)} className="w-4 h-4" />
            <span className="text-sm text-slate-700">המטופל/ת עצמו/ה</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!form.signer_is_self} onChange={() => set('signer_is_self', false)} className="w-4 h-4" />
            <span className="text-sm text-slate-700">בא/ת כוח / אפוטרופוס</span>
          </label>
        </div>
        {!form.signer_is_self && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">שם מלא של החותם *</label>
              <input
                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.signer_name ? 'border-red-400' : 'border-slate-300'}`}
                value={form.signer_name}
                onChange={e => set('signer_name', e.target.value)}
                placeholder="שם החותם"
              />
              {errors.signer_name && <p className="text-xs text-red-500 mt-1">{errors.signer_name}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">קשר למטופל</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.signer_relation}
                onChange={e => set('signer_relation', e.target.value)}
                placeholder="בן/בת זוג, ילד/ה, אפוטרופוס..."
              />
            </div>
          </div>
        )}
        <p className="text-xs text-slate-600 mt-3">
          תאריך חתימה: <strong>{new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
        </p>
      </div>

      {/* מסמך 1: ויתור סודיות רפואית */}
      <DocSign
        title="1. ויתור סודיות רפואית"
        required
        signerName={form.signer_is_self ? form.full_name : form.signer_name}
        agreed={form.consent_agreed}
        signature={form.consent_signature}
        onAgreed={v => set('consent_agreed', v)}
        onSignature={s => set('consent_signature', s)}
        errorAgreed={errors.consent}
        errorSig={errors.consent_sig}
        text={`אני החתום/ה מטה מאשר/ת בזאת את מנהל האירוע הרפואי ו/או מי מנציגיו המורשים לקבל, לעיין ולהחזיק בכל מידע רפואי הנוגע אליי, לרבות ובלי לגרוע:

• תיקים רפואיים, רישומים קליניים ותוצאות בדיקות מכל גורם רפואי ו/או מוסד רפואי.
• אבחנות רפואיות, חוות דעת מומחים, פרוטוקולי טיפול ותוכניות טיפול עתידיות.
• תוצאות בדיקות מעבדה, הדמיה, פתולוגיה וכל בדיקה אחרת.
• מידע על אשפוזים, ניתוחים, טיפולים ונהלים רפואיים.

הרשאה זו ניתנת לצורך: ניהול האירוע הרפואי, הגשת תביעות לחברות ביטוח, קבלת חוות דעת רפואיות שנייה, תיאום טיפול רב-מקצועי ומיצוי זכויות הבריאות שלי.

הרשאה זו תקפה למשך תקופת ההתקשרות עם מנהל האירוע הרפואי בלבד, ואינה מועברת לצד שלישי שאינו קשור ישירות לניהול האירוע. הרשאה זו ניתנת לביטול בכל עת על ידי הודעה בכתב.

אני מצהיר/ה כי קראתי ויתור זה בעיון ובמלואו, הבנתי את תוכנו ואת משמעויותיו, ואני חותם/ת עליו מרצוני החופשי, ללא כפייה.`}
      />

      {/* מסמך 2: ויתור סודיות פיננסי */}
      <DocSign
        title="2. ויתור סודיות פיננסי"
        required
        signerName={form.signer_is_self ? form.full_name : form.signer_name}
        agreed={form.financial_consent_agreed}
        signature={form.financial_consent_signature}
        onAgreed={v => set('financial_consent_agreed', v)}
        onSignature={s => set('financial_consent_signature', s)}
        errorAgreed={errors.financial_consent}
        errorSig={errors.financial_consent_sig}
        text={`אני החתום/ה מטה מאשר/ת בזאת את מנהל האירוע הרפואי ו/או מי מנציגיו המורשים לקבל, לעיין ולהחזיק בכל מידע פיננסי וביטוחי הנוגע אליי, לרבות ובלי לגרוע:

• פרטי פוליסות ביטוח חיים, ביטוח בריאות, ביטוח סיעוד, ביטוח מנהלים וכל ביטוח אחר.
• היסטוריית תשלומי פרמיות, תנאי כיסוי, חריגים ומדיניות חברות הביטוח.
• מסמכי תביעות, אישורים, סירובים ותכתובות עם חברות ביטוח.
• מידע על הטבות ביטוח לאומי, גמלאות וזכויות סוציאליות רלוונטיות.

הרשאה זו ניתנת לצורך: הגשת תביעות ביטוח ומעקב אחריהן, ניהול משא ומתן עם חברות ביטוח, ערעור על החלטות דחייה, וקבלת פיצויים ותגמולים המגיעים על פי הפוליסות.

הרשאה זו תקפה למשך תקופת ההתקשרות עם מנהל האירוע הרפואי בלבד, ואינה מועברת לצד שלישי שאינו קשור ישירות לניהול האירוע. הרשאה זו ניתנת לביטול בכל עת על ידי הודעה בכתב.

אני מצהיר/ה כי קראתי ויתור זה בעיון ובמלואו, הבנתי את תוכנו ואת משמעויותיו, ואני חותם/ת עליו מרצוני החופשי, ללא כפייה.`}
      />

      {/* מסמך 3: ייפוי כוח (אופציונלי) */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">3. ייפוי כוח</h3>
          <span className="text-xs text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">אופציונלי</span>
        </div>
        <div className="p-5">
          <label className="flex items-center gap-3 mb-4 cursor-pointer text-slate-700">
            <input type="checkbox" checked={form.poa_agreed} onChange={e => set('poa_agreed', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-medium">ברצוני לחתום על ייפוי כוח</span>
          </label>
          {form.poa_agreed && (
            <DocSign
              title=""
              signerName={form.signer_is_self ? form.full_name : form.signer_name}
              agreed={form.poa_agreed}
              signature={form.poa_signature}
              onAgreed={() => {}}
              onSignature={s => set('poa_signature', s)}
              hideAgreedCheckbox
              text={`אני החתום/ה מטה מייפה בזאת את כוחו/ה של מנהל האירוע הרפואי ונציגיו המורשים לפעול בשמי ובמקומי בכל הנוגע לניהול האירוע הרפואי, לרבות הסמכויות הבאות:

1. פנייה לגורמים רפואיים — בתי חולים, קופות חולים, קליניקות פרטיות ורופאים מומחים, לקבלת מידע, מסמכים ותיאום טיפול.

2. פנייה לגורמים ביטוחיים — חברות ביטוח, סוכני ביטוח, ביטוח לאומי וגורמי רווחה, לצורך הגשת תביעות, ערעורים וקבלת זכויות.

3. חתימה על מסמכים — טפסי שחרור מידע, הרשאות גישה, תביעות ביטוח, ערעורים ופניות מנהליות הנדרשים לניהול האירוע.

4. ייצוג — בפגישות, שיחות ותכתובות מול כל גורם הקשור לאירוע הרפואי ולזכויותיי.

ייפוי כוח זה מוגבל לפעולות הנדרשות לניהול האירוע הרפואי בלבד, ואינו מקנה סמכות לפעול בענייניי הכספיים הכלליים.

ייפוי כוח זה תקף מיום חתימתו ועד לסיום ההתקשרות עם מנהל האירוע הרפואי, אלא אם יבוטל בהודעה בכתב מוקדמת של 14 יום.

אני מצהיר/ה כי קראתי ייפוי כוח זה בעיון ובמלואו, הבנתי את תוכנו, היקפו ומגבלותיו, ואני חותם/ת עליו מרצוני החופשי, ללא כפייה.`}
            />
          )}
        </div>
      </div>

      {errors.submit && (
        <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl px-4 py-3">{errors.submit}</p>
      )}
    </div>
  )
}
