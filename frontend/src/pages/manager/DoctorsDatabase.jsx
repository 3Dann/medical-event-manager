import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import AppToast from '../../components/AppToast'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'

// ── InsuranceCell — inline multi-select in table cell ─────────────────────────
function InsuranceCell({ doc, allOptions, onSave }) {
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState(doc.hmo_acceptance || [])
  const [newCompany, setNewCompany] = React.useState('')
  const ref = React.useRef(null)

  React.useEffect(() => { setSelected(doc.hmo_acceptance || []) }, [doc.hmo_acceptance])

  React.useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) handleSave() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, selected])

  const toggle = c => setSelected(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const addNew = () => {
    const t = newCompany.trim()
    if (!t || selected.includes(t)) return
    setSelected(prev => [...prev, t])
    setNewCompany('')
  }

  const handleSave = async () => {
    setOpen(false)
    await onSave(doc.id, selected)
  }

  const knownOptions = [...new Set([...Object.keys(HMO_LABELS), ...allOptions])]

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1 cursor-pointer min-h-6"
        onClick={() => setOpen(v => !v)}
      >
        {selected.length > 0
          ? selected.map(c => (
              <span key={c} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                {HMO_LABELS[c] || c}
              </span>
            ))
          : <span className="text-slate-500 text-xs">+ הוסף</span>
        }
      </div>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 min-w-56" dir="rtl">
          <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
            {knownOptions.map(c => (
              <label key={c} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded-lg">
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)}
                  className="w-3.5 h-3.5 accent-blue-600" />
                <span className="text-sm text-slate-700">{HMO_LABELS[c] || c}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-1 border-t border-slate-100 pt-2">
            <input
              className="input text-xs py-1.5 flex-1"
              placeholder="חברת ביטוח חדשה..."
              value={newCompany}
              onChange={e => setNewCompany(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNew()}
            />
            <button onClick={addNew} className="text-xs bg-blue-50 text-blue-700 px-2.5 rounded-lg hover:bg-blue-100">+</button>
          </div>
          <button onClick={handleSave} className="btn-primary text-xs py-1.5 w-full mt-2">שמור</button>
        </div>
      )}
    </div>
  )
}

// ── InsuranceAddInput — add custom company in edit form ────────────────────────
function InsuranceAddInput({ current, onAdd }) {
  const [val, setVal] = React.useState('')
  const add = () => {
    const t = val.trim()
    if (!t || current.includes(t)) return
    onAdd(t); setVal('')
  }
  return (
    <div className="flex items-center gap-1">
      <input
        className="input text-sm py-1.5 w-36"
        placeholder="הוסף חברה..."
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
      />
      <button type="button" onClick={add}
        className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 border border-blue-200">
        + הוסף
      </button>
    </div>
  )
}

function FilterButton({ label, value, options, onChange, valueLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = !!value
  const displayLabel = active ? (valueLabel || value) : label

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          boxShadow: open
            ? 'inset 0 2px 4px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)'
            : active
              ? '0 3px 0 #2563eb, 0 4px 8px rgba(37,99,235,0.25), inset 0 1px 0 rgba(255,255,255,0.4)'
              : '0 3px 0 #94a3b8, 0 4px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.7)',
          transform: open ? 'translateY(2px)' : 'translateY(0)',
          transition: 'all 0.12s ease',
        }}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border select-none
          ${active
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-white text-slate-700 border-slate-200'
          }`}
      >
        {displayLabel}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-30 bg-white rounded-xl shadow-lg border border-slate-200 py-1 min-w-[160px]"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)' }}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full text-right px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${!value ? 'text-blue-600 font-medium' : 'text-slate-500'}`}
          >
            {label} — הכל
          </button>
          <div className="border-t border-slate-100 my-1" />
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-right px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${value === opt.value ? 'text-blue-600 font-medium bg-blue-50' : 'text-slate-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const HMO_LABELS = {
  clalit: 'כללית',
  maccabi: 'מכבי',
  meuhedet: 'מאוחדת',
  leumit: 'לאומית',
}
const HMO_OPTIONS = Object.entries(HMO_LABELS)

