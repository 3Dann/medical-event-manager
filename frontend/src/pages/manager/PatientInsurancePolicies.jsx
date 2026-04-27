import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
const Icon = ({ d, size = 15, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
)
const HeartPath   = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
const ActivityPath= "M22 12h-4l-3 9L9 3l-3 9H2"
const ShieldPath  = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
const ZapPath     = "M13 2L3 14h9l-1 8 10-12h-9l1-8z"
const BriefPath   = "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"
const BuildPath   = "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
const CpuPath     = "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
const PillPath    = "M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.5M13 12h9m-4.5-4.5 4.5 4.5-4.5 4.5"
const StethPath   = "M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"
const CheckPath   = "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"
const XCirclePath = "M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zm3.54-13.46L12 12l-3.54-3.54-1.42 1.42L10.59 12l-3.54 3.54 1.42 1.42L12 13.41l3.54 3.54 1.42-1.42L13.41 12l3.54-3.54-1.41-1.42z"
const AlertPath   = "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
const TrashPath   = "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
const EditPath    = "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
const SavePath    = "M19 21H5a2 2 0 0 0-2 2V7l5-5h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"
const PlusPath    = "M12 5v14M5 12h14"
const BanPath     = "M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"
const ClockPath   = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2"
const FileTextPath= "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
const DownloadPath= "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
const TrendPath   = "M23 6l-9.5 9.5-5-5L1 18"
const ChevUpPath  = "M18 15l-6-6-6 6"
const ChevDownPath= "M6 9l6 6 6-6"
const UploadPath  = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
const GitMergePath= "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21V9a9 9 0 0 0 9 9"

// ── Constants ─────────────────────────────────────────────────────────────────
const POLICY_TYPES_ROW1 = [
  { id: 'life',             label: 'ביטוח חיים',   iconPath: HeartPath,   color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', covKey: 'death_benefit' },
  { id: 'health',           label: 'ביטוח בריאות', iconPath: ActivityPath, color: '#00806b', bg: '#e6faf7', border: '#99e6d8', covKey: 'surgery' },
  { id: 'nursing',          label: 'ביטוח סיעוד',  iconPath: ShieldPath,  color: '#6d28d9', bg: '#f5f3ff', border: '#c4b5fd', covKey: 'nursing_care' },
  { id: 'critical_illness', label: 'מחלות קשות',   iconPath: ZapPath,     color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', covKey: 'critical_illness' },
  { id: 'disability',       label: 'אובדן כושר',   iconPath: BriefPath,   color: '#92400e', bg: '#fef3c7', border: '#fde68a', covKey: 'disability_monthly' },
]

const INSURERS = ['הראל', 'הפניקס', 'כלל ביטוח', 'מגדל', 'מנורה מבטחים', 'איילון', 'הכשרה', 'AIG ישראל', 'שירביט', 'הכשרה ביטוח', 'אחר']

const COVERAGE_LABELS = {
  surgery:              'ניתוח',
  hospitalization:      'אשפוז',
  second_opinion:       'חוות דעת שנייה',
  transplant:           'השתלות',
  rehabilitation:       'שיקום',
  advanced_tech:        'טיפולים בטכנולוגיות מתקדמות',
  critical_illness:     'מחלות קשות — חד פעמי',
  diagnostics:          'אבחון רפואי מהיר',
  specialist:           'ייעוץ מומחה',
  medications:          'תרופות שלא בסל הבריאות',
  nursing_care:         'סיעוד',
  disability_monthly:   'קצבת נכות חודשית',
  death_benefit:        'תגמולי פטירה',
  loss_of_work_capacity:'אובדן כושר עבודה',
}

const KUPAT_META = {
  clalit:   { label: 'כללית',  color: '#dc2626', bg: '#fef2f2' },
  maccabi:  { label: 'מכבי',   color: '#059669', bg: '#ecfdf5' },
  meuhedet: { label: 'מאוחדת', color: '#2563eb', bg: '#eff6ff' },
  leumit:   { label: 'לאומית', color: '#7c3aed', bg: '#f5f3ff' },
}

const TECH_ITEMS  = [
  { label: 'ניתוח רובוטי',          covKey: 'advanced_tech',   note: 'דה-וינצ׳י ומערכות רובוטיות' },
  { label: 'טיפול בפרוטונים',       covKey: 'advanced_tech',   note: 'קרינה ממוקדת' },
  { label: 'אימונותרפיה',           covKey: 'advanced_tech',   note: 'טיפולים ביולוגיים' },
  { label: 'השתלת תאי גזע',         covKey: 'advanced_tech',   note: 'אוטולוגית ואלוגנאית' },
  { label: 'בדיקות גנטיות',         covKey: 'specialist',      note: 'BRCA, WES, פנל גנטי' },
  { label: 'טיפול ממוקד (Targeted)', covKey: 'medications',    note: 'תרופות מולקולריות' },
]
const MED_ITEMS   = [
  { label: 'אונקולוגיה — מחוץ לסל', covKey: 'medications', note: 'Keytruda, Opdivo · 15–50K ₪/חודש' },
  { label: 'מחלות נדירות',           covKey: 'medications', note: 'עד 500K ₪/שנה' },
  { label: 'טרשת נפוצה — ביולוגיות',covKey: 'medications', note: '8–25K ₪/חודש' },
  { label: 'סוכרת — טיפולים חדשים', covKey: 'medications', note: 'Ozempic, CGM' },
  { label: 'השמנה — GLP-1',          covKey: 'medications', note: 'Wegovy · 1–2.5K ₪/חודש' },
]
const DIAG_ITEMS  = [
  { label: 'חוות דעת שנייה',         covKey: 'second_opinion', note: '1,500–8,000 ₪' },
  { label: 'הדמיה מתקדמת מהירה',    covKey: 'hospitalization', note: 'CT/MRI תוך 24–72 שעות' },
  { label: 'ייעוץ מומחה דחוף',       covKey: 'specialist',     note: 'תוך 48 שעות' },
  { label: 'פנל גנטי מהיר',          covKey: 'specialist',     note: '8–20K ₪' },
  { label: 'ביופסיה נוזלית (ctDNA)', covKey: 'surgery',        note: '3–12K ₪' },
]

const sourceLabel = (src) => {
  if (src.source_type === 'kupat_holim') return `קופ"ח ${src.hmo_name || ''}`
  if (src.source_type === 'sal_habriut') return 'סל הבריאות'
  if (src.source_type === 'har_habitua') return `הר הביטוח — ${src.company_name || ''}`
  if (src.source_type === 'bituch_leumi') return 'ביטוח לאומי'
  return `${src.company_name || 'פרטי'}`
}

// ── CoverageCard ──────────────────────────────────────────────────────────────
function CoverageCard({ iconPath, label, covered, color, bg, border, active, onClick }) {
  return (
    <button onClick={onClick}
      className="rounded-xl p-3.5 text-center transition-all w-full hover:scale-[1.02]"
      style={{
        background: covered ? bg : '#f8fafc',
        border: `${active ? '2px' : '1px'} solid ${active ? color : covered ? border : '#e2e8f0'}`,
        boxShadow: active ? `0 0 0 3px ${color}20` : 'none',
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
        style={{ background: covered ? bg : '#f1f5f9', border: `1px solid ${covered ? border : '#e2e8f0'}` }}>
        {covered
          ? <Icon d={iconPath} size={15} color={color} />
          : <Icon d={XCirclePath} size={15} color="#cbd5e1" />}
      </div>
      <p className="text-xs font-medium leading-tight" style={{ color: covered ? color : '#94a3b8' }}>{label}</p>
      <p className="text-xs mt-1" style={{ color: covered ? color + 'aa' : '#cbd5e1' }}>{covered ? 'מכוסה' : 'חסר'}</p>
      {active && <div className="flex justify-center mt-1.5"><Icon d={ChevUpPath} size={12} color={color} /></div>}
    </button>
  )
}

// ── CoverageDetailPanel ────────────────────────────────────────────────────────
function CoverageDetailPanel({ sources, covKey, title, refItems, patient }) {
  const relevant = covKey === 'kupah'
    ? sources.filter(s => s.source_type === 'kupat_holim')
    : covKey === 'national'
    ? sources.filter(s => s.source_type === 'bituch_leumi')
    : sources.filter(s => {
        if (['health', 'life', 'nursing', 'critical_illness', 'disability'].includes(covKey)) {
          // show private sources that have the relevant coverage
          const targetKeys = {
            life: ['death_benefit'],
            health: ['surgery', 'hospitalization', 'second_opinion', 'advanced_tech', 'medications', 'diagnostics'],
            nursing: ['nursing_care'],
            critical_illness: ['critical_illness'],
            disability: ['disability_monthly', 'loss_of_work_capacity'],
          }
          const keys = targetKeys[covKey] || []
          return s.coverages?.some(c => keys.includes(c.category))
        }
        return s.coverages?.some(c => c.category === covKey)
      })

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-1 rounded-xl p-4"
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title} — פירוט כיסויים</p>

      {covKey === 'kupah' ? (
        patient?.hmo_name ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold px-3 py-1 rounded-full"
                style={{ background: KUPAT_META[patient.hmo_name]?.bg, color: KUPAT_META[patient.hmo_name]?.color }}>
                {KUPAT_META[patient.hmo_name]?.label || patient.hmo_name}
                {patient.hmo_level && <span className="text-xs opacity-70 mr-1">· {patient.hmo_level}</span>}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'ביקורי רופא', covered: true,  note: 'רופא כללי ומומחה — כלול בדמי חבר' },
                { label: 'תרופות בסל',  covered: true,  note: 'בהשתתפות עצמית' },
                { label: 'אשפוז',       covered: true,  note: 'בתי חולים ממשלתיים' },
                { label: 'בדיקות מעבדה',covered: true,  note: 'דם, שתן ותרביות' },
                { label: 'ניתוחים פרטיים',covered: false,note: 'נדרש ביטוח משלים' },
                { label: 'תרופות מחוץ לסל',covered: false,note: 'נדרש ביטוח תרופות' },
              ].map(item => (
                <CovRow key={item.label} covered={item.covered} label={item.label} note={item.note} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-amber-600 text-sm flex items-center gap-2">
            <Icon d={AlertPath} size={14} color="#f59e0b" /> קופת חולים לא הוזנה בכרטיס המטופל
          </p>
        )
      ) : relevant.length === 0 ? (
        <p className="text-amber-600 text-sm flex items-center gap-2">
          <Icon d={AlertPath} size={14} color="#f59e0b" /> אין מקור ביטוח מתאים לסוג זה
        </p>
      ) : (
        relevant.map(src => (
          <div key={src.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon d={BuildPath} size={13} color="#8599b8" />
              <p className="text-slate-700 text-sm font-semibold">{sourceLabel(src)}</p>
              {src.policy_number && (
                <span className="text-slate-400 text-xs font-mono" dir="ltr">#{src.policy_number}</span>
              )}
              {src.notes?.includes('confidence:') && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#ecfdf5', color: '#059669' }}>
                  AI ✓
                </span>
              )}
            </div>
            {src.coverages?.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {src.coverages.map(cov => (
                  <CovRow key={cov.category}
                    covered={cov.is_covered}
                    label={COVERAGE_LABELS[cov.category] || cov.category}
                    note={cov.notes || (cov.coverage_amount ? `₪${Number(cov.coverage_amount).toLocaleString('he-IL')}` : '')}
                    waiting={cov.conditions}
                  />
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-xs">אין כיסויים מפורטים</p>
            )}
          </div>
        ))
      )}

      {/* Reference items */}
      {refItems && refItems.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">כיסויים אופייניים בשוק</p>
          <div className="grid grid-cols-2 gap-1.5">
            {refItems.map(item => {
              const isCovered = sources.some(s =>
                s.coverages?.some(c => c.category === item.covKey && c.is_covered)
              )
              return (
                <div key={item.label} className="flex items-start gap-2 p-2 rounded-lg"
                  style={{ background: isCovered ? '#ecfdf5' : '#f8fafc', border: `1px solid ${isCovered ? '#a7f3d0' : '#e2e8f0'}` }}>
                  {isCovered
                    ? <Icon d={CheckPath} size={13} color="#059669" className="mt-0.5 shrink-0" />
                    : <Icon d={XCirclePath} size={13} color="#cbd5e1" className="mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: isCovered ? '#065f46' : '#94a3b8' }}>{item.label}</p>
                    <p className="text-xs text-slate-400 truncate">{item.note}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CovRow({ covered, label, note, waiting }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg"
      style={{ background: covered ? '#ecfdf5' : '#f8fafc', border: `1px solid ${covered ? '#a7f3d0' : '#e2e8f0'}` }}>
      {covered
        ? <Icon d={CheckPath} size={13} color="#059669" className="mt-0.5 shrink-0" />
        : <Icon d={XCirclePath} size={13} color="#cbd5e1" className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: covered ? '#065f46' : '#94a3b8' }}>{label}</p>
        {note && <p className="text-xs text-slate-400 truncate">{note}</p>}
        {waiting && <p className="text-xs text-amber-500">המתנה: {waiting}</p>}
      </div>
    </div>
  )
}

// ── File upload zone ───────────────────────────────────────────────────────────
function FileUploadZone({ onUpload, uploading }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handle = (file) => { if (file) onUpload(file) }
  const onDrop = (e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className="rounded-xl border-2 border-dashed py-6 px-4 text-center cursor-pointer transition-all"
      style={{
        borderColor: dragging ? '#00806b' : '#cbd5e1',
        background: dragging ? '#e6faf7' : '#f8fafc',
      }}>
      <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.docx,.doc" className="hidden"
        onChange={e => handle(e.target.files[0])} />
      <Icon d={UploadPath} size={24} color={dragging ? '#00806b' : '#94a3b8'} className="mx-auto mb-2" />
      {uploading
        ? <p className="text-sm text-teal-600 font-medium">מנתח עם AI...</p>
        : <>
            <p className="text-sm font-medium text-slate-600">גרור פוליסה לכאן או לחץ להעלאה</p>
            <p className="text-xs text-slate-400 mt-1">PDF, Excel, Word — ניתוח AI אוטומטי</p>
          </>}
    </div>
  )
}

// ── Policy card (expandable) ──────────────────────────────────────────────────
function PolicyCard({ src, expanded, onToggle, onDelete, onSave }) {
  const [editMode, setEditMode] = useState(false)
  const [editedCoverages, setEditedCoverages] = useState([])
  const [editedExclusions, setEditedExclusions] = useState([])
  const [newExclusion, setNewExclusion] = useState('')
  const [saving, setSaving] = useState(false)

  const covCount = src.coverages?.filter(c => c.is_covered).length || 0
  const isAI = src.notes?.includes('AI') || src.notes?.includes('confidence')
  const statusMeta = isAI
    ? { label: 'נותח AI', color: '#059669', bg: '#ecfdf5' }
    : { label: 'ידני', color: '#2563eb', bg: '#eff6ff' }

  useEffect(() => {
    if (expanded) {
      setEditedCoverages(src.coverages ? [...src.coverages] : [])
      const notes = src.notes || ''
      const excMatch = notes.match(/חריגים: (.+)$/)
      setEditedExclusions(excMatch ? excMatch[1].split('|') : [])
    }
  }, [expanded, src])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(src.id, editedCoverages, editedExclusions)
      setEditMode(false)
    } finally { setSaving(false) }
  }

  const toggleCov = (idx) => {
    setEditedCoverages(prev => prev.map((c, i) => i === idx ? { ...c, is_covered: !c.is_covered } : c))
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
      {/* Header row */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-right transition-all hover:bg-slate-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{sourceLabel(src)}</span>
            {src.policy_number && (
              <span className="text-xs text-slate-400 font-mono" dir="ltr">#{src.policy_number}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: statusMeta.bg, color: statusMeta.color }}>
              {statusMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {covCount > 0 && (
              <span className="text-xs text-slate-500">{covCount} כיסויים פעילים</span>
            )}
            {src.notes?.match(/₪[\d,]+/)?.[0] && (
              <span className="text-xs text-slate-400">
                <Icon d={TrendPath} size={10} color="#94a3b8" className="inline mr-1" />
                {src.notes.match(/₪[\d,]+/)[0]}/חודש
              </span>
            )}
          </div>
        </div>
        <Icon d={expanded ? ChevUpPath : ChevDownPath} size={16} color="#94a3b8" />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Left: coverages */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">כיסויים</p>
                {!editMode && (
                  <button onClick={() => setEditMode(true)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ background: '#eff6ff', color: '#2563eb' }}>
                    <Icon d={EditPath} size={11} color="#2563eb" /> עריכה
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {(editMode ? editedCoverages : src.coverages || []).map((cov, idx) => (
                  <div key={cov.category || idx}
                    onClick={() => editMode && toggleCov(idx)}
                    className={`flex items-start gap-2 p-2 rounded-lg ${editMode ? 'cursor-pointer hover:opacity-80' : ''}`}
                    style={{
                      background: cov.is_covered ? '#ecfdf5' : '#f8fafc',
                      border: `1px solid ${cov.is_covered ? '#a7f3d0' : '#e2e8f0'}`,
                    }}>
                    {cov.is_covered
                      ? <Icon d={CheckPath} size={12} color="#059669" className="mt-0.5 shrink-0" />
                      : <Icon d={XCirclePath} size={12} color="#cbd5e1" className="mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium" style={{ color: cov.is_covered ? '#065f46' : '#94a3b8' }}>
                        {COVERAGE_LABELS[cov.category] || cov.category}
                      </p>
                      {cov.notes && <p className="text-xs text-slate-400 truncate">{cov.notes}</p>}
                      {cov.coverage_amount && (
                        <p className="text-xs text-slate-500">₪{Number(cov.coverage_amount).toLocaleString('he-IL')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: exclusions + meta */}
            <div className="space-y-3">
              {/* Exclusions */}
              {(editedExclusions.length > 0 || editMode) && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Icon d={BanPath} size={11} color="#94a3b8" /> חריגים
                    {editMode && <span className="text-red-500 normal-case font-normal mr-1">— עריכה</span>}
                  </p>
                  <div className="space-y-1">
                    {editedExclusions.map((exc, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                        <Icon d={AlertPath} size={11} color="#991b1b" />
                        <span className="flex-1">{exc}</span>
                        {editMode && (
                          <button onClick={() => setEditedExclusions(p => p.filter((_, j) => j !== i))}>
                            <Icon d={XCirclePath} size={11} color="#991b1b" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {editMode && (
                    <div className="flex gap-1 mt-1">
                      <input value={newExclusion} onChange={e => setNewExclusion(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newExclusion.trim()) { setEditedExclusions(p => [...p, newExclusion.trim()]); setNewExclusion('') }}}
                        placeholder="הוסף חריג..." className="flex-1 px-2 py-1 text-xs rounded-lg"
                        style={{ border: '1px solid #fca5a5', background: '#fff5f5' }} />
                      <button onClick={() => { if (newExclusion.trim()) { setEditedExclusions(p => [...p, newExclusion.trim()]); setNewExclusion('') }}}
                        className="px-2 py-1 text-xs rounded-lg" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                        +
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Meta */}
              {src.notes?.includes('confidence') && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
                  <Icon d={CheckPath} size={11} color="#059669" /> ניתוח AI בוצע
                </div>
              )}

              {/* Edit mode actions */}
              {editMode && (
                <div className="flex gap-2">
                  <button onClick={() => setEditMode(false)}
                    className="flex-1 py-1.5 text-xs rounded-lg text-slate-600"
                    style={{ border: '1px solid #e2e8f0' }}>ביטול</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 py-1.5 text-xs rounded-lg text-white flex items-center justify-center gap-1 disabled:opacity-50"
                    style={{ background: '#059669' }}>
                    <Icon d={SavePath} size={11} color="#fff" /> {saving ? 'שומר...' : 'שמור'}
                  </button>
                </div>
              )}

              {/* Delete */}
              {!editMode && (
                <button onClick={() => onDelete(src.id)}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 mt-1">
                  <Icon d={TrashPath} size={11} color="currentColor" /> הסר מקור ביטוח
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add source form ────────────────────────────────────────────────────────────
function AddSourceForm({ patientId, onDone }) {
  const [form, setForm] = useState({
    source_type: 'private', company_name: '', policy_number: '', notes: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await axios.post(`/api/patients/${patientId}/insurance`, form)
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-xl"
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <p className="text-sm font-semibold text-slate-700 mb-4">הוספת מקור ביטוח ידנית</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">סוג *</label>
          <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
            value={form.source_type} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}>
            <option value="private">ביטוח פרטי</option>
            <option value="kupat_holim">קופת חולים</option>
            <option value="bituch_leumi">ביטוח לאומי</option>
            <option value="har_habitua">הר הביטוח</option>
            <option value="sal_habriut">סל הבריאות</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">חברת ביטוח *</label>
          <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
            value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}>
            <option value="">— בחר —</option>
            {INSURERS.map(ins => <option key={ins} value={ins}>{ins}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">מספר פוליסה</label>
          <input dir="ltr" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono"
            value={form.policy_number} onChange={e => setForm(f => ({ ...f, policy_number: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-slate-500">ביטול</button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#00b89a,#009480)' }}>
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>
    </form>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PatientInsurancePolicies() {
  const { id } = useParams()
  const [patient, setPatient] = useState(null)
  const [sources, setSources] = useState([])
  const [expanded, setExpanded] = useState(null)       // card key
  const [expandedSrc, setExpandedSrc] = useState(null) // source id
  const [showAdd, setShowAdd] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [gaps, setGaps] = useState([])

  const fetchAll = useCallback(async () => {
    const [p, s] = await Promise.all([
      axios.get(`/api/patients/${id}`),
      axios.get(`/api/patients/${id}/insurance`),
    ])
    setPatient(p.data)
    setSources(s.data)

    // compute gaps
    const allCovKeys = Object.keys(COVERAGE_LABELS)
    const coveredKeys = new Set(
      s.data.flatMap(src => (src.coverages || []).filter(c => c.is_covered).map(c => c.category))
    )
    setGaps(allCovKeys.filter(k => !coveredKeys.has(k) && ['nursing_care', 'disability_monthly', 'critical_illness'].includes(k))
      .map(k => COVERAGE_LABELS[k]))
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggle = (key) => setExpanded(prev => prev === key ? null : key)

  const uploadPolicy = async (file) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await axios.post(`/api/patients/${id}/insurance/analyze-ai`, fd)
      await fetchAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'שגיאה בניתוח')
    } finally { setUploading(false) }
  }

  const deleteSource = async (srcId) => {
    if (!window.confirm('למחוק מקור ביטוח זה?')) return
    await axios.delete(`/api/patients/${id}/insurance/${srcId}`)
    fetchAll()
  }

  const saveCoverages = async (srcId, coverages, exclusions) => {
    for (const cov of coverages) {
      await axios.post(`/api/patients/${id}/insurance/${srcId}/coverage`, {
        category: cov.category,
        is_covered: cov.is_covered,
        coverage_amount: cov.coverage_amount || null,
        notes: cov.notes || null,
      })
    }
    fetchAll()
  }

  // Coverage card: is this type covered?
  const hasCov = (covKey) => sources.some(s => s.coverages?.some(c => c.category === covKey && c.is_covered))
  const hasType = (types) => sources.some(s => types.includes(s.source_type))

  const row2 = [
    { id: 'national',    label: 'ביטוח לאומי',             iconPath: BuildPath,   color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', covered: hasType(['bituch_leumi']) },
    { id: 'kupah',       label: patient?.hmo_name ? `קופ"ח ${KUPAT_META[patient.hmo_name]?.label || patient.hmo_name}` : 'קופת חולים', iconPath: ActivityPath, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', covered: !!patient?.hmo_name || hasType(['kupat_holim']) },
    { id: 'tech',        label: 'טכנולוגיות מתקדמות',      iconPath: CpuPath,     color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', covered: hasCov('advanced_tech') },
    { id: 'medications', label: 'תרופות שלא בסל',          iconPath: PillPath,    color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', covered: hasCov('medications') },
    { id: 'diagnosis',   label: 'אבחון רפואי מהיר',        iconPath: StethPath,   color: '#00806b', bg: '#e6faf7', border: '#99e6d8', covered: hasCov('diagnostics') || hasCov('second_opinion') },
  ]

  return (
    <div className="p-6 max-w-5xl">

      {/* Coverage gaps alert */}
      {gaps.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
          style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <Icon d={AlertPath} size={16} color="#d97706" className="mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-700 text-sm font-medium">כיסויים חסרים</p>
            <p className="text-amber-600 text-xs mt-0.5">{gaps.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* ── Row 1: Private insurance types ── */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ביטוח פרטי</p>
      <div className="grid grid-cols-5 gap-3 mb-1">
        {POLICY_TYPES_ROW1.map(type => (
          <CoverageCard key={type.id}
            iconPath={type.iconPath} label={type.label}
            covered={hasCov(type.covKey)}
            color={type.color} bg={type.bg} border={type.border}
            active={expanded === type.id}
            onClick={() => toggle(type.id)}
          />
        ))}
      </div>
      {expanded && POLICY_TYPES_ROW1.some(t => t.id === expanded) && (
        <CoverageDetailPanel sources={sources} covKey={expanded}
          title={POLICY_TYPES_ROW1.find(t => t.id === expanded)?.label}
          patient={patient}
        />
      )}

      {/* ── Row 2: National + kupah + categories ── */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-5">כיסויים נוספים</p>
      <div className="grid grid-cols-5 gap-3 mb-1">
        {row2.map(card => (
          <CoverageCard key={card.id}
            iconPath={card.iconPath} label={card.label}
            covered={card.covered}
            color={card.color} bg={card.bg} border={card.border}
            active={expanded === card.id}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>
      {expanded === 'national' && <CoverageDetailPanel sources={sources} covKey="national" title="ביטוח לאומי" patient={patient} />}
      {expanded === 'kupah'    && <CoverageDetailPanel sources={sources} covKey="kupah"    title="קופת חולים" patient={patient} />}
      {expanded === 'tech'        && <CoverageDetailPanel sources={sources} covKey="tech"     title="טכנולוגיות מתקדמות" refItems={TECH_ITEMS} patient={patient} />}
      {expanded === 'medications' && <CoverageDetailPanel sources={sources} covKey="medications" title="תרופות שלא בסל" refItems={MED_ITEMS} patient={patient} />}
      {expanded === 'diagnosis'   && <CoverageDetailPanel sources={sources} covKey="diagnosis"   title="אבחון רפואי מהיר" refItems={DIAG_ITEMS} patient={patient} />}

      {/* ── Policies section ── */}
      <div className="rounded-xl overflow-hidden mt-6" style={{ border: '1px solid #e2e8f0' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e8eef6' }}>
          <div className="flex items-center gap-2.5">
            <Icon d={ShieldPath} size={15} color="#00b89a" />
            <h2 className="text-sm font-semibold text-slate-700">מקורות ביטוח</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ background: '#e6faf7', color: '#00806b', border: '1px solid rgba(0,184,154,0.2)' }}>
              {sources.length}
            </span>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: showAdd ? '#fef2f2' : '#e6faf7',
              color: showAdd ? '#dc2626' : '#00806b',
              border: `1px solid ${showAdd ? '#fecaca' : '#99e6d8'}`,
            }}>
            <Icon d={showAdd ? XCirclePath : PlusPath} size={13} color="currentColor" />
            {showAdd ? 'ביטול' : 'הוסף מקור ביטוח'}
          </button>
        </div>

        <div className="p-5">
          {/* Upload zone */}
          <div className="mb-4">
            <FileUploadZone onUpload={uploadPolicy} uploading={uploading} />
            <p className="text-xs text-slate-400 text-center mt-1.5">
              ✨ ניתוח AI אוטומטי — Claude מחלץ את כל הכיסויים, הסכומים והחריגים
            </p>
          </div>

          {showAdd && (
            <AddSourceForm patientId={id} onDone={() => { setShowAdd(false); fetchAll() }} />
          )}

          {/* Policy list */}
          {sources.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Icon d={ShieldPath} size={32} color="#cbd5e1" className="mx-auto mb-2" />
              <p className="text-sm">אין מקורות ביטוח — העלה פוליסה לניתוח AI</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map(src => (
                <PolicyCard
                  key={src.id}
                  src={src}
                  expanded={expandedSrc === src.id}
                  onToggle={() => setExpandedSrc(p => p === src.id ? null : src.id)}
                  onDelete={deleteSource}
                  onSave={saveCoverages}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
