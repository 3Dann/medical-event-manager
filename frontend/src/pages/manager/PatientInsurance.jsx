import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const SOURCE_TYPE_LABELS = {
  sal_habriut: 'סל הבריאות', kupat_holim: 'קופת חולים',
  har_habitua: 'הר הביטוח', private: 'ביטוח פרטי', bituch_leumi: 'ביטוח לאומי',
}
const CATEGORIES = [
  { key: 'second_opinion',   label: 'חוות דעת',           desc: 'רשימה מוסדרת / חופשית' },
  { key: 'surgery',          label: 'ניתוחים',             desc: 'בארץ / חו"ל' },
  { key: 'transplant',       label: 'השתלות',              desc: 'בארץ / חו"ל' },
  { key: 'hospitalization',  label: 'אישפוזים',            desc: 'ימי אשפוז, חדר פרטי' },
  { key: 'rehabilitation',   label: 'שיקום / טיפולים',    desc: 'פיזיותרפיה, שעות טיפול' },
  { key: 'advanced_tech',    label: 'טכנולוגיות חדישות',  desc: 'תרופות / ציוד מחוץ לסל' },
  { key: 'critical_illness', label: 'תגמול חד פעמי',      desc: 'מחלות קשות' },
  { key: 'diagnostics',      label: 'בדיקות והדמיה',      desc: 'MRI, CT, ביופסיה, פענוח מהיר' },
]
const HMO_NAMES  = { clalit:'כללית', maccabi:'מכבי', meuhedet:'מאוחדת', leumit:'לאומית' }
const HMO_LEVELS = { basic:'בסיס', mushlam:'משלים', premium:'פרמיום', zahav:'זהב' }
const ENTITLEMENT_TYPES = { existing:'קיימת', potential:'פוטנציאלית', projected:'צפויה (שנה הקרובה)' }

const PRIVATE_COMPANIES = [
  'הראל', 'מגדל', 'כלל ביטוח', 'הפניקס', 'מנורה מבטחים',
  'איילון', 'שירביט', 'הכשרה', 'ביטוח ישיר', 'AIG ישראל',
  'Allianz ישראל', 'מיטב', 'פסגות', 'אריה',
]

const emptyCoverages = () => Object.fromEntries(
  CATEGORIES.map(c => [c.key, { is_covered:false, coverage_amount:'', coverage_percentage:'', copay:'', annual_limit:'', conditions:'', abroad_covered:false, notes:'' }])
)

function sourceLabel(s) {
  if (s.source_type==='sal_habriut')  return 'סל הבריאות'
  if (s.source_type==='kupat_holim')  return `קופ"ח ${HMO_NAMES[s.hmo_name]||s.hmo_name} — ${HMO_LEVELS[s.hmo_level]||s.hmo_level}`
  if (s.source_type==='har_habitua')  return `הר הביטוח — ${s.company_name||''}`
  if (s.source_type==='private')      return `${s.company_name||'פרטי'} (${s.policy_type==='disability'?'אובדן כושר עבודה':'ביטוח רפואי'})`
  if (s.source_type==='bituch_leumi') return 'ביטוח לאומי'
  return s.source_type
}