const TITLE_OPTIONS = ['', 'ד"ר', "פרופ'", 'ד"ר פרופ\'', 'רופא מומחה']

const COLUMN_DEFS = [
  { key: 'title',               label: 'תואר',                     type: 'text' },
  { key: 'name',                label: 'שם הרופא',    always: true, type: 'text' },
  { key: 'license_number',      label: 'מספר רישיון',              type: 'text' },
  { key: 'specialty',           label: 'מומחיות',                  type: 'text' },
  { key: 'sub_specialty',       label: 'תת-מומחיות',               type: 'text' },
  { key: 'phone',               label: 'טלפון',                    type: 'phone' },
  { key: 'phone2',              label: 'טלפון 2',                  type: 'phone' },
  { key: 'whatsapp',            label: 'וואטסאפ',                  type: 'phone' },
  { key: 'email',               label: 'אימייל',                   type: 'email' },
  { key: 'city',                label: 'עיר',                      type: 'text' },
  { key: 'location',            label: 'מיקום קבלה',               type: 'text' },
  { key: 'private_price',       label: 'מחיר פרטי',                type: 'price' },
  { key: 'hmo_acceptance',      label: 'הסדרי ביטוח',              type: 'hmo' },
  { key: 'gives_expert_opinion',label: 'חוות דעת',                 type: 'bool' },
  { key: 'notes',               label: 'הערות',                    type: 'text' },
]

const DEFAULT_VISIBLE = ['title','name','license_number','specialty','sub_specialty','phone','city','location','hmo_acceptance','gives_expert_opinion']

const EMPTY_FORM = {
  title: '',
  name: '',
  specialty: '',
  sub_specialty: '',
  license_number: '',
  phone: '',
  phone2: '',
  whatsapp: '',
  email: '',
  city: '',
  location: '',
  private_price: null,
  hmo_acceptance: [],
  gives_expert_opinion: false,
  notes: '',
  extra_data: {},
  source_url: '',
}

