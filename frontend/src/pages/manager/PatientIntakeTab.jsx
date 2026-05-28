import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useToast } from '../../hooks/useToast'
import AppToast from '../../components/AppToast'

// ── Section list ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'personal',    label: 'פרטים אישיים',   step: 1 },
  { key: 'address',     label: 'כתובת וטלפון',    step: 2 },
  { key: 'contact',     label: 'קשר חירום',       step: 3 },
  { key: 'medical',     label: 'מידע רפואי',      step: 4 },
  { key: 'medications', label: 'תרופות',          step: 5 },
  { key: 'assessments', label: 'הערכות תפקודיות', step: 6 },
  { key: 'signatures',  label: 'חתימות',          step: 7 },
]

// ── Display label maps ────────────────────────────────────────────────────────

const HMO_OPTIONS = [
  { value: 'clalit',   label: 'כללית' },
  { value: 'maccabi',  label: 'מכבי' },
  { value: 'meuhedet', label: 'מאוחדת' },
  { value: 'leumit',   label: 'לאומית' },
]
const HMO_LEVELS = {
  clalit:   [{ value: 'basic', label: 'בסיסי' }, { value: 'mushlam', label: 'מושלם' }, { value: 'mushlam_plus', label: 'מושלם פלוס' }],
  maccabi:  [{ value: 'basic', label: 'כחול' },  { value: 'silver', label: 'כסף' },    { value: 'gold', label: 'זהב' }],
  meuhedet: [{ value: 'basic', label: 'בסיסי' }, { value: 'mushlam', label: 'שלם' },   { value: 'premium', label: 'עדיף' }],
  leumit:   [{ value: 'basic', label: 'בסיסי' }, { value: 'gold', label: 'זהב' },       { value: 'premium', label: 'פרמיום' }],
}
const GENDER_LABELS   = { male: 'זכר', female: 'נקבה', other: 'אחר' }
const MARITAL_LABELS  = { single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה' }
const STAGE_LABELS    = { pre_diagnosis: 'לפני אבחון', active_treatment: 'טיפול פעיל', recovery: 'החלמה', monitoring: 'מעקב' }
const DIAG_LABELS     = { yes: 'אבחון קיים', no: 'ללא אבחון', pending: 'בבירור' }
const REFERRAL_GOAL_LABELS = {
  initial_clarity: 'בהירות ראשונית — הסדרת סביבת מטופל',
  financial_mapping: 'מיפוי פיננסי',
  formal_diagnosis: 'אבחון סופי רשמי',
  treatment_protocol: 'ליווי פרוטוקול טיפולי',
  other: 'אחר',
}
const GOAL_SUB_LABELS   = { foreign_worker: 'עובד זר', national_insurance: 'ביטוח לאומי', work_capacity: 'כושר עבודה' }
const SOURCE_LABELS     = { word_of_mouth: 'פה לאוזן', social_media: 'רשתות חברתיות', professional: 'גורם מקצועי', case_manager: 'מנהל אירוע', other: 'אחר' }
const SOURCE_SUB_LABELS = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', doctor: 'רופא', nurse: 'אחות', clinic: 'מרפאה', social_worker: 'עו"ס', hospital: 'בית חולים', other: 'אחר' }

// ── Assessment item definitions ───────────────────────────────────────────────

const ADL_ITEMS = [
  { key: 'feeding',   label: 'אכילה',               options: [{v:0,l:'תלוי לחלוטין'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'bathing',   label: 'רחצה',                options: [{v:0,l:'תלוי'},{v:5,l:'עצמאי'}] },
  { key: 'grooming',  label: 'טיפוח אישי',          options: [{v:0,l:'צריך עזרה'},{v:5,l:'עצמאי'}] },
  { key: 'dressing',  label: 'הלבשה',               options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'bowel',     label: 'שליטה על מעיים',      options: [{v:0,l:'אי-שליטה'},{v:5,l:'תקלות מדי פעם'},{v:10,l:'שליטה מלאה'}] },
  { key: 'bladder',   label: 'שליטה על שלפוחית',   options: [{v:0,l:'אי-שליטה / צנתר'},{v:5,l:'תקלות מדי פעם'},{v:10,l:'שליטה מלאה'}] },
  { key: 'toilet',    label: 'שימוש בשירותים',      options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
  { key: 'transfer',  label: 'מעבר מיטה-כיסא',     options: [{v:0,l:'תלוי'},{v:5,l:'עזרה רבה'},{v:10,l:'עזרה מינימלית'},{v:15,l:'עצמאי'}] },
  { key: 'mobility',  label: 'ניידות',              options: [{v:0,l:'אינו מתנייד'},{v:5,l:'עצמאי בכיסא גלגלים'},{v:10,l:'הולך עם עזרה'},{v:15,l:'עצמאי'}] },
  { key: 'stairs',    label: 'עליה במדרגות',        options: [{v:0,l:'תלוי'},{v:5,l:'צריך עזרה'},{v:10,l:'עצמאי'}] },
]

const IADL_ITEMS = [
  { key: 'phone',     label: 'שימוש בטלפון',   options: [{v:1,l:'יוזם שיחות'},{v:2,l:'עונה בלבד'},{v:3,l:'אינו מסוגל'}] },
  { key: 'shopping',  label: 'קניות',           options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'צריך עזרה'},{v:3,l:'קניות קטנות בלבד'},{v:4,l:'אינו מסוגל'}] },
  { key: 'cooking',   label: 'הכנת אוכל',       options: [{v:1,l:'מתכנן ומכין עצמאית'},{v:2,l:'מכין ארוחות קטנות'},{v:3,l:'מחמם מזון מוכן'},{v:4,l:'זקוק לאכילה'}] },
  { key: 'housework', label: 'ניהול משק בית',   options: [{v:1,l:'שומר נקיון'},{v:2,l:'עושה עבודות קלות'},{v:3,l:'עובד בעזרה'},{v:4,l:'אינו משתתף'},{v:5,l:'אינו מסוגל'}] },
  { key: 'laundry',   label: 'כביסה',           options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'אינו מסוגל'}] },
  { key: 'transport', label: 'תחבורה / ניידות', options: [{v:1,l:'נוסע עצמאית'},{v:2,l:'מסתדר בתחב"צ'},{v:3,l:'נסיעה בהסעה'},{v:4,l:'מוגבל לטקסי'},{v:5,l:'אינו יוצא'}] },
  { key: 'meds',      label: 'ניהול תרופות',    options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'עם הכנה מוקדמת'},{v:3,l:'אינו מסוגל'}] },
  { key: 'finance',   label: 'ניהול כספים',     options: [{v:1,l:'עצמאי לחלוטין'},{v:2,l:'מצומצם בלבד'}] },
]