export default function PatientInsurance() {
  const { id } = useParams()
  const [sources, setSources]         = useState([])
  const [entitlements, setEntitlements] = useState([])
  const [showForm, setShowForm]       = useState(false)
  const [expandedSource, setExpandedSource] = useState(null)
  const [showEntitlementForm, setShowEntitlementForm] = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [excelResult, setExcelResult] = useState(null)
  const [importingSal, setImportingSal] = useState(false)
  const [salResult, setSalResult]     = useState(null)
  const [importingBL, setImportingBL]  = useState(false)
  const [blResult, setBlResult]        = useState(null)
  const [showHarGuide, setShowHarGuide]     = useState(false)
  const [importingHmo, setImportingHmo]     = useState(false)
  const [hmoResult, setHmoResult]           = useState(null)
  const [uploadingPrivate, setUploadingPrivate] = useState(false)
  const [privateUploadResult, setPrivateUploadResult] = useState(null)
  const [customCompany, setCustomCompany] = useState(false)

  const [form, setForm] = useState({ source_type:'kupat_holim', hmo_name:'clalit', hmo_level:'mushlam', company_name:'', policy_number:'', policy_type:'regular', notes:'' })
  const [coverages, setCoverages] = useState(emptyCoverages())
  const [entForm, setEntForm] = useState({ entitlement_type:'existing', title:'', description:'', amount:'', is_approved:false, notes:'' })

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const [s, e] = await Promise.all([
      axios.get(`/api/patients/${id}/insurance`),
      axios.get(`/api/patients/${id}/entitlements`),
    ])
    setSources(s.data); setEntitlements(e.data)
  }

  const isDuplicate = () => sources.some(s => {
    if (s.source_type !== form.source_type) return false
    if (['sal_habriut','bituch_leumi'].includes(form.source_type)) return true
    if (form.source_type==='kupat_holim') return s.hmo_name===form.hmo_name && s.hmo_level===form.hmo_level
    return s.company_name===form.company_name && s.policy_number===form.policy_number
  })

  const handleAddSource = async (e) => {
    e.preventDefault()
    if (isDuplicate()) return
    const res = await axios.post(`/api/patients/${id}/insurance`, form)
    const srcId = res.data.id
    for (const cat of CATEGORIES) {
      const cov = coverages[cat.key]
      await axios.post(`/api/patients/${id}/insurance/${srcId}/coverage`, {
        category: cat.key,
        is_covered: cov.is_covered,
        coverage_amount:    cov.coverage_amount    ? parseFloat(cov.coverage_amount)    : null,
        coverage_percentage:cov.coverage_percentage? parseFloat(cov.coverage_percentage): null,
        copay:              cov.copay              ? parseFloat(cov.copay)              : null,
        annual_limit:       cov.annual_limit       ? parseFloat(cov.annual_limit)       : null,
        conditions:    cov.conditions  || null,
        abroad_covered: cov.abroad_covered,
        notes:          cov.notes      || null,
      })
    }
    setShowForm(false); setCoverages(emptyCoverages()); setCustomCompany(false); fetchAll()
  }

  const handleEditCoverage = async (sourceId, category, field, value) => {
    const src = sources.find(s=>s.id===sourceId)
    const existing = src?.coverages.find(c=>c.category===category) || {}
    const updated = { ...existing, [field]: value, category }
    await axios.post(`/api/patients/${id}/insurance/${sourceId}/coverage`, {
      category,
      is_covered:          updated.is_covered          ?? false,
      coverage_amount:     updated.coverage_amount     ? parseFloat(updated.coverage_amount)     : null,
      coverage_percentage: updated.coverage_percentage ? parseFloat(updated.coverage_percentage) : null,
      copay:               updated.copay               ? parseFloat(updated.copay)               : null,
      annual_limit:        updated.annual_limit        ? parseFloat(updated.annual_limit)        : null,
      conditions:     updated.conditions  || null,
      abroad_covered: updated.abroad_covered ?? false,
      notes:          updated.notes       || null,
    })
    fetchAll()
  }

  const handleDeleteSource = async (sourceId) => {
    if (!confirm('למחוק מקור ביטוח זה?')) return
    await axios.delete(`/api/patients/${id}/insurance/${sourceId}`); fetchAll()
  }

  const handleUploadExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''; setUploading(true); setExcelResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await axios.post(`/api/patients/${id}/insurance/upload-excel`, fd)
      setExcelResult({ success:true, ...res.data }); fetchAll()
    } catch(err) {
      setExcelResult({ success:false, error: err.response?.data?.detail||err.message })
    } finally { setUploading(false) }
  }

  const handleImportHmo = async () => {
    setImportingHmo(true); setHmoResult(null)
    try {
      const p = await axios.get(`/api/patients/${id}`)
      if (!p.data.id_number) {
        setHmoResult({ success: false, message: 'אין מספר ת.ז. בתיק המטופל — עדכן תחילה בלשונית פרטים' })
        return
      }
      if (!p.data.hmo_name) {
        setHmoResult({ success: false, message: 'לא הוגדרה קופת חולים בתיק — עדכן תחילה בלשונית פרטים' })
        return
      }
      const res = await axios.post('/api/import/kupat-holim', { id_number: p.data.id_number })
      setHmoResult({ success: true, message: res.data.message, imported: res.data.imported })
      fetchAll()
    } catch (err) {
      setHmoResult({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally { setImportingHmo(false) }
  }

  const handleImportBituchLeumi = async () => {
    setImportingBL(true); setBlResult(null)
    try {
      const p = await axios.get(`/api/patients/${id}`)
      if (!p.data.id_number) {
        setBlResult({ success: false, message: 'אין מספר ת.ז. בתיק המטופל — עדכן תחילה בלשונית פרטים' })
        return
      }
      const res = await axios.post('/api/import/bituch-leumi', { id_number: p.data.id_number })
      setBlResult({ success: true, message: res.data.message, count: res.data.entitlements_imported })
      fetchAll()
    } catch (err) {
      setBlResult({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally { setImportingBL(false) }
  }

  const handleUploadPrivate = async (e) => {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''; setUploadingPrivate(true); setPrivateUploadResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await axios.post(`/api/patients/${id}/insurance/upload-private`, fd)
      setPrivateUploadResult({ success: true, ...res.data })
      setShowForm(false); fetchAll()
    } catch (err) {
      setPrivateUploadResult({ success: false, error: err.response?.data?.detail || err.message })
    } finally { setUploadingPrivate(false) }
  }

  const handleDeleteEntitlement = async (entId) => {
    if (!confirm('למחוק זכאות זו?')) return
    await axios.delete(`/api/patients/${id}/entitlements/${entId}`); fetchAll()
  }

  const handleAddEntitlement = async (e) => {
    e.preventDefault()
    await axios.post(`/api/patients/${id}/entitlements`, { ...entForm, amount: entForm.amount ? parseFloat(entForm.amount) : null })
    setShowEntitlementForm(false); fetchAll()
  }

  const updateCovField = (catKey, field, value) =>
    setCoverages(prev => ({ ...prev, [catKey]: { ...prev[catKey], [field]: value } }))

  const handleImportSal = async () => {
    setImportingSal(true); setSalResult(null)
    try {
      // Get patient id_number first
      const p = await axios.get(`/api/patients/${id}`)
      if (!p.data.id_number) {
        setSalResult({ success: false, message: 'אין מספר ת.ז. בתיק המטופל — עדכן תחילה בלשונית פרטים' })
        return
      }
      const res = await axios.post('/api/import/sal-habriut', { id_number: p.data.id_number })
      setSalResult({ success: true, message: res.data.message, count: res.data.coverages_imported })
      fetchAll()
    } catch (err) {
      setSalResult({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally { setImportingSal(false) }
  }

  // ── Coverage table component ──────────────────────────────────────────
  const CoverageTable = ({ catCoverages, editable, sourceId }) => (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200 w-36">קטגוריה</th>
            <th className="text-center p-2 font-medium text-slate-600 border border-slate-200 w-16">מכוסה</th>
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">סכום (₪)</th>
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">אחוז (%)</th>
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">השת"ע (₪)</th>
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">תקרה (₪)</th>
            <th className="text-right p-2 font-medium text-slate-600 border border-slate-200 w-40">תנאים</th>
            <th className="text-center p-2 font-medium text-slate-600 border border-slate-200 w-14">חו"ל</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(cat => {
            const cov = editable
              ? catCoverages[cat.key]
              : (catCoverages?.find(c=>c.category===cat.key) || {})
            const covered = editable ? cov.is_covered : !!cov.is_covered
            return (
              <tr key={cat.key} className={`${covered ? 'bg-green-50' : 'bg-white'} hover:bg-slate-50`}>
                <td className="p-2 border border-slate-200 font-medium text-slate-700 text-xs" title={`${cat.label} — ${cat.desc}`}>
                  {cat.label}
                  <div className="text-slate-400 font-normal">{cat.desc}</div>
                </td>
                <td className="p-2 border border-slate-200 text-center">
                  {editable ? (
                    <input type="checkbox" checked={covered}
                      onChange={e => updateCovField(cat.key, 'is_covered', e.target.checked)}
                      className="w-4 h-4 accent-green-600" />
                  ) : (
                    <span className={`text-base ${covered ? 'text-green-500' : 'text-red-400'}`}>{covered ? '✓' : '✗'}</span>
                  )}
                </td>
                {['coverage_amount','coverage_percentage','copay','annual_limit'].map(field => (
                  <td key={field} className="p-1 border border-slate-200" title={covered && cov[field] ? String(cov[field]) : ''}>
                    {editable ? (
                      <input type="number" className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"
                        value={cov[field]||''}
                        onChange={e => updateCovField(cat.key, field, e.target.value)}
                        disabled={!covered} placeholder={covered?'—':''} />
                    ) : (
                      <span className="text-xs text-slate-700">
                        {covered && cov[field] ? Number(cov[field]).toLocaleString() : covered ? <span className="text-slate-300">—</span> : ''}
                      </span>
                    )}
                  </td>
                ))}
                <td className="p-1 border border-slate-200 max-w-[160px]" title={covered && cov.conditions ? cov.conditions : ''}>
                  {editable ? (
                    <input className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"
                      value={cov.conditions||''}
                      onChange={e => updateCovField(cat.key, 'conditions', e.target.value)}
                      disabled={!covered} />
                  ) : (
                    <span className="text-xs text-slate-600 truncate block max-w-[150px]" title={covered && cov.conditions ? cov.conditions : ''}>
                      {covered && cov.conditions ? cov.conditions : ''}
                    </span>
                  )}
                </td>
                <td className="p-2 border border-slate-200 text-center">
                  {editable ? (
                    <input type="checkbox" checked={!!cov.abroad_covered}
                      onChange={e => updateCovField(cat.key, 'abroad_covered', e.target.checked)}
                      disabled={!covered} className="w-4 h-4 accent-blue-600" />
                  ) : (
                    covered && cov.abroad_covered ? <span className="text-blue-500 text-xs">✓</span> : ''
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ── Editable coverage table for existing source ───────────────────────
  const EditableCoverageTable = ({ source }) => {
    const [newCatLabel, setNewCatLabel] = React.useState('')
    const [showAddRow, setShowAddRow]   = React.useState(false)

    const handleDeleteCoverage = async (covId) => {
      await axios.delete(`/api/patients/${id}/insurance/${source.id}/coverage/${covId}`)
      fetchAll()
    }

    const handleAddCustom = async () => {
      if (!newCatLabel.trim()) return
      const catKey = `custom_${Date.now()}`
      await axios.post(`/api/patients/${id}/insurance/${source.id}/coverage`, {
        category: newCatLabel.trim(), is_covered: true, abroad_covered: false,
      })
      setNewCatLabel(''); setShowAddRow(false); fetchAll()
    }

    // All rows: standard categories + any custom coverages not in CATEGORIES
    const standardKeys = CATEGORIES.map(c => c.key)
    const customCovs = source.coverages.filter(c => !standardKeys.includes(c.category))

    const CovRow = ({ catLabel, catDesc, cov }) => {
      const covered = !!cov.is_covered
      return (
        <tr className={`${covered ? 'bg-green-50' : 'bg-white'} group`}>
          <td className="p-2 border border-slate-200 font-medium text-slate-700 text-xs" title={catDesc || catLabel}>
            {catLabel}
            {catDesc && <div className="text-slate-400 font-normal">{catDesc}</div>}
          </td>
          <td className="p-2 border border-slate-200 text-center">
            <input type="checkbox" checked={covered}
              onChange={e => handleEditCoverage(source.id, cov.category, 'is_covered', e.target.checked)}
              className="w-4 h-4 accent-green-600" />
          </td>
          {[['coverage_amount', cov.coverage_amount], ['coverage_percentage', cov.coverage_percentage],
            ['copay', cov.copay], ['annual_limit', cov.annual_limit]].map(([field, val]) => (
            <td key={field} className="p-1 border border-slate-200" title={val != null ? String(val) : ''}>
              <input type="number" disabled={!covered}
                className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 disabled:opacity-30"
                defaultValue={val||''}
                onBlur={e => covered && handleEditCoverage(source.id, cov.category, field, e.target.value ? parseFloat(e.target.value) : null)} />
            </td>
          ))}
          <td className="p-1 border border-slate-200 max-w-[160px]" title={cov.conditions || ''}>
            <input disabled={!covered}
              className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 disabled:opacity-30"
              defaultValue={cov.conditions||''} title={cov.conditions || ''}
              onBlur={e => covered && handleEditCoverage(source.id, cov.category, 'conditions', e.target.value)} />
          </td>
          <td className="p-2 border border-slate-200 text-center">
            <input type="checkbox" checked={!!cov.abroad_covered} disabled={!covered}
              onChange={e => handleEditCoverage(source.id, cov.category, 'abroad_covered', e.target.checked)}
              className="w-4 h-4 accent-blue-600 disabled:opacity-30" />
          </td>
          <td className="p-1 border border-slate-200 text-center w-7">
            {cov.id && (
              <button onClick={() => handleDeleteCoverage(cov.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity"
                title="מחק כיסוי">✕</button>
            )}
          </td>
        </tr>
      )
    }

    return (
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200 w-36">קטגוריה</th>
              <th className="text-center p-2 font-medium text-slate-600 border border-slate-200 w-16">מכוסה</th>
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">סכום (₪)</th>
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">אחוז (%)</th>
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">השת"ע (₪)</th>
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200">תקרה (₪)</th>
              <th className="text-right p-2 font-medium text-slate-600 border border-slate-200 w-40">תנאים</th>
              <th className="text-center p-2 font-medium text-slate-600 border border-slate-200 w-14">חו"ל</th>
              <th className="w-7 border border-slate-200"></th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(cat => {
              const cov = source.coverages.find(c => c.category === cat.key) || { category: cat.key, is_covered: false }
              return <CovRow key={cat.key} catLabel={cat.label} catDesc={cat.desc} cov={cov} />
            })}
            {customCovs.map(cov => (
              <CovRow key={cov.id} catLabel={cov.category} cov={cov} />
            ))}
            {showAddRow && (
              <tr className="bg-blue-50">
                <td className="p-2 border border-slate-200" colSpan={9}>
                  <div className="flex items-center gap-2">
                    <input autoFocus className="input text-xs flex-1 py-1"
                      placeholder="שם סוג הכיסוי (לדוג׳: כיסוי נסיעות לחו״ל)"
                      value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') { setShowAddRow(false); setNewCatLabel('') } }} />
                    <button onClick={handleAddCustom} className="btn-primary text-xs py-1 px-3">הוסף</button>
                    <button onClick={() => { setShowAddRow(false); setNewCatLabel('') }} className="btn-secondary text-xs py-1 px-2">ביטול</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-400">שינויים נשמרים אוטומטית עם יציאה מהשדה</p>
          <button onClick={() => setShowAddRow(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            + הוסף סוג כיסוי
          </button>
        </div>
      </div>
    )
  }

  // ── הר הביטוח guide modal ────────────────────────────────────────────
  const HarBituaGuide = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg">📊</div>
            <div>
              <h3 className="font-bold text-slate-800">ייבוא נתונים מהר הביטוח</h3>
              <p className="text-xs text-slate-500">הוראות מפורטות להורדה והעלאה</p>
            </div>
          </div>
          <button onClick={() => setShowHarGuide(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Section A: Download */}
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">שלב א׳ — הורדת הקובץ מהר הביטוח</p>

          {[
            { n:1, icon:'🌐', title:'כניסה לאתר', detail: 'בדפדפן שלך הקלד: www.hrb.gov.il — זהו האתר הרשמי של מאגר הביטוח הלאומי.' },
            { n:2, icon:'🔐', title:'כניסה לאזור האישי', detail: 'לחץ על הכפתור "כניסה לאזור האישי" בפינה הימנית עליונה של האתר. הזן את מספר תעודת הזהות של המטופל ומספר הטלפון הנייד הרשום.' },
            { n:3, icon:'📱', title:'קבלת קוד אימות (OTP)', detail: 'תוך שניות ישלח SMS עם קוד בן 6 ספרות לטלפון הנייד. הזן את הקוד בשדה המיועד ולחץ "אישור".' },
            { n:4, icon:'📋', title:'צפייה ברשימת הפוליסות', detail: 'לאחר הכניסה תוצג רשימה מלאה של כל הפוליסות הפעילות — ביטוח בריאות, חיים, סיעוד, תאונות אישיות, אובדן כושר עבודה ועוד.' },
            { n:5, icon:'⬇️', title:'ייצוא לאקסל', detail: 'מעל לרשימת הפוליסות חפש את הכפתור "ייצוא לאקסל" או סמל ⬇️. לחץ עליו — הקובץ יורד אוטומטית למחשב שלך (בדרך כלל לתיקיית "הורדות").' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{step.n}</div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span>{step.icon}</span>
                  <span className="font-semibold text-sm text-slate-800">{step.title}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{step.detail}</p>
              </div>
            </div>
          ))}

          {/* Section B: Upload */}
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-2">שלב ב׳ — העלאה למערכת</p>

          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
            <div className="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">6</div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span>📤</span>
                <span className="font-semibold text-sm text-slate-800">העלאת הקובץ למערכת</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-2">
                לאחר שהקובץ הורד למחשב — לחץ על הכפתור הירוק למטה, אתר את הקובץ בתיקיית "הורדות" ובחר אותו. המערכת תנתח אוטומטית את הפוליסות ותוסיף אותן לתיק.
              </p>
              <label className="inline-flex items-center gap-2 bg-green-600 text-white text-sm px-4 py-2 rounded-lg cursor-pointer hover:bg-green-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                בחר קובץ Excel מהר הביטוח
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { setShowHarGuide(false); handleUploadExcel(e) }} />
              </label>
            </div>
          </div>

          {/* Format tip */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">מה מכיל הקובץ?</span> שם חברת הביטוח, מספר פוליסה, סוג הביטוח (בריאות / חיים / סיעוד / נכות), תאריך תחילה ותאריך סיום. המערכת מזהה את העמודות אוטומטית ויוצרת רשומה נפרדת לכל פוליסה.
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-8 space-y-6">
      {/* Modals */}
      {showHarGuide && <HarBituaGuide />}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">מקורות ביטוח</h2>
        <div className="flex gap-2">
          <button onClick={handleImportSal} disabled={importingSal}
            className="btn-secondary text-sm">
            {importingSal ? 'מייבא...' : '🏥 ייבוא סל הבריאות'}
          </button>
          <button onClick={handleImportHmo} disabled={importingHmo}
            className="btn-secondary text-sm">
            {importingHmo ? 'מייבא...' : '🏨 ייבוא קופת חולים'}
          </button>
          <button onClick={handleImportBituchLeumi} disabled={importingBL}
            className="btn-secondary text-sm">
            {importingBL ? 'מייבא...' : '🏛️ ייבוא ביטוח לאומי'}
          </button>
          <button onClick={() => setShowHarGuide(true)} className="btn-secondary text-sm">
            📊 הר הביטוח (Excel)
          </button>
          <button onClick={() => { setShowForm(true); setCoverages(emptyCoverages()) }} className="btn-primary text-sm">+ הוסף מקור</button>
        </div>
      </div>

      {/* Sal habriut import result */}
      {salResult && (
        <div className={`rounded-xl p-3 text-sm ${salResult.success?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
          {salResult.success
            ? `✅ ${salResult.message} — ${salResult.count} כיסויים יובאו`
            : `❌ ${salResult.message}`}
          <button onClick={() => setSalResult(null)} className="text-xs text-slate-400 mr-3 hover:underline">סגור</button>
        </div>
      )}

      {/* HMO import result */}
      {hmoResult && (
        <div className={`rounded-xl p-3 text-sm ${hmoResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {hmoResult.success
            ? `✅ ${hmoResult.message}`
            : `❌ ${hmoResult.message}`}
          <button onClick={() => setHmoResult(null)} className="text-xs text-slate-400 mr-3 hover:underline">סגור</button>
        </div>
      )}

      {/* Bituch leumi import result */}
      {blResult && (
        <div className={`rounded-xl p-3 text-sm ${blResult.success?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
          {blResult.success
            ? `✅ ${blResult.message} — ${blResult.count} זכאויות יובאו`
            : `❌ ${blResult.message}`}
          <button onClick={() => setBlResult(null)} className="text-xs text-slate-400 mr-3 hover:underline">סגור</button>
        </div>
      )}

      {/* Private upload result */}
      {privateUploadResult && (
        <div className={`rounded-xl p-4 text-sm ${privateUploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {privateUploadResult.success ? (
            <div>
              <p className="font-semibold text-green-700">✅ {privateUploadResult.message}</p>
              <div className="text-green-600 text-xs mt-1 space-y-0.5">
                {privateUploadResult.company_name && <p>חברה: {privateUploadResult.company_name}</p>}
                {privateUploadResult.policy_number && <p>פוליסה: {privateUploadResult.policy_number}</p>}
                <p>כיסויים שזוהו: {privateUploadResult.coverages_detected}</p>
              </div>
              <p className="text-amber-600 text-xs mt-2">⚠️ {privateUploadResult.note}</p>
            </div>
          ) : (
            <p className="text-red-700">❌ {privateUploadResult.error}</p>
          )}
          <button onClick={() => setPrivateUploadResult(null)} className="text-xs text-slate-400 mt-2 block hover:underline">סגור</button>
        </div>
      )}

      {/* Excel result */}
      {excelResult && (
        <div className={`rounded-xl p-4 text-sm ${excelResult.success?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
          {excelResult.success ? (
            <div>
              <p className="font-semibold text-green-700 mb-1">✅ {excelResult.message}</p>
              <p className="text-green-600 text-xs">עמודות שזוהו: {excelResult.detected_headers?.filter(h=>h).join(' | ')}</p>
              {excelResult.skipped > 0 && <p className="text-yellow-600 mt-1">⚠️ {excelResult.skipped} שורות דולגו</p>}
              {excelResult.policies?.map((p,i) => (
                <div key={i} className="text-green-700 text-xs mt-0.5">• {p.company} {p.policy_number?`— פוליסה ${p.policy_number}`:''} {p.policy_type?`(${p.policy_type})`:''}</div>
              ))}
            </div>
          ) : (
            <div>
              <p className="font-semibold text-red-700">❌ שגיאה: {excelResult.error}</p>
              <p className="text-red-500 text-xs mt-1">פורמט מצופה: עמודות חברה | מספר פוליסה | סוג ביטוח</p>
            </div>
          )}
          <button onClick={() => setExcelResult(null)} className="text-xs text-slate-400 mt-2 hover:underline">סגור</button>
        </div>
      )}

      {/* Add source modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-4">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="font-semibold text-lg">הוספת מקור ביטוח</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleAddSource}>
              <div className="p-6 space-y-4">
                {/* Source info */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">סוג מקור *</label>
                    <select className="input" value={form.source_type} onChange={e => setForm({...form, source_type: e.target.value})}>
                      {Object.entries(SOURCE_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {form.source_type==='kupat_holim' && (<>
                    <div><label className="label">קופת חולים</label>
                      <select className="input" value={form.hmo_name} onChange={e => setForm({...form, hmo_name: e.target.value})}>
                        {Object.entries(HMO_NAMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div><label className="label">רמת ביטוח</label>
                      <select className="input" value={form.hmo_level} onChange={e => setForm({...form, hmo_level: e.target.value})}>
                        {Object.entries(HMO_LEVELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </>)}
                  {(form.source_type==='private'||form.source_type==='har_habitua') && (<>
                    <div>
                      <label className="label">חברת ביטוח</label>
                      {!customCompany ? (
                        <div className="flex gap-2">
                          <select className="input flex-1" value={form.company_name}
                            onChange={e => {
                              if (e.target.value === '__other__') { setCustomCompany(true); setForm({...form, company_name: ''}) }
                              else setForm({...form, company_name: e.target.value})
                            }}>
                            <option value="">— בחר חברה —</option>
                            {PRIVATE_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__other__">אחר (הקלד ידנית)</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input className="input flex-1" placeholder="הקלד שם חברה"
                            value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} autoFocus />
                          <button type="button" onClick={() => { setCustomCompany(false); setForm({...form, company_name: ''}) }}
                            className="text-xs text-slate-400 hover:text-slate-600 px-2">↩ רשימה</button>
                        </div>
                      )}
                    </div>
                    <div><label className="label">מספר פוליסה</label><input className="input" value={form.policy_number} onChange={e => setForm({...form, policy_number: e.target.value})} /></div>
                    {form.source_type==='private' && (
                      <div><label className="label">סוג פוליסה</label>
                        <select className="input" value={form.policy_type} onChange={e => setForm({...form, policy_type: e.target.value})}>
                          <option value="regular">ביטוח רפואי</option>
                          <option value="disability">אובדן כושר עבודה</option>
                        </select>
                      </div>
                    )}
                  </>)}
                </div>
                <div><label className="label">הערות</label><textarea className="input" rows={1} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>

                {/* Private insurance auto-import */}
                {(form.source_type === 'private' || form.source_type === 'har_habitua') && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-blue-800 mb-1">ייבוא אוטומטי מתיק הביטוח</p>
                    <p className="text-xs text-blue-600 mb-3">העלה קובץ מאתר חברת הביטוח — המערכת תנסה לחלץ אוטומטית את הכיסויים, החברה ומספר הפוליסה.</p>
                    <div className="flex gap-2">
                      <label className={`flex items-center gap-2 text-sm bg-white border border-blue-300 text-blue-700 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 font-medium ${uploadingPrivate ? 'opacity-50 pointer-events-none' : ''}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {uploadingPrivate ? 'מנתח...' : 'ייבא מ-PDF'}
                        <input type="file" accept=".pdf" className="hidden" onChange={handleUploadPrivate} disabled={uploadingPrivate} />
                      </label>
                      <label className={`flex items-center gap-2 text-sm bg-white border border-blue-300 text-blue-700 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 font-medium ${uploadingPrivate ? 'opacity-50 pointer-events-none' : ''}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
                        </svg>
                        {uploadingPrivate ? 'מנתח...' : 'ייבא מ-Excel'}
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadPrivate} disabled={uploadingPrivate} />
                      </label>
                    </div>
                    <p className="text-xs text-blue-400 mt-2">או מלא ידנית את הפרטים והכיסויים למטה</p>
                  </div>
                )}

                {/* Coverage table */}
                <div>
                  <p className="label mb-1">כיסויים — סמן ✓ על הכיסויים הקיימים ומלא פרטים</p>
                  <CoverageTable catCoverages={coverages} editable={true} />
                </div>
              </div>

              {isDuplicate() && (
                <div className="mx-6 mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  ⚠️ מקור ביטוח זה כבר קיים בתיק המטופל — לא ניתן להוסיף כפילויות
                </div>
              )}

              <div className="p-6 border-t flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
                <button type="submit" disabled={isDuplicate()} className="btn-primary disabled:opacity-50">שמור מקור ביטוח</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">אין מקורות ביטוח עדיין</div>
      ) : (
        <div className="space-y-4">
          {sources.map(s => (
            <div key={s.id} className="card">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge-blue text-xs">{SOURCE_TYPE_LABELS[s.source_type]}</span>
                    {s.policy_type==='disability' && <span className="badge-yellow text-xs">אובדן כושר עבודה</span>}
                  </div>
                  <h3 className="font-semibold text-slate-800">{sourceLabel(s)}</h3>
                  {s.policy_number && <p className="text-xs text-slate-500 mt-0.5">פוליסה: {s.policy_number}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpandedSource(expandedSource===s.id ? null : s.id)}
                    className="btn-secondary text-sm py-1.5">
                    {expandedSource===s.id ? '▲ סגור' : '▼ כיסויים'}
                  </button>
                  <button onClick={() => handleDeleteSource(s.id)} className="btn-danger text-sm py-1.5">מחק</button>
                </div>
              </div>

              {/* Summary row when collapsed */}
              {expandedSource !== s.id && s.coverages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                  {CATEGORIES.map(cat => {
                    const cov = s.coverages.find(c=>c.category===cat.key)
                    return (
                      <span key={cat.key} className={`text-xs px-2 py-1 rounded-full ${cov?.is_covered?'bg-green-100 text-green-700':'bg-slate-100 text-slate-400'}`}>
                        {cov?.is_covered ? '✓' : '✗'} {cat.label}
                        {cov?.is_covered && cov?.coverage_percentage ? ` ${cov.coverage_percentage}%` : ''}
                        {cov?.is_covered && cov?.coverage_amount ? ` ₪${Number(cov.coverage_amount).toLocaleString()}` : ''}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Expanded editable table */}
              {expandedSource === s.id && <EditableCoverageTable source={s} />}
            </div>
          ))}
        </div>
      )}

      {/* ביטוח לאומי */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-slate-800">ביטוח לאומי — זכאויות</h2>
          <div className="flex gap-2">
            <button onClick={handleImportBituchLeumi} disabled={importingBL} className="btn-secondary text-sm">
              {importingBL ? 'מייבא...' : '🏛️ ייבוא אוטומטי'}
            </button>
            <button onClick={() => setShowEntitlementForm(true)} className="btn-primary text-sm">+ זכאות</button>
          </div>
        </div>
        {showEntitlementForm && (
          <form onSubmit={handleAddEntitlement} className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">סוג זכאות</label>
                <select className="input" value={entForm.entitlement_type} onChange={e => setEntForm({...entForm, entitlement_type:e.target.value})}>
                  {Object.entries(ENTITLEMENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">כותרת *</label><input className="input" value={entForm.title} onChange={e => setEntForm({...entForm, title:e.target.value})} required /></div>
              <div className="col-span-2"><label className="label">תיאור</label><textarea className="input" rows={2} value={entForm.description} onChange={e => setEntForm({...entForm, description:e.target.value})} /></div>
              <div><label className="label">סכום (₪)</label><input type="number" className="input" value={entForm.amount} onChange={e => setEntForm({...entForm, amount:e.target.value})} /></div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="approved" checked={entForm.is_approved} onChange={e => setEntForm({...entForm, is_approved:e.target.checked})} />
                <label htmlFor="approved" className="text-sm text-slate-700">מאושרת</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowEntitlementForm(false)} className="btn-secondary text-sm">ביטול</button>
              <button type="submit" className="btn-primary text-sm">הוסף</button>
            </div>
          </form>
        )}
        {entitlements.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">אין זכאויות ביטוח לאומי עדיין</p>
        ) : (
          <div className="space-y-2">
            {entitlements.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={e.is_approved?'badge-green':'badge-yellow'}>{ENTITLEMENT_TYPES[e.entitlement_type]}</span>
                    <span className="text-sm font-medium">{e.title}</span>
                  </div>
                  {e.description && <p className="text-xs text-slate-500 mt-0.5">{e.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {e.amount && <span className="text-sm font-medium text-green-700">₪{e.amount.toLocaleString()}</span>}
                  <button onClick={() => handleDeleteEntitlement(e.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