export default function DoctorsDatabase() {
  const { t } = useTranslation('doctors')
  const { user: currentUser } = useAuth()
  const { toast, showToast, dismissToast } = useToast()
  const [confirm, ConfirmUI] = useConfirm()
  const [doctors, setDoctors] = useState([])
  const [totalDoctors, setTotalDoctors] = useState(0)
  const PAGE_SIZE = 500
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('') // מה מוקלד
  const [search, setSearch] = useState('')           // מה נחפש (רק אחרי Enter/כפתור)
  const [filterHmo, setFilterHmo] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterSubSpecialty, setFilterSubSpecialty] = useState('')
  const [filterLocation] = useState('')
  const [filterExpert, setFilterExpert] = useState('')
  const [filterOptions, setFilterOptions] = useState({ specialties: [], sub_specialties: [], areas: [] })
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const [visibleCols, setVisibleCols] = useState(() => {
    try { const s = localStorage.getItem('doctor_table_cols'); return s ? JSON.parse(s) : DEFAULT_VISIBLE }
    catch { return DEFAULT_VISIBLE }
  })
  const [showColPicker, setShowColPicker] = useState(false)
  const [extraColDefs, setExtraColDefs] = useState([])
  const [newColName, setNewColName] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const res = await axios.get('/api/doctors/export/excel', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'מאגר רופאים.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      showToast('שגיאה בייצוא הקובץ. נסה שוב.')
    } finally {
      setExporting(false)
    }
  }


  useEffect(() => {
    const ctrl = new AbortController()
    fetchFilterOptions(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  // פילטרים שמשתנים מיד (dropdown) — טען מחדש מעמוד 1
  useEffect(() => {
    const ctrl = new AbortController()
    setCurrentPage(1)
    fetchDoctors(1, null, ctrl.signal)
    return () => ctrl.abort()
  }, [filterHmo, filterSpecialty, filterSubSpecialty, filterLocation, filterExpert])

  // מעבר עמוד ידני
  const goToPage = (page) => {
    setCurrentPage(page)
    fetchDoctors(page)
  }

  const submitSearch = () => {
    setSearch(searchInput)
    setCurrentPage(1)
    fetchDoctors(1, searchInput)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    setFilterSpecialty('')
    setFilterSubSpecialty('')
    setFilterHmo('')
    setFilterExpert('')
  }
  useEffect(() => { localStorage.setItem('doctor_table_cols', JSON.stringify(visibleCols)) }, [visibleCols])
  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/doctors/schema', { signal: ctrl.signal })
      .then(res => setExtraColDefs(res.data.extra.map(k => ({ key: `extra.${k}`, label: k, type: 'text', isExtra: true }))))
      .catch(e => { if (axios.isCancel(e)) return })
    return () => ctrl.abort()
  }, [])

  const fetchFilterOptions = async (signal) => {
    try { const res = await axios.get('/api/doctors/filter-options', { signal }); setFilterOptions(res.data) }
    catch (e) { if (!axios.isCancel(e)) showToast('שגיאת שרת. נסה שוב.') }
  }

  const fetchDoctors = async (page = currentPage, searchOverride = null, signal = null) => {
    setLoading(true)
    try {
      const activeSearch = searchOverride !== null ? searchOverride : search
      const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
      if (activeSearch)  params.search         = activeSearch
      if (filterHmo)     params.hmo            = filterHmo
      if (filterSpecialty)    params.specialty      = filterSpecialty
      if (filterSubSpecialty) params.sub_specialty  = filterSubSpecialty
      if (filterLocation)     params.location       = filterLocation
      if (filterExpert !== '') params.expert_opinion = filterExpert === 'yes'
      const res = await axios.get('/api/doctors', { params, signal })
      setDoctors(res.data.items ?? res.data)
      setTotalDoctors(res.data.total ?? (res.data.items ?? res.data).length)
    } catch (e) {
      if (!axios.isCancel(e)) showToast('שגיאת שרת. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleDeleteAll = async () => {
    const ok = await confirm({ title: 'מחיקת כל הרופאים', message: `למחוק את כל ${totalDoctors.toLocaleString()} הרופאים מהמאגר? פעולה זו בלתי הפיכה.`, confirmLabel: 'מחק הכל', danger: true })
    if (!ok) return
    try {
      const res = await axios.delete('/api/doctors/all')
      setCurrentPage(1)
      fetchDoctors(1)
      fetchFilterOptions()
      showToast(`נמחקו ${(res.data.deleted ?? 0).toLocaleString()} רופאים בהצלחה`, 'success')
    } catch (e) {
      const status = e.response?.status
      const msg = status === 403 ? 'אין הרשאה למחוק — נסה להתחבר מחדש'
                : status === 404 ? 'שגיאה בשרת — הפעל מחדש ונסה שוב'
                : 'שגיאה במחיקת הרופאים. נסה שוב.'
      showToast(msg)
    }
  }

  const handleUpdateInsurance = async (docId, newHmoList) => {
    const doc = doctors.find(d => d.id === docId)
    if (!doc) return
    try {
      await axios.put(`/api/doctors/${docId}`, {
        ...doc,
        hmo_acceptance: newHmoList,
        extra_data: JSON.stringify(doc.extra_data || {}),
      })
      fetchDoctors()
    } catch (e) { showToast('שגיאת שרת. נסה שוב.') }
  }

  const openEdit = (doc) => {
    setEditingId(doc.id)
    setForm({
      ...EMPTY_FORM,
      ...doc,
      extra_data: doc.extra_data || {},
      hmo_acceptance: doc.hmo_acceptance || [],
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        hmo_acceptance: form.hmo_acceptance || [],
        extra_data: Object.keys(form.extra_data || {}).length
          ? JSON.stringify(form.extra_data)
          : null,
      }
      if (editingId) {
        await axios.put(`/api/doctors/${editingId}`, payload)
      } else {
        await axios.post('/api/doctors', payload)
      }
      setShowForm(false)
      fetchDoctors()
    } catch (e) {
      showToast('שגיאת שרת. נסה שוב.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('האם למחוק רופא זה?')) return
    try {
      await axios.delete(`/api/doctors/${id}`)
      fetchDoctors()
    } catch (e) {
      showToast('שגיאת שרת. נסה שוב.')
    }
  }

  const toggleHmo = (key) => {
    setForm(f => ({
      ...f,
      hmo_acceptance: f.hmo_acceptance.includes(key)
        ? f.hmo_acceptance.filter(h => h !== key)
        : [...f.hmo_acceptance, key],
    }))
  }

  const pollImportStatus = async (jobId) => {
    try {
      const res = await axios.get(`/api/doctors/import/status/${jobId}`)
      const d = res.data
      setImportProgress(d)
      if (d.status === 'running') {
        setTimeout(() => pollImportStatus(jobId), 800)
      } else {
        setImporting(false)
        if (d.status === 'done') {
          const parts = [`יובאו ${(d.imported ?? 0).toLocaleString()} רופאים`]
          if (d.skipped_duplicates) parts.push(`${d.skipped_duplicates.toLocaleString()} כפילויות`)
          if (d.skipped_invalid)    parts.push(`${d.skipped_invalid.toLocaleString()} לא תקינים`)
          const samplesNote = d.skip_samples?.length
            ? 'דוגמאות לדילוג: ' + d.skip_samples.map(s => `"${s.name}" (${s.reason})`).join('; ')
            : ''
          setImportStatus({ success: (d.imported ?? 0) > 0, message: parts.join(' · '), detail: samplesNote })
          setImportProgress(null)
          fetchDoctors(); fetchFilterOptions()
        } else {
          setImportStatus({ success: false, message: d.message || 'שגיאה בייבוא' })
          setImportProgress(null)
        }
      }
    } catch {
      setImporting(false); setImportProgress(null)
      setImportStatus({ success: false, message: 'שגיאת חיבור לשרת' })
    }
  }

  const handleExcelImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportStatus(null); setImportProgress(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post('/api/doctors/import/excel', formData)
      if (res.data?.job_id) {
        setImportProgress({ status: 'running', imported: 0, total: 0, message: 'מעלה קובץ...' })
        setTimeout(() => pollImportStatus(res.data.job_id), 500)
      }
    } catch (err) {
      setImportStatus({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
      setImporting(false)
    } finally {
      e.target.value = ''
    }
  }

  const allColDefs = [...COLUMN_DEFS, ...extraColDefs]

  // All known insurance companies across loaded doctors
  const allInsuranceOptions = [...new Set([
    ...Object.keys(HMO_LABELS),
    ...doctors.flatMap(d => d.hmo_acceptance || []),
  ])].filter(Boolean)

  const renderCell = (doc, colKey) => {
    if (colKey.startsWith('extra.')) return doc.extra_data?.[colKey.slice(6)] || '—'
    switch (colKey) {
      case 'hmo_acceptance':
        return (
          <InsuranceCell
            doc={doc}
            allOptions={allInsuranceOptions}
            onSave={handleUpdateInsurance}
          />
        )
      case 'gives_expert_opinion':
        return doc.gives_expert_opinion
          ? <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full">כן</span>
          : <span className="text-slate-500 text-xs">לא</span>
      case 'private_price':
        return doc.private_price ? `₪${doc.private_price.toLocaleString()}` : '—'
      case 'phone': case 'phone2': case 'whatsapp':
        return doc[colKey] ? <span dir="ltr">{doc[colKey]}</span> : '—'
      default:
        return doc[colKey] || '—'
    }
  }

  const toggleCol = (key) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const addCustomCol = () => {
    const name = newColName.trim()
    if (!name) return
    const key = `extra.${name}`
    if (!extraColDefs.find(c => c.key === key)) {
      setExtraColDefs(prev => [...prev, { key, label: name, type: 'text', isExtra: true }])
    }
    if (!visibleCols.includes(key)) setVisibleCols(prev => [...prev, key])
    setNewColName('')
  }

  return (
    <div className="p-4 md:p-8" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">מאגר רופאים מומחים</h1>
          <p className="text-slate-500 mt-1">{totalDoctors} רופאים במאגר</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60"
            style={{ boxShadow: '0 2px 0 #15803d', transition: 'all 0.1s ease' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? 'מייצא...' : 'ייצוא Excel'}
          </button>
          <button
            onClick={() => { setImportOpen(v => !v); setImportStatus(null) }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${importOpen ? 'bg-blue-700 text-white border-blue-700' : 'text-blue-700 bg-blue-50 border-blue-300 hover:bg-blue-100'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4l4-4m0 0l4-4m-4 4V4" />
            </svg>
            ייבוא Excel
          </button>
          <button
            onClick={() => setShowColPicker(v => !v)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${showColPicker ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            title="ניהול עמודות"
          >
            ⚙️ עמודות
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            הוספת רופא
          </button>
          {totalDoctors > 0 && (
            <button
              onClick={handleDeleteAll}
              className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              title="נקה את כל המאגר"
            >
              🗑️ נקה מאגר
            </button>
          )}
        </div>
      </div>

      {/* Column picker panel */}
      {showColPicker && (
        <div className="mb-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">בחר עמודות להצגה</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {allColDefs.map(col => (
              <label key={col.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                visibleCols.includes(col.key)
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              } ${col.always ? 'opacity-60 cursor-default' : ''}`}>
                <input
                  type="checkbox"
                  checked={visibleCols.includes(col.key)}
                  disabled={col.always}
                  onChange={() => !col.always && toggleCol(col.key)}
                  className="w-3.5 h-3.5"
                />
                {col.label}
                {col.isExtra && <span className="text-[10px] text-violet-500">מותאם</span>}
              </label>
            ))}
          </div>
          <div className="flex gap-2 items-center border-t border-slate-100 pt-3">
            <input
              className="input text-sm py-1.5 flex-1 max-w-48"
              placeholder="שם עמודה חדשה..."
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomCol()}
            />
            <button onClick={addCustomCol} className="btn-primary text-sm py-1.5 px-4">+ הוסף עמודה</button>
            <button onClick={() => setVisibleCols(DEFAULT_VISIBLE)} className="text-sm text-slate-600 hover:text-slate-800 px-2 py-1.5">איפוס</button>
          </div>
        </div>
      )}

      {/* Excel Import Panel */}
      {importOpen && (
        <div className="card mb-4 max-w-lg">
          <p className="text-sm font-medium text-slate-700 mb-1">ייבוא מקובץ Excel</p>
          <p className="text-xs text-slate-500 mb-3">
            עמודות נתמכות: שם, מומחיות, תת-התמחות, מספר רישיון, טלפון, מיקום, קופות חולים, שפות, הערות ועוד
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelImport}
            disabled={importing}
            className="block w-full text-sm text-slate-600 file:ml-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {importProgress && (
            <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">
                  {importProgress.status === 'running' ? '⏳ מייבא...' : '✓ הסתיים'}
                </span>
                <span className="text-sm text-blue-700 font-mono">
                  {(importProgress.imported ?? 0).toLocaleString()}
                  {importProgress.total > 0 && ` / ${importProgress.total.toLocaleString()}`}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                {importProgress.total > 0
                  ? <div className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((importProgress.imported ?? 0) / importProgress.total) * 100)}%` }} />
                  : <div className="bg-blue-400 h-2 rounded-full animate-pulse w-1/3" />
                }
              </div>
              {importProgress.skipped_duplicates > 0 && (
                <p className="text-xs text-blue-600 mt-1">{importProgress.skipped_duplicates.toLocaleString()} כפילויות דולגו</p>
              )}
            </div>
          )}
          {importStatus && !importProgress && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importStatus.success ? `✅ ${importStatus.message}` : `❌ ${importStatus.message}`}
              {importStatus.detail && <p className="text-xs mt-0.5 opacity-75">{importStatus.detail}</p>}
            </div>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="relative flex items-center" style={{ width: '280px' }}>
          <input
            className="input text-sm w-full"
            style={{ paddingRight: '2.4rem' }}
            placeholder="שם, התמחות, מספר רישיון..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitSearch()}
            dir="rtl"
            autoComplete="new-password"
            name="doctor-search-field"
            type="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          <button
            onClick={submitSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600 transition-colors p-0.5"
            title="חפש (Enter)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
          </button>
        </div>
        <FilterButton
          label="התמחות"
          value={filterSpecialty}
          valueLabel={filterSpecialty}
          options={filterOptions.specialties.map(s => ({ value: s, label: s }))}
          onChange={v => { setFilterSpecialty(v); setFilterSubSpecialty('') }}
        />
        {filterOptions.sub_specialties.length > 0 && (
          <FilterButton
            label="תת-התמחות"
            value={filterSubSpecialty}
            valueLabel={filterSubSpecialty}
            options={filterOptions.sub_specialties.map(s => ({ value: s, label: s }))}
            onChange={setFilterSubSpecialty}
          />
        )}
        <FilterButton
          label="קופת חולים"
          value={filterHmo}
          valueLabel={HMO_LABELS[filterHmo]}
          options={HMO_OPTIONS.map(([key, label]) => ({ value: key, label }))}
          onChange={setFilterHmo}
        />
        <FilterButton
          label="חוות דעת"
          value={filterExpert}
          valueLabel={filterExpert === 'yes' ? 'נותן חוות דעת' : 'לא נותן'}
          options={[{ value: 'yes', label: 'נותן חוות דעת' }, { value: 'no', label: 'לא נותן חוות דעת' }]}
          onChange={setFilterExpert}
        />
        {(search || filterSpecialty || filterSubSpecialty || filterHmo || filterExpert) && (
          <button
            onClick={clearSearch}
            style={{ boxShadow: '0 3px 0 #ef4444, 0 4px 8px rgba(239,68,68,0.2)', transition: 'all 0.12s ease' }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 active:translate-y-0.5"
          >
            ✕ נקה
          </button>
        )}
      </div>
      {searchInput && searchInput !== search && (
        <p className="text-xs text-amber-500 mb-1">לחץ Enter או 🔍 לחיפוש</p>
      )}
      {(filterSpecialty || filterSubSpecialty || filterHmo || filterExpert || search) && (
        <p className="text-xs text-slate-600 mb-3">{totalDoctors.toLocaleString()} תוצאות</p>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-500">טוען...</div>
      ) : doctors.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">אין רופאים במאגר</p>
          <p className="text-slate-600 text-sm mt-1">הוסף רופאים ידנית באמצעות כפתור "הוספת רופא"</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="px-3 py-3 text-center text-xs font-semibold w-10">#</th>
                {allColDefs.filter(c => visibleCols.includes(c.key)).map(c => (
                  <th key={c.key} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((doc, idx) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 text-center text-xs text-slate-600 font-mono">{idx + 1}</td>
                  {allColDefs.filter(c => visibleCols.includes(c.key)).map(c => (
                    <td key={c.key} dir="auto" className={`px-4 py-3 text-slate-600 text-sm ${c.key === 'name' ? 'font-medium text-slate-800' : ''}`}>
                      {renderCell(doc, c.key)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(doc)} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200">עריכה</button>
                      <button onClick={() => handleDelete(doc.id)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-100">מחק</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalDoctors > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-1" dir="rtl">
          <span className="text-sm text-slate-500">
            מציג {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, totalDoctors).toLocaleString()} מתוך {totalDoctors.toLocaleString()} רופאים
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              הקודם
            </button>
            <span className="text-sm text-slate-600 font-medium px-2">
              עמוד {currentPage} / {Math.ceil(totalDoctors / PAGE_SIZE)}
            </span>
            <button
              onClick={() => goToPage(Math.min(Math.ceil(totalDoctors / PAGE_SIZE), currentPage + 1))}
              disabled={currentPage >= Math.ceil(totalDoctors / PAGE_SIZE)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              הבא
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" dir="rtl">
            <h2 className="text-lg font-semibold mb-5">
              {editingId ? 'עריכת רופא' : 'הוספת רופא חדש'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">תואר</label>
                  <select className="input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })}>
                    {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t || '— ללא תואר —'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">שם הרופא *</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">מומחיות</label>
                  <input
                    className="input"
                    placeholder="לדוגמה: אורתופדיה"
                    value={form.specialty}
                    onChange={e => setForm({ ...form, specialty: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">תת-התמחות</label>
                  <input
                    className="input"
                    placeholder="לדוגמה: כירורגיית כתף"
                    value={form.sub_specialty}
                    onChange={e => setForm({ ...form, sub_specialty: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">טלפון ראשי</label>
                  <input
                    className="input"
                    placeholder="03-1234567"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="label">טלפון 2 (מזכירה / קליניקה)</label>
                  <input
                    className="input"
                    placeholder="03-7654321"
                    value={form.phone2 || ''}
                    onChange={e => setForm({ ...form, phone2: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="label">וואטסאפ</label>
                  <input
                    className="input"
                    placeholder="05X-XXXXXXX"
                    value={form.whatsapp || ''}
                    onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="label">אימייל</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="doctor@clinic.co.il"
                    value={form.email || ''}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="label">עיר</label>
                  <input
                    className="input"
                    placeholder="תל אביב"
                    value={form.city || ''}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">מיקום קבלה (קליניקה / בית חולים)</label>
                  <input
                    className="input"
                    placeholder="שם קליניקה / כתובת"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">מחיר ביקור פרטי (₪)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="500"
                    value={form.private_price || ''}
                    onChange={e => setForm({ ...form, private_price: e.target.value ? parseInt(e.target.value) : null })}
                    dir="ltr"
                  />
                </div>

                {/* Insurance agreements — multi-select + add custom */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="label">הסדרי ביטוח</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[...new Set([...Object.keys(HMO_LABELS), ...(form.hmo_acceptance || [])])].map(key => (
                      <label key={key} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={(form.hmo_acceptance || []).includes(key)}
                          onChange={() => toggleHmo(key)}
                          className="w-3.5 h-3.5 rounded accent-blue-600"
                        />
                        <span className="text-sm text-slate-700">{HMO_LABELS[key] || key}</span>
                      </label>
                    ))}
                    <InsuranceAddInput
                      current={form.hmo_acceptance || []}
                      onAdd={company => setForm(f => ({ ...f, hmo_acceptance: [...(f.hmo_acceptance || []), company] }))}
                    />
                  </div>
                </div>

                {/* Expert opinion */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.gives_expert_opinion}
                      onChange={e => setForm({ ...form, gives_expert_opinion: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-sm text-slate-700 font-medium">נותן חוות דעת מקצועית לוועדות</span>
                  </label>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="label">הערות</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="label">מקור (URL)</label>
                  <input
                    className="input"
                    placeholder="https://..."
                    value={form.source_url}
                    onChange={e => setForm({ ...form, source_url: e.target.value })}
                    dir="ltr"
                  />
                </div>
              </div>

              {extraColDefs.length > 0 && (
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-semibold text-slate-500 mb-3">שדות מותאמים</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {extraColDefs.map(col => (
                      <div key={col.key}>
                        <label className="label">{col.label}</label>
                        <input
                          className="input"
                          value={form.extra_data?.[col.label] || ''}
                          onChange={e => setForm({ ...form, extra_data: { ...(form.extra_data || {}), [col.label]: e.target.value } })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'שמור שינויים' : 'הוספת רופא'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {ConfirmUI}
    </div>
  )
}