const MMSE_SECTIONS = [
  { key: 'time_orient',  label: 'אוריינטציה לזמן',         max: 5  },
  { key: 'place_orient', label: 'אוריינטציה למקום',        max: 5  },
  { key: 'registration', label: 'רישום (3 מילים)',          max: 3  },
  { key: 'attention',    label: 'קשב וחשבון',               max: 5  },
  { key: 'recall',       label: 'זיכרון — היזכרות',        max: 3  },
  { key: 'naming',       label: 'שפה — מינוי',             max: 2  },
  { key: 'repetition',   label: 'שפה — חזרה',              max: 1  },
  { key: 'command',      label: 'שפה — פקודה תלת-שלבית',  max: 3  },
  { key: 'reading',      label: 'שפה — קריאה ומילוי',      max: 1  },
  { key: 'writing',      label: 'שפה — כתיבה',             max: 1  },
  { key: 'copy',         label: 'מרחבי-חזותי — העתקה',     max: 1  },
]

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Row({ label, value, mono, ltr }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={`text-sm font-medium ${value ? 'text-slate-800' : 'text-slate-300'} ${mono ? 'font-mono' : ''}`}
        dir={ltr ? 'ltr' : undefined}
      >
        {value || '—'}
      </span>
    </div>
  )
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">{children}</div>
}

