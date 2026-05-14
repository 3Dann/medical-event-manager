import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { useConfirm } from '../../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../hooks/useToast'
import AppToast from '../../components/AppToast'

// SOURCE_TYPE_LABELS defined inside component for i18n
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

function CoverageTable({ catCoverages, editable, updateCovField }) {
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
                  <div className="text-slate-600 font-normal">{cat.desc}</div>
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
                        {covered && cov[field] ? Number(cov[field]).toLocaleString() : covered ? <span className="text-slate-500">—</span> : ''}
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
}

function EditableCoverageTable({ source, patientId, handleEditCoverage, fetchAll, t }) {
  const [newCatLabel, setNewCatLabel] = React.useState('')
  const [showAddRow, setShowAddRow]   = React.useState(false)

  const handleDeleteCoverage = async (covId) => {
    await axios.delete(`/api/patients/${patientId}/insurance/${source.id}/coverage/${covId}`)
    fetchAll().catch(() => {})
  }

  const handleAddCustom = async () => {
    if (!newCatLabel.trim()) return
    await axios.post(`/api/patients/${patientId}/insurance/${source.id}/coverage`, {
      category: newCatLabel.trim(), is_covered: true, abroad_covered: false,
    })
    setNewCatLabel(''); setShowAddRow(false); fetchAll().catch(() => {})
  }

  const standardKeys = CATEGORIES.map(c => c.key)
  const customCovs = source.coverages.filter(c => !standardKeys.includes(c.category))

  const CovRow = ({ catLabel, catDesc, cov }) => {
    const covered = !!cov.is_covered
    return (
      <tr className={`${covered ? 'bg-green-50' : 'bg-white'} group`}>
        <td className="p-2 border border-slate-200 font-medium text-slate-700 text-xs" title={catDesc || catLabel}>
          {catLabel}
          {catDesc && <div className="text-slate-600 font-normal">{catDesc}</div>}
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
                    placeholder={t('coverage_type_placeholder')}
                    value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') { setShowAddRow(false); setNewCatLabel('') } }} />
                  <button onClick={handleAddCustom} className="btn-primary text-xs py-2.5 px-3">{t('common:add', { ns: 'common' })}</button>
                  <button onClick={() => { setShowAddRow(false); setNewCatLabel('') }} className="btn-secondary text-xs py-2.5 px-2">{t('common:cancel', { ns: 'common' })}</button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-slate-600">{t('auto_save_hint')}</p>
        <button onClick={() => setShowAddRow(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          + {t('add_coverage_type')}
        </button>
      </div>
    </div>
  )
}

export default function PatientInsurance() {
  const { t } = useTranslation('insurance')
  const { toast, showToast, dismissToast } = useToast()
  const SOURCE_TYPE_LABELS = {
    sal_habriut: t('source_sal'), kupat_holim: t('source_hmo'),
    har_habitua: t('source_sar'), private: t('source_private'), bituch_leumi: t('source_leumi'),
  }
  const { id } = useParams()
  const [confirm, ConfirmUI] = useConfirm()
  const [sources, setSources]         = useState([])
  const [entitlements, setEntitlements] = useState([])
  const [showForm, setShowForm]       = useState(false)
  const [addingSource, setAddingSource] = useState(false)
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
  const [analyzingAI, setAnalyzingAI] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [customCompany, setCustomCompany] = useState(false)

  const [form, setForm] = useState({ source_type:'kupat_holim', hmo_name:'clalit', hmo_level:'mushlam', company_name:'', policy_number:'', policy_type:'regular', notes:'' })
  const [coverages, setCoverages] = useState(emptyCoverages())
  const [entForm, setEntForm] = useState({ entitlement_type:'existing', title:'', description:'', amount:'', is_approved:false, notes:'' })

  // Insurance gap analysis
  const [gapData, setGapData] = useState(null)
  const [gapLoading, setGapLoading] = useState(false)
  const [gapError, setGapError] = useState(null)

  const fetchGapAnalysis = async (signal) => {
    setGapLoading(true)
    setGapError(null)
    try {
      const res = await axios.get(`/api/patients/${id}/insurance-gaps`, { signal })
      setGapData(res.data)
    } catch (e) {
      if (!axios.isCancel(e)) setGapError('שגיאה בטעינת ניתוח פערים')
    } finally {
      setGapLoading(false)
    }
  }

  useEffect(() => {
    setSalResult(null)
    setBlResult(null)
    setHmoResult(null)
    setPrivateUploadResult(null)
    setExcelResult(null)
    setAiResult(null)
    setGapData(null)
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    fetchGapAnalysis(ctrl.signal)
    return () => ctrl.abort()
  }, [id])

  const fetchAll = async (signal) => {
    try {
      const [s, e] = await Promise.all([
        axios.get(`/api/patients/${id}/insurance`, { signal }),
        axios.get(`/api/patients/${id}/entitlements`, { signal }),
      ])
      setSources(s.data); setEntitlements(e.data)
    } catch (e) { if (!axios.isCancel(e)) showToast('שגיאה בטעינת נתונים') }
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
    setShowForm(false); setCoverages(emptyCoverages()); setCustomCompany(false); fetchAll().catch(() => {})
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
    fetchAll().catch(() => {})
  }

  const handleDeleteSource = async (sourceId) => {
    const ok = await confirm({ title: 'מחיקת מקור ביטוח', message: 'למחוק מקור ביטוח זה?', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${id}/insurance/${sourceId}`); fetchAll().catch(() => {})
  }

  const handleUploadExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''; setUploading(true); setExcelResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await axios.post(`/api/patients/${id}/insurance/upload-excel`, fd)
      setExcelResult({ success:true, ...res.data }); fetchAll().catch(() => {})
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
      fetchAll().catch(() => {})
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
      fetchAll().catch(() => {})
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
      setShowForm(false); fetchAll().catch(() => {})
    } catch (err) {
      setPrivateUploadResult({ success: false, error: err.response?.data?.detail || err.message })
    } finally { setUploadingPrivate(false) }
  }

  const handleAnalyzeAI = async (e) => {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''; setAnalyzingAI(true); setAiResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await axios.post(`/api/patients/${id}/insurance/analyze-ai`, fd)
      setAiResult({ success: true, ...res.data })
      setShowForm(false); fetchAll().catch(() => {})
    } catch (err) {
      setAiResult({ success: false, error: err.response?.data?.detail || err.message })
    } finally { setAnalyzingAI(false) }
  }

  const handleDeleteEntitlement = async (entId) => {
    const ok = await confirm({ title: 'מחיקת זכאות', message: 'למחוק זכאות זו?', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${id}/entitlements/${entId}`); fetchAll().catch(() => {})
  }

  const handleAddEntitlement = async (e) => {
    e.preventDefault()
    await axios.post(`/api/patients/${id}/entitlements`, { ...entForm, amount: entForm.amount ? parseFloat(entForm.amount) : null })
    setShowEntitlementForm(false); fetchAll().catch(() => {})
  }

  const updateCovField = (catKey, field, value) =>
    setCoverages(prev => ({ ...prev, [catKey]: { ...prev[catKey], [field]: value } }))

  const handleImportSal = async () => {
    setImportingSal(true); setSalResult(null)
    try {
      const p = await axios.get(`/api/patients/${id}`)
      if (!p.data.id_number) {
        setSalResult({ success: false, message: 'אין מספר ת.ז. בתיק המטופל — עדכן תחילה בלשונית פרטים' })
        return
      }
      const res = await axios.post('/api/import/sal-habriut', { id_number: p.data.id_number })
      setSalResult({ success: true, message: res.data.message, count: res.data.coverages_imported })
      fetchAll().catch(() => {})
    } catch (err) {
      setSalResult({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally { setImportingSal(false) }
  }

  // ── הר הביטוח guide modal ────────────────────────────────────────────
  const HarBituaGuide = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
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
          <button onClick={() => setShowHarGuide(false)} className="text-slate-500 hover:text-slate-700 text-xl leading-none p-2 -m-2 rounded-lg">✕</button>
        </div>

        {/* Section A: Download */}
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">שלב א׳ — הורדת הקובץ מהר הביטוח</p>

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
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide pt-2">שלב ב׳ — העלאה למערכת</p>

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
    <div className="p-4 md:p-8 space-y-6">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
      {ConfirmUI}
      {/* Modals */}
      {showHarGuide && <HarBituaGuide />}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{t('insurance_sources_title')}</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleImportSal} disabled={importingSal}
            className="btn-secondary text-sm">
            {importingSal ? t('importing') : `🏥 ${t('import_sal')}`}
          </button>
          <button onClick={handleImportHmo} disabled={importingHmo}
            className="btn-secondary text-sm">
            {importingHmo ? t('importing') : `🏨 ${t('import_hmo')}`}
          </button>
          <button onClick={handleImportBituchLeumi} disabled={importingBL}
            className="btn-secondary text-sm">
            {importingBL ? t('importing') : `🏛️ ${t('import_leumi')}`}
          </button>
          <button onClick={() => setShowHarGuide(true)} className="btn-secondary text-sm">
            📊 {t('import_sar_excel')}
          </button>
          <button onClick={() => { setShowForm(true); setCoverages(emptyCoverages()) }} className="btn-primary text-sm">+ {t('add_source')}</button>
        </div>
      </div>

      {/* Sal habriut import result */}
      {salResult && (
        <div className={`rounded-xl p-3 text-sm ${salResult.success?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
          {salResult.success
            ? `✅ ${salResult.message} — ${salResult.count} ${t('coverages_imported')}`
            : `❌ ${salResult.message}`}
          <button onClick={() => setSalResult(null)} className="text-xs text-slate-600 mr-3 hover:underline">{t('common:close', { ns: 'common' })}</button>
        </div>
      )}

      {/* HMO import result */}
      {hmoResult && (
        <div className={`rounded-xl p-3 text-sm ${hmoResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {hmoResult.success
            ? `✅ ${hmoResult.message}`
            : `❌ ${hmoResult.message}`}
          <button onClick={() => setHmoResult(null)} className="text-xs text-slate-600 mr-3 hover:underline">{t('common:close', { ns: 'common' })}</button>
        </div>
      )}

      {/* Bituch leumi import result */}
      {blResult && (
        <div className={`rounded-xl p-3 text-sm ${blResult.success?'bg-green-50 border border-green-200':'bg-red-50 border border-red-200'}`}>
          {blResult.success
            ? `✅ ${blResult.message} — ${blResult.count} ${t('entitlements_imported')}`
            : `❌ ${blResult.message}`}
          <button onClick={() => setBlResult(null)} className="text-xs text-slate-600 mr-3 hover:underline">{t('common:close', { ns: 'common' })}</button>
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
          <button onClick={() => setPrivateUploadResult(null)} className="text-xs text-slate-600 mt-2 block hover:underline">{t('common:close', { ns: 'common' })}</button>
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
          <button onClick={() => setExcelResult(null)} className="text-xs text-slate-600 mt-2 hover:underline">{t('common:close', { ns: 'common' })}</button>
        </div>
      )}

      {/* Add source modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-4">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="font-semibold text-lg">{t('add_source')}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-700 text-xl p-2 -m-2 rounded-lg">✕</button>
            </div>
            <form onSubmit={handleAddSource}>
              <div className="p-6 space-y-4">
                {/* Source info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">{t('source_type_label')}</label>
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
                            <option value="">{t('select_company_placeholder')}</option>
                            {PRIVATE_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__other__">{t('other_type_manually')}</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input className="input flex-1" placeholder={t('type_company_name')}
                            value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} autoFocus />
                          <button type="button" onClick={() => { setCustomCompany(false); setForm({...form, company_name: ''}) }}
                            className="text-xs text-slate-600 hover:text-slate-800 px-2">↩ {t('back_to_list')}</button>
                        </div>
                      )}
                    </div>
                    <div><label className="label">מספר פוליסה</label><input className="input" value={form.policy_number} onChange={e => setForm({...form, policy_number: e.target.value})} /></div>
                    {form.source_type==='private' && (
                      <div><label className="label">סוג פוליסה</label>
                        <select className="input" value={form.policy_type} onChange={e => setForm({...form, policy_type: e.target.value})}>
                          <option value="regular">{t('policy_type_regular')}</option>
                          <option value="disability">{t('policy_type_disability')}</option>
                        </select>
                      </div>
                    )}
                  </>)}
                </div>
                <div><label className="label">הערות</label><textarea className="input" rows={1} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>

                {/* Policy import — AI + basic */}
                {(form.source_type === 'private' || form.source_type === 'har_habitua') && (
                  <div className="space-y-3">
                    {/* AI analysis — primary */}
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-violet-800">✨ ניתוח AI — מומלץ</span>
                        <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">Claude</span>
                      </div>
                      <p className="text-xs text-violet-600 mb-3">ניתוח מלא של הפוליסה: כיסויים, סכומים, חריגים, מספר פוליסה — דיוק גבוה.</p>
                      <label className={`inline-flex items-center gap-2 text-sm bg-violet-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-violet-700 font-medium ${analyzingAI ? 'opacity-50 pointer-events-none' : ''}`}>
                        {analyzingAI
                          ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> מנתח עם AI...</>
                          : '✨ נתח פוליסה עם AI'}
                        <input type="file" accept=".pdf,.xlsx,.xls,.docx" className="hidden" onChange={handleAnalyzeAI} disabled={analyzingAI} />
                      </label>
                      {aiResult && (
                        <div className={`mt-3 rounded-lg p-3 text-xs ${aiResult.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                          {aiResult.success ? (
                            <>
                              <p className="font-semibold">✅ {aiResult.insurer} — {aiResult.policy_number || 'ללא מספר'}</p>
                              <p>כיסויים שזוהו: {aiResult.coverages_detected} | דיוק: {Math.round((aiResult.confidence || 0) * 100)}%</p>
                              {aiResult.key_exclusions?.length > 0 && <p>חריגים: {aiResult.key_exclusions.join(', ')}</p>}
                            </>
                          ) : <p>❌ {aiResult.error}</p>}
                        </div>
                      )}
                    </div>
                    {/* Basic import — fallback */}
                    <details className="group">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-800 select-none">
                        ייבוא בסיסי (ללא AI) ▸
                      </summary>
                      <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-xs text-blue-600 mb-2">חילוץ חלקי מ-PDF / Excel — ללא ניתוח תוכן.</p>
                        <div className="flex gap-2">
                          <label className={`flex items-center gap-1 text-xs bg-white border border-blue-300 text-blue-700 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 font-medium ${uploadingPrivate ? 'opacity-50 pointer-events-none' : ''}`}>
                            {uploadingPrivate ? 'מנתח...' : '📄 PDF'}
                            <input type="file" accept=".pdf" className="hidden" onChange={handleUploadPrivate} disabled={uploadingPrivate} />
                          </label>
                          <label className={`flex items-center gap-1 text-xs bg-white border border-blue-300 text-blue-700 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 font-medium ${uploadingPrivate ? 'opacity-50 pointer-events-none' : ''}`}>
                            {uploadingPrivate ? 'מנתח...' : '📊 Excel'}
                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadPrivate} disabled={uploadingPrivate} />
                          </label>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {/* Coverage table */}
                <div>
                  <p className="label mb-1">{t('coverages_fill_label')}</p>
                  <CoverageTable catCoverages={coverages} editable={true} updateCovField={updateCovField} />
                </div>
              </div>

              {isDuplicate() && (
                <div className="mx-6 mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  ⚠️ {t('duplicate_source_warning')}
                </div>
              )}

              <div className="p-6 border-t flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">{t('common:cancel', { ns: 'common' })}</button>
                <button type="submit" disabled={isDuplicate()} className="btn-primary disabled:opacity-50">{t('save_source_btn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 ? (
        <div className="card text-center py-10 text-slate-600">{t('no_sources')}</div>
      ) : (
        <div className="space-y-4">
          {sources.map(s => (
            <div key={s.id} className="card">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge-blue text-xs">{SOURCE_TYPE_LABELS[s.source_type]}</span>
                    {s.policy_type==='disability' && <span className="badge-yellow text-xs">{t('policy_type_disability')}</span>}
                  </div>
                  <h3 className="font-semibold text-slate-800">{sourceLabel(s)}</h3>
                  {s.policy_number && <p className="text-xs text-slate-500 mt-0.5">{t('policy_number_label')}: {s.policy_number}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpandedSource(expandedSource===s.id ? null : s.id)}
                    className="btn-secondary text-sm py-1.5">
                    {expandedSource===s.id ? `▲ ${t('common:close', { ns: 'common' })}` : `▼ ${t('coverages_btn')}`}
                  </button>
                  <button onClick={() => handleDeleteSource(s.id)} className="btn-danger text-sm py-1.5">{t('common:delete', { ns: 'common' })}</button>
                </div>
              </div>

              {/* Summary row when collapsed */}
              {expandedSource !== s.id && s.coverages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                  {CATEGORIES.map(cat => {
                    const cov = s.coverages.find(c=>c.category===cat.key)
                    return (
                      <span key={cat.key} className={`text-xs px-2 py-1 rounded-full ${cov?.is_covered?'bg-green-100 text-green-700':'bg-slate-100 text-slate-600'}`}>
                        {cov?.is_covered ? '✓' : '✗'} {cat.label}
                        {cov?.is_covered && cov?.coverage_percentage ? ` ${cov.coverage_percentage}%` : ''}
                        {cov?.is_covered && cov?.coverage_amount ? ` ₪${Number(cov.coverage_amount).toLocaleString()}` : ''}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Expanded editable table */}
              {expandedSource === s.id && <EditableCoverageTable source={s} patientId={id} handleEditCoverage={handleEditCoverage} fetchAll={fetchAll} t={t} />}
            </div>
          ))}
        </div>
      )}

      {/* ── ניתוח פערים ביטוחיים ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => fetchGapAnalysis()}
            disabled={gapLoading}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            רענן
          </button>
          <h2 className="font-semibold text-slate-800">ניתוח פערים ביטוחיים</h2>
        </div>

        {gapLoading && (
          <div className="text-center py-6 text-slate-500 text-sm">מחשב פערים...</div>
        )}
        {gapError && (
          <div className="text-red-500 text-sm text-center py-4">{gapError}</div>
        )}

        {gapData && !gapLoading && (() => {
          const severityConfig = {
            none:   { label: 'אין פער',      bar: 'bg-green-500',  badge: 'bg-green-100 text-green-700',  text: 'text-green-700' },
            low:    { label: 'פער נמוך',     bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', text: 'text-yellow-700' },
            medium: { label: 'פער בינוני',   bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-700' },
            high:   { label: 'פער גבוה',     bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',      text: 'text-red-700' },
          }
          const cfg = severityConfig[gapData.severity] || severityConfig.none
          const coverPct = gapData.total_cost > 0
            ? Math.round(gapData.total_covered / gapData.total_cost * 100)
            : 0

          return (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'עלות כוללת',   value: `₪${(gapData.total_cost || 0).toLocaleString()}`,    color: 'text-slate-800' },
                  { label: 'כיסוי ביטוחי', value: `₪${(gapData.total_covered || 0).toLocaleString()}`, color: 'text-green-700' },
                  { label: 'פער ביטוחי',   value: `₪${(gapData.gap || 0).toLocaleString()}`,           color: gapData.gap > 0 ? 'text-red-600' : 'text-green-700' },
                  { label: 'אחוז פער',     value: `${gapData.gap_pct}%`,                               color: cfg.text },
                ].map((card, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3 text-right border border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                    <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Severity badge + progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                  <span className="text-xs text-slate-500">{coverPct}% מכוסה</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                    style={{ width: `${Math.min(100, gapData.gap_pct)}%` }}
                  />
                </div>
              </div>

              {/* Uncovered categories */}
              {gapData.uncovered_categories?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">קטגוריות לא מכוסות:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gapData.uncovered_categories.map((cat, i) => (
                      <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {gapData.recommendations?.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-700 mb-2">המלצות:</p>
                  {gapData.recommendations.map((rec, i) => (
                    <p key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                      <span className="mt-0.5 flex-shrink-0">•</span>
                      {rec}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ביטוח לאומי */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-slate-800">{t('leumi_entitlements_title')}</h2>
          <div className="flex gap-2">
            <button onClick={handleImportBituchLeumi} disabled={importingBL} className="btn-secondary text-sm">
              {importingBL ? t('importing') : `🏛️ ${t('auto_import')}`}
            </button>
            <button onClick={() => setShowEntitlementForm(true)} className="btn-primary text-sm">+ {t('add_entitlement_btn')}</button>
          </div>
        </div>
        {showEntitlementForm && (
          <form onSubmit={handleAddEntitlement} className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">{t('entitlement_type_label')}</label>
                <select className="input" value={entForm.entitlement_type} onChange={e => setEntForm({...entForm, entitlement_type:e.target.value})}>
                  {Object.entries(ENTITLEMENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">{t('entitlement_title_label')}</label><input className="input" value={entForm.title} onChange={e => setEntForm({...entForm, title:e.target.value})} /></div>
              <div className="col-span-1 sm:col-span-2"><label className="label">{t('entitlement_desc_label')}</label><textarea className="input" rows={2} value={entForm.description} onChange={e => setEntForm({...entForm, description:e.target.value})} /></div>
              <div><label className="label">{t('entitlement_amount_label')}</label><input type="number" className="input" value={entForm.amount} onChange={e => setEntForm({...entForm, amount:e.target.value})} /></div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="approved" checked={entForm.is_approved} onChange={e => setEntForm({...entForm, is_approved:e.target.checked})} />
                <label htmlFor="approved" className="text-sm text-slate-700">{t('entitlement_approved_label')}</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowEntitlementForm(false)} className="btn-secondary text-sm">{t('common:cancel', { ns: 'common' })}</button>
              <button type="submit" className="btn-primary text-sm">{t('common:add', { ns: 'common' })}</button>
            </div>
          </form>
        )}
        {entitlements.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-4">{t('no_entitlements')}</p>
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
