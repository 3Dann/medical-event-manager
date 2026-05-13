import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import AppToast from '../../components/AppToast'
import { useToast } from '../../hooks/useToast'

// ── Field definitions ──────────────────────────────────────────────────────

const SMOKING_OPTIONS = [
  { value: 'never',   label: 'מעולם לא עישן' },
  { value: 'former',  label: 'מעשן לשעבר' },
  { value: 'current', label: 'מעשן פעיל' },
]

const NGS_OPTIONS = [
  { value: 'tissue', label: 'ביופסיית רקמה' },
  { value: 'blood',  label: 'ביופסיה נוזלית' },
  { value: 'liquid', label: 'בדיקת ctDNA' },
]

const ACCESS_OPTIONS = [
  { value: 'basket',    label: 'סל קופה' },
  { value: 'insurance', label: 'ביטוח פרטי' },
  { value: 'compassion', label: 'חמלה 29ג׳' },
  { value: 'research',  label: 'מחקר קליני' },
]

const BIOMARKER_OPTIONS = [
  { value: 'EGFR',        label: 'EGFR' },
  { value: 'ALK',         label: 'ALK' },
  { value: 'HER2',        label: 'HER2' },
  { value: 'KRAS_G12C',   label: 'KRAS G12C' },
  { value: 'RET',         label: 'RET' },
  { value: 'MET_exon14',  label: 'MET exon14' },
  { value: 'PD-L1',       label: 'PD-L1' },
  { value: 'ROS1',        label: 'ROS1' },
  { value: 'BRAF',        label: 'BRAF' },
  { value: 'other',       label: 'אחר' },
]

const ACCESS_LABELS = Object.fromEntries(ACCESS_OPTIONS.map(o => [o.value, o.label]))

