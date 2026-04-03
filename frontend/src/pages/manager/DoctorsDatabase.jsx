import React, { useState, useEffect } from 'react'
import axios from 'axios'

const HMO_LABELS = {
  clalit: 'כללית',
  maccabi: 'מכבי',
  meuhedet: 'מאוחדת',
  leumit: 'לאומית',
}
const HMO_OPTIONS = Object.entries(HMO_LABELS)

const EMPTY_FORM = {
  name: '',
  specialty: '',
  sub_specialty: '',
  phone: '',
  location: '',
  hmo_acceptance: [],
  gives_expert_opinion: false,
  notes: '',
  source_url: '',
}

export default function DoctorsDatabase() {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterHmo, setFilterHmo] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterSubSpecialty, setFilterSubSpecialty] = useState('')
  const [filterLocation] = useState('')
  const [filterExpert, setFilterExpert] = useState('')
  const [filterOptions, setFilterOptions] = useState({ specialties: [], sub_specialties: [], areas: [] })
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [importMode, setImportMode] = useState(null) // 'excel' | 'pdf' | 'url'
  const [importUrl, setImportUrl] = useState('')
  const [importStatus, setImportStatus] = useState(null)
  const [importing, setImporting] = useState(false)


  useEffect(() => { fetchFilterOptions() }, [])
  useEffect(() => { fetchDoctors() }, [search, filterHmo, filterSpecialty, filterSubSpecialty, filterLocation, filterExpert])

  const fetchFilterOptions = async () => {
    try { const res = await axios.get('/api/doctors/filter-options'); setFilterOptions(res.data) }
    catch (e) { console.error(e) }
  }

  const fetchDoctors = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterHmo) params.hmo = filterHmo
      if (filterSpecialty) params.specialty = filterSpecialty
      if (filterSubSpecialty) params.sub_specialty = filterSubSpecialty
      if (filterLocation) params.location = filterLocation
      if (filterExpert !== '') params.expert_opinion = filterExpert === 'yes'
      const res = await axios.get('/api/doctors', { params })
      setDoctors(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (doc) => {
    setEditingId(doc.id)
    setForm({
      name: doc.name || '',
      specialty: doc.specialty || '',
      sub_specialty: doc.sub_specialty || '',
      phone: doc.phone || '',
      location: doc.location || '',
      hmo_acceptance: doc.hmo_acceptance || [],
      gives_expert_opinion: doc.gives_expert_opinion || false,
      notes: doc.notes || '',
      source_url: doc.source_url || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await axios.put(`/api/doctors/${editingId}`, form)
      } else {
        await axios.post('/api/doctors', form)
      }
      setShowForm(false)
      fetchDoctors()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('האם למחוק רופא זה?')) return
    try {
      await axios.delete(`/api/doctors/${id}`)
      fetchDoctors()
    } catch (e) {
      console.error(e)
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

  const handleFileImport = async (e, type) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportStatus(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post(`/api/doctors/import/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportStatus({ success: true, message: `יובאו ${res.data.imported} רופאים בהצלחה` })
      fetchDoctors()
    } catch (err) {
      setImportStatus({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleUrlImport = async (e) => {
    e.preventDefault()
    setImporting(true)
    setImportStatus(null)
    try {
      const res = await axios.post('/api/doctors/import/url', { url: importUrl })
      setImportStatus({ success: true, message: res.data.message || 'ייבוא הושק ברקע' })
      setImportUrl('')
      // poll after a few seconds for new results
      setTimeout(() => fetchDoctors(), 4000)
    } catch (err) {
      setImportStatus({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">מאגר רופאים מומחים</h1>
          <p className="text-slate-500 mt-1">{doctors.length} רופאים במאגר</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          הוספת רופא
        </button>
      </div>

      {/* Import toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setImportMode(importMode === 'excel' ? null : 'excel'); setImportStatus(null) }}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          📊 ייבוא מ-Excel
        </button>
        <button
          onClick={() => { setImportMode(importMode === 'pdf' ? null : 'pdf'); setImportStatus(null) }}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          📄 ייבוא מ-PDF
        </button>
        <button
          onClick={() => { setImportMode(importMode === 'url' ? null : 'url'); setImportStatus(null) }}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          🌐 ייבוא מהרשת
        </button>
      </div>

      {/* Import panels */}
      {importMode === 'excel' && (
        <div className="card mb-4 max-w-lg">
          <p className="text-sm font-medium text-slate-700 mb-2">העלה קובץ Excel</p>
          <p className="text-xs text-slate-500 mb-3">
            עמודות נתמכות: שם, מומחיות, תת-התמחות, טלפון, מיקום, קופות חולים, חוות דעת, הערות
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => handleFileImport(e, 'excel')}
            disabled={importing}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {importing && <p className="text-sm text-slate-500 mt-2">מייבא...</p>}
          {importStatus && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importStatus.success ? `✅ ${importStatus.message}` : `❌ ${importStatus.message}`}
            </div>
          )}
        </div>
      )}

      {importMode === 'pdf' && (
        <div className="card mb-4 max-w-lg">
          <p className="text-sm font-medium text-slate-700 mb-2">העלה קובץ PDF</p>
          <p className="text-xs text-slate-500 mb-3">הקובץ חייב להכיל טבלת רופאים עם כותרות עמודות</p>
          <input
            type="file"
            accept=".pdf"
            onChange={e => handleFileImport(e, 'pdf')}
            disabled={importing}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {importing && <p className="text-sm text-slate-500 mt-2">מייבא...</p>}
          {importStatus && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importStatus.success ? `✅ ${importStatus.message}` : `❌ ${importStatus.message}`}
            </div>
          )}
        </div>
      )}

      {importMode === 'url' && (
        <div className="card mb-4 max-w-lg">
          <p className="text-sm font-medium text-slate-700 mb-2">ייבוא מעמוד אינטרנט</p>
          <p className="text-xs text-slate-500 mb-3">הדבק כתובת URL לעמוד המכיל טבלת רופאים</p>
          <form onSubmit={handleUrlImport} className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="https://..."
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              required
              dir="ltr"
            />
            <button type="submit" disabled={importing} className="btn-primary text-sm whitespace-nowrap">
              {importing ? 'מייבא...' : 'ייבא'}
            </button>
          </form>
          {importStatus && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${importStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importStatus.success ? `✅ ${importStatus.message}` : `❌ ${importStatus.message}`}
            </div>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-2 mb-2">
        <input
          className="input w-56 text-sm"
          placeholder="חיפוש חופשי..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-44 text-sm" value={filterSpecialty} onChange={e => { setFilterSpecialty(e.target.value); setFilterSubSpecialty('') }}>
          <option value="">כל ההתמחויות</option>
          {filterOptions.specialties.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {filterOptions.sub_specialties.length > 0 && (
          <select className="input w-44 text-sm" value={filterSubSpecialty} onChange={e => setFilterSubSpecialty(e.target.value)}>
            <option value="">כל תת-ההתמחויות</option>
            {filterOptions.sub_specialties.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select className="input w-40 text-sm" value={filterHmo} onChange={e => setFilterHmo(e.target.value)}>
          <option value="">כל קופות החולים</option>
          {HMO_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className="input w-40 text-sm" value={filterExpert} onChange={e => setFilterExpert(e.target.value)}>
          <option value="">חוות דעת — הכל</option>
          <option value="yes">נותן חוות דעת</option>
          <option value="no">לא נותן חוות דעת</option>
        </select>
        {(search || filterSpecialty || filterSubSpecialty || filterLocation || filterHmo || filterExpert) && (
          <button
            onClick={() => { setSearch(''); setFilterSpecialty(''); setFilterSubSpecialty(''); setFilterHmo(''); setFilterExpert('') }}
            className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            ✕ נקה פילטרים
          </button>
        )}
      </div>
      {(filterSpecialty || filterSubSpecialty || filterHmo || filterExpert || search) && (
        <p className="text-xs text-slate-400 mb-4">{doctors.length} תוצאות</p>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-500">טוען...</div>
      ) : doctors.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">אין רופאים במאגר</p>
          <p className="text-slate-400 text-sm mt-1">הוסף רופאים ידנית או ייבא מקובץ</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right font-medium">שם הרופא</th>
                <th className="px-4 py-3 text-right font-medium">מומחיות</th>
                <th className="px-4 py-3 text-right font-medium">תת-התמחות</th>
                <th className="px-4 py-3 text-right font-medium">טלפון</th>
                <th className="px-4 py-3 text-right font-medium">מיקום קבלה</th>
                <th className="px-4 py-3 text-right font-medium">קופות חולים</th>
                <th className="px-4 py-3 text-center font-medium">חוות דעת</th>
                <th className="px-4 py-3 text-right font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{doc.name}</td>
                  <td className="px-4 py-3 text-slate-600">{doc.specialty || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{doc.sub_specialty || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dir-ltr" dir="ltr">{doc.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{doc.location || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {doc.hmo_acceptance && doc.hmo_acceptance.length > 0
                        ? doc.hmo_acceptance.map(h => (
                            <span key={h} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                              {HMO_LABELS[h] || h}
                            </span>
                          ))
                        : <span className="text-slate-400">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {doc.gives_expert_opinion
                      ? <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full">כן</span>
                      : <span className="text-slate-300">לא</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(doc)}
                        className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200"
                      >
                        עריכה
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-100"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">שם הרופא *</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
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
                  <label className="label">טלפון</label>
                  <input
                    className="input"
                    placeholder="03-1234567"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="label">מיקום קבלה</label>
                  <input
                    className="input"
                    placeholder="שם קליניקה / בית חולים / עיר"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                  />
                </div>

                {/* HMO checkboxes */}
                <div className="col-span-2">
                  <label className="label">קופות חולים מקבל</label>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {HMO_OPTIONS.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.hmo_acceptance.includes(key)}
                          onChange={() => toggleHmo(key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600"
                        />
                        <span className="text-sm text-slate-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expert opinion */}
                <div className="col-span-2">
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

                <div className="col-span-2">
                  <label className="label">הערות</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
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
    </div>
  )
}