function SectionCard({ step, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {step}
        </span>
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ── Section 1: Personal ──────────────────────────────────────────────────────

function PersonalSection({ patient }) {
  return (
    <SectionCard step={1} title="פרטים אישיים">
      <Grid>
        <Row label="שם מלא" value={patient.full_name} />
        <Row label='מספר ת"ז' value={patient.id_number} mono />
        <Row label="שם האב" value={patient.father_name} />
        <Row label="תאריך לידה" value={patient.birth_date} />
        <Row label="מין" value={GENDER_LABELS[patient.gender]} />
        <Row label="מצב משפחתי" value={MARITAL_LABELS[patient.marital_status]} />
        <Row label="מספר ילדים" value={patient.num_children != null ? String(patient.num_children) : null} />
        <Row label='תאריך הנפקת ת"ז' value={patient.id_issue_date} />
        <Row label='תוקף ת"ז' value={patient.id_expiry_date} />
      </Grid>
    </SectionCard>
  )
}

// ── Section 2: Address ───────────────────────────────────────────────────────

function AddressSection({ patient }) {
  return (
    <SectionCard step={2} title="כתובת וטלפון">
      <Grid>
        <Row label="עיר" value={patient.city} />
        <Row label="רחוב ומספר" value={[patient.street, patient.house_number].filter(Boolean).join(' ')} />
        <Row label="כניסה / קומה / דירה" value={[patient.entrance, patient.floor && `קומה ${patient.floor}`, patient.apartment && `דירה ${patient.apartment}`].filter(Boolean).join(', ')} />
        <Row label="מיקוד" value={patient.postal_code} mono />
        <Row label="טלפון ראשי" value={patient.phone ? `${patient.phone_prefix} ${patient.phone}` : null} mono ltr />
        <Row label="טלפון נוסף" value={patient.phone2 ? `${patient.phone2_prefix} ${patient.phone2}` : null} mono ltr />
      </Grid>
    </SectionCard>
  )
}

// ── Section 3: Emergency Contact ─────────────────────────────────────────────

function ContactSection({ patient }) {
  return (
    <SectionCard step={3} title="איש/אשת קשר חירום">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-blue-600 mb-2">קשר ראשי</p>
          <Grid>
            <Row label="שם" value={patient.ec_name} />
            <Row label="קרבה" value={patient.ec_relation} />
            <Row label="טלפון" value={patient.ec_phone ? `${patient.ec_phone_prefix} ${patient.ec_phone}` : null} mono ltr />
          </Grid>
        </div>
        {(patient.ec2_name || patient.ec2_phone) && (
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">קשר נוסף</p>
            <Grid>
              <Row label="שם" value={patient.ec2_name} />
              <Row label="קרבה" value={patient.ec2_relation} />
              <Row label="טלפון" value={patient.ec2_phone ? `${patient.ec2_phone_prefix} ${patient.ec2_phone}` : null} mono ltr />
            </Grid>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ── Section 4: Medical Info ───────────────────────────────────────────────────

function MedicalSection({ patient }) {
  return (
    <SectionCard step={4} title="מידע רפואי">
      <div className="space-y-4">
        <Grid>
          <Row label="קופת חולים" value={HMO_OPTIONS.find(o => o.value === patient.hmo_name)?.label} />
          <Row label="רמת ביטוח" value={(HMO_LEVELS[patient.hmo_name] || []).find(o => o.value === patient.hmo_level)?.label} />
          <Row label="שלב רפואי" value={STAGE_LABELS[patient.medical_stage]} />
          <Row label="סטטוס אבחנה" value={DIAG_LABELS[patient.diagnosis_status]} />
        </Grid>
        {patient.diagnosis_details && (
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">
              {patient.diagnosis_status === 'yes' ? 'שם האבחון' : patient.diagnosis_status === 'pending' ? 'חשד ל...' : 'סיבת הפנייה'}
            </p>
            <p className="text-sm text-slate-800 font-medium">{patient.diagnosis_details}</p>
          </div>
        )}
        <Grid>
          <Row label="תחום רפואה" value={patient.specialty} />
          <Row label="תת-תחום" value={patient.sub_specialty} />
        </Grid>
        {patient.referral_goal && (
          <div className="border-t border-slate-100 pt-3">
            <Row label="מטרת הפניה" value={REFERRAL_GOAL_LABELS[patient.referral_goal] || patient.referral_goal} />
            {patient.referral_goal === 'financial_mapping' && patient.referral_goal_sub && (
              <div className="mt-1 flex flex-wrap gap-1">
                {patient.referral_goal_sub.split(',').filter(Boolean).map(v => (
                  <span key={v} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{GOAL_SUB_LABELS[v] || v}</span>
                ))}
              </div>
            )}
            {patient.referral_goal === 'other' && patient.referral_goal_notes && (
              <p className="text-xs text-slate-500 mt-0.5">{patient.referral_goal_notes}</p>
            )}
          </div>
        )}
        {patient.referral_source && (
          <Row label="כיצד הגיע/ה?"
            value={[SOURCE_LABELS[patient.referral_source], SOURCE_SUB_LABELS[patient.referral_sub], patient.referral_name].filter(Boolean).join(' — ')} />
        )}
        {patient.notes && <Row label="הערות" value={patient.notes} />}
      </div>
    </SectionCard>
  )
}

// ── Section 5: Medications ───────────────────────────────────────────────────

function MedicationsSection({ patientId, medicationsCount }) {
  return (
    <SectionCard step={5} title="תרופות">
      <div className="flex items-center justify-between">
        <div>
          {medicationsCount > 0 ? (
            <p className="text-sm text-slate-700">{medicationsCount} תרופות רשומות בתיק</p>
          ) : (
            <p className="text-sm text-slate-400">אין תרופות רשומות</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">לניהול תרופות — עבור ללשונית "תרופות"</p>
        </div>
        <Link to={`/manager/patients/${patientId}/medications`}
          className="text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 whitespace-nowrap">
          עבור לתרופות ←
        </Link>
      </div>
    </SectionCard>
  )
}

// ── Score display helpers ────────────────────────────────────────────────────

const SCORE_BAR_COLOR  = { blue: '#2563eb', purple: '#9333ea', green: '#16a34a' }
const SCORE_TEXT_COLOR = { blue: 'text-blue-600', purple: 'text-purple-600', green: 'text-green-600' }

function ScoreBadge({ score, max, label, color }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 text-center">
      <p className="text-xs text-slate-400 mb-2">{label}</p>
      {score != null ? (
        <>
          <p className={`text-3xl font-bold ${SCORE_TEXT_COLOR[color]}`}>{score}</p>
          <p className="text-xs text-slate-400 mt-1">מתוך {max}</p>
          <div className="mt-2 bg-slate-200 rounded-full h-1.5">
            <div className="h-1.5 rounded-full"
              style={{ width: `${Math.min(100, (score / max) * 100)}%`, backgroundColor: SCORE_BAR_COLOR[color] }} />
          </div>
        </>
      ) : (
        <p className="text-2xl text-slate-300">—</p>
      )}
    </div>
  )
}

// ── Section 6: Functional Assessments ────────────────────────────────────────

function AssessmentsSection({ patient }) {
  let adl = {}, iadl = {}, mmse = {}
  try { adl  = JSON.parse(patient.adl_answers  || '{}') } catch {}
  try { iadl = JSON.parse(patient.iadl_answers || '{}') } catch {}
  try { mmse = JSON.parse(patient.mmse_answers || '{}') } catch {}

  const adlFilled  = Object.keys(adl).length  > 0
  const iadlFilled = Object.keys(iadl).length > 0
  const mmseFilled = Object.keys(mmse).length > 0

  return (
    <SectionCard step={6} title="הערכות תפקודיות">
      {/* Summary scores */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <ScoreBadge score={patient.adl_score}  max={100} label="ADL"  color="blue"   />
        <ScoreBadge score={patient.iadl_score} max={8}   label="IADL" color="purple" />
        <ScoreBadge score={patient.mmse_score} max={30}  label="MMSE" color="green"  />
      </div>

      {!adlFilled && !iadlFilled && !mmseFilled ? (
        <p className="text-sm text-slate-400 text-center py-4">לא הוזנו הערכות תפקודיות</p>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">

          {/* ADL */}
          <div className="rounded-xl border border-blue-100 overflow-hidden">
            <div className="flex items-center justify-between bg-blue-50 px-3 py-2.5 border-b border-blue-100">
              <p className="text-sm font-semibold text-blue-700">ADL</p>
              <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                {patient.adl_score ?? '—'} / 100
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {ADL_ITEMS.map(item => {
                const opt = item.options.find(o => String(o.v) === String(adl[item.key]))
                return (
                  <div key={item.key} className="px-3 py-2">
                    <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                    <p className="text-xs font-medium text-slate-800">
                      {opt ? <>{opt.l} <span className="text-slate-400">({opt.v})</span></> : <span className="text-slate-300">—</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* IADL */}
          <div className="rounded-xl border border-purple-100 overflow-hidden">
            <div className="flex items-center justify-between bg-purple-50 px-3 py-2.5 border-b border-purple-100">
              <p className="text-sm font-semibold text-purple-700">IADL</p>
              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                {patient.iadl_score ?? '—'} / 8
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {IADL_ITEMS.map(item => {
                const opt = item.options.find(o => String(o.v) === String(iadl[item.key]))
                return (
                  <div key={item.key} className="px-3 py-2">
                    <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                    <p className="text-xs font-medium text-slate-800">
                      {opt ? opt.l : <span className="text-slate-300">—</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* MMSE */}
          <div className="rounded-xl border border-green-100 overflow-hidden">
            <div className="flex items-center justify-between bg-green-50 px-3 py-2.5 border-b border-green-100">
              <p className="text-sm font-semibold text-green-700">MMSE</p>
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                {patient.mmse_score ?? '—'} / 30
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {MMSE_SECTIONS.map(sec => {
                const score = mmse[sec.key] != null ? Number(mmse[sec.key]) : null
                return (
                  <div key={sec.key} className="px-3 py-2">
                    <p className="text-xs text-slate-400 mb-0.5">{sec.label}</p>
                    <p className="text-xs font-medium text-slate-800">
                      {score != null ? <>{score} <span className="text-slate-400">/ {sec.max}</span></> : <span className="text-slate-300">—</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </SectionCard>
  )
}

// ── Section 7: Signatures ────────────────────────────────────────────────────

function SignaturesSection({ patient }) {
  const CONSENTS = [
    { key: 'consent_agreed',           label: 'הסכמה לטיפול רפואי',  sigPath: patient.consent_signature_path },
    { key: 'poa_agreed',               label: 'ייפוי כוח',            sigPath: patient.poa_signature_path },
    { key: 'financial_consent_agreed', label: 'הסכמה פיננסית',       sigPath: patient.financial_consent_signature_path },
  ]
  return (
    <SectionCard step={7} title="חתימות והסכמות">
      <div className="space-y-0">
        {CONSENTS.map(c => {
          const agreed = patient[c.key]
          return (
            <div key={c.key} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-700">{c.label}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                agreed || c.sigPath ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
              }`}>
                {agreed || c.sigPath ? '✓ חתום' : 'לא חתום'}
              </span>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PatientIntakeTab() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [patient, setPatient] = useState(null)
  const [activeSection, setActiveSection] = useState('personal')
  const [medCount, setMedCount] = useState(0)
  const { toast, showToast, dismissToast } = useToast()

  const load = useCallback(async () => {
    try {
      const [pr, mr] = await Promise.all([
        axios.get(`/api/patients/${id}`),
        axios.get(`/api/medications/patient/${id}`).catch(() => ({ data: { medications: [] } })),
      ])
      setPatient(pr.data)
      setMedCount(mr.data?.medications?.length ?? 0)
    } catch { showToast('שגיאה בטעינת הנתונים', 'error') }
  }, [id])

  useEffect(() => { load() }, [load, location.key])

  if (!patient) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">טוען...</div>
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'personal':    return <PersonalSection patient={patient} />
      case 'address':     return <AddressSection patient={patient} />
      case 'contact':     return <ContactSection patient={patient} />
      case 'medical':     return <MedicalSection patient={patient} />
      case 'medications': return <MedicationsSection patientId={id} medicationsCount={medCount} />
      case 'assessments': return <AssessmentsSection patient={patient} />
      case 'signatures':  return <SignaturesSection patient={patient} />
      default: return null
    }
  }

  return (
    <div className="p-4 md:p-6" dir="rtl">
      {toast && <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />}

      {/* Header row: section nav + edit button */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                activeSection === s.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                activeSection === s.key ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
              }`}>{s.step}</span>
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate(`/manager/patients/new?resume=${id}&step=0`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          ✏️ ערוך אינטייק
        </button>
      </div>

      {/* Active section content */}
      {renderSection()}
    </div>
  )
}