const EMPTY_FORM = {
  smoking_status: '',
  ngs_method: '',
  fev1_score: '',
  access_type: '',
  biomarker_target: '',
  tumor_board_surgeon:    false,
  tumor_board_oncologist: false,
  tumor_board_radiation:  false,
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NSCLCPathwayTab() {
  const { id } = useParams()
  const { toast, showToast, dismissToast } = useToast()

  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)

  // Recommended medications from search
  const [drugs, setDrugs]         = useState([])
  const [drugsLoading, setDrugsLoading] = useState(false)

  // Load current patient data
  useEffect(() => {
    const ctrl = new AbortController()
    axios.get(`/api/patients/${id}`, { signal: ctrl.signal })
      .then(r => {
        const p = r.data
        setForm({
          smoking_status:          p.smoking_status   || '',
          ngs_method:              p.ngs_method       || '',
          fev1_score:              p.fev1_score != null ? String(p.fev1_score) : '',
          access_type:             p.access_type      || '',
          biomarker_target:        p.biomarker_target || '',
          tumor_board_surgeon:     !!p.tumor_board_surgeon,
          tumor_board_oncologist:  !!p.tumor_board_oncologist,
          tumor_board_radiation:   !!p.tumor_board_radiation,
        })
      })
      .catch(e => {
        if (!axios.isCancel(e)) {
          console.error(e)
          showToast('שגיאה בטעינת נתוני המטופל', 'error')
        }
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [id])

  // Load medications when biomarker changes — AbortController cancels in-flight request on change
  useEffect(() => {
    if (!form.biomarker_target) { setDrugs([]); return }
    const ctrl = new AbortController()
    setDrugsLoading(true)
    axios.get('/api/medications/search', { params: { q: form.biomarker_target }, signal: ctrl.signal })
      .then(r => setDrugs(r.data || []))
      .catch(e => { if (!axios.isCancel(e)) setDrugs([]) })
      .finally(() => setDrugsLoading(false))
    return () => ctrl.abort()
  }, [form.biomarker_target])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    // Client-side validation
    if (form.fev1_score !== '') {
      const fev1Num = Number(form.fev1_score)
      if (isNaN(fev1Num) || fev1Num < 0 || fev1Num > 150) {
        showToast('ערך FEV1 חייב להיות בין 0 ל-150', 'error')
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        fev1_score: form.fev1_score !== '' ? Number(form.fev1_score) : null,
      }
      await axios.patch(`/api/patients/${id}`, payload)
      showToast('הנתונים נשמרו בהצלחה', 'success')
    } catch (e) {
      showToast('שגיאה בשמירת הנתונים. נסה שנית.')
    } finally {
      setSaving(false)
    }
  }

  const fev1Num = form.fev1_score !== '' ? Number(form.fev1_score) : null
  const fev1Warning = fev1Num != null && fev1Num < 60

  if (loading) return (
    <div className="p-6 text-center text-slate-500 text-sm">טוען נתוני מסע NSCLC...</div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />

      {/* ── Clinical fields card ───────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-800 text-lg">נתונים קליניים — NSCLC</h2>
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">סרטן ריאה</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Smoking status */}
          <div>
            <label className="label">סטטוס עישון</label>
            <select
              className="input"
              value={form.smoking_status}
              onChange={e => handleChange('smoking_status', e.target.value)}
            >
              <option value="">— בחר —</option>
              {SMOKING_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* NGS method */}
          <div>
            <label className="label">שיטת NGS / ביופסיה</label>
            <select
              className="input"
              value={form.ngs_method}
              onChange={e => handleChange('ngs_method', e.target.value)}
            >
              <option value="">— בחר —</option>
              {NGS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* FEV1 score */}
          <div>
            <label className="label">
              FEV1 (%)
              {fev1Warning && (
                <span className="mr-2 text-xs text-red-600 font-semibold">⚠ ערך נמוך — יש לתאם עם ריאולוג</span>
              )}
            </label>
            <input
              type="number"
              min={0}
              max={150}
              step={1}
              className={`input ${fev1Warning ? 'border-red-400 focus:ring-red-300' : ''}`}
              value={form.fev1_score}
              onChange={e => handleChange('fev1_score', e.target.value)}
              placeholder="למשל: 72"
            />
            {fev1Warning && (
              <p className="text-xs text-red-600 mt-1">FEV1 מתחת ל-60% — שקול סיכון תפקודי לפני הניתוח</p>
            )}
          </div>

          {/* Access type */}
          <div>
            <label className="label">מסלול גישה לטיפול</label>
            <select
              className="input"
              value={form.access_type}
              onChange={e => handleChange('access_type', e.target.value)}
            >
              <option value="">— בחר —</option>
              {ACCESS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Biomarker target */}
          <div className="md:col-span-2">
            <label className="label">מטרה ביו-מרקרית (Biomarker)</label>
            <select
              className="input"
              value={form.biomarker_target}
              onChange={e => handleChange('biomarker_target', e.target.value)}
            >
              <option value="">— בחר —</option>
              {BIOMARKER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Save button */}
        <div className="mt-5 flex justify-start">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-6 py-2 disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור נתונים'}
          </button>
        </div>
      </div>

      {/* ── Recommended medications ────────────────────────────────────── */}
      {form.biomarker_target && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">תרופות NSCLC מומלצות</h2>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {BIOMARKER_OPTIONS.find(o => o.value === form.biomarker_target)?.label || form.biomarker_target}
            </span>
          </div>

          {drugsLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">מחפש תרופות...</div>
          ) : drugs.length === 0 ? (
            <div className="text-sm text-slate-500 py-3 text-center">
              לא נמצאו תרופות במסד הנתונים עבור הביו-מרקר הנבחר
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 space-y-0">
              {drugs.map((drug, i) => (
                <li key={drug.id || i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{drug.name}</span>
                        {drug.hebrew_name && (
                          <span className="text-sm text-slate-700">{drug.hebrew_name}</span>
                        )}
                        {drug.generic_name && drug.generic_name !== drug.name && (
                          <span className="text-xs text-slate-500">({drug.generic_name})</span>
                        )}
                        {drug.treatment_line && (
                          <span className="text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                            {drug.treatment_line}
                          </span>
                        )}
                        {drug.access_type && (
                          <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                            {ACCESS_LABELS[drug.access_type] || drug.access_type}
                          </span>
                        )}
                      </div>
                      {drug.openfda_indication && (
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                          {drug.openfda_indication}
                        </p>
                      )}
                    </div>
                    {drug.msl_phone && (
                      <a
                        href={`tel:${drug.msl_phone}`}
                        className="text-xs text-blue-600 hover:underline flex-shrink-0 mt-0.5"
                        title="MSL — Medical Science Liaison"
                      >
                        📞 {drug.msl_phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
