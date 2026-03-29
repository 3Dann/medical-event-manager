import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const DIAGNOSIS_LABELS = { yes: 'אבחון קיים', no: 'ללא אבחון', pending: 'בבירור' }
const DIAGNOSIS_COLORS = { yes: 'badge-blue', no: 'badge-gray', pending: 'badge-yellow' }

export default function ManagerDashboard() {
  const [patients, setPatients] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', id_number: '', diagnosis_status: 'no', diagnosis_details: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [showImportSal, setShowImportSal] = useState(false)
  const [importIdNumber, setImportIdNumber] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const navigate = useNavigate()

  const handleImportSal = async (e) => {
    e.preventDefault()
    setImporting(true); setImportResult(null)
    try {
      const res = await axios.post('/api/import/sal-habriut', { id_number: importIdNumber })
      setImportResult({ success: true, message: res.data.message, name: res.data.patient_name, count: res.data.coverages_imported })
      setImportIdNumber('')
    } catch (err) {
      setImportResult({ success: false, message: err.response?.data?.detail || 'שגיאה בייבוא' })
    } finally { setImporting(false) }
  }

  useEffect(() => { fetchPatients() }, [])

  const fetchPatients = async () => {
    try { const res = await axios.get('/api/patients'); setPatients(res.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/patients', form)
      setShowForm(false)
      setForm({ full_name: '', id_number: '', diagnosis_status: 'no', diagnosis_details: '', notes: '' })
      fetchPatients()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id) => {
    if (!confirm('האם למחוק תיק זה?')) return
    try { await axios.delete(`/api/patients/${id}`); fetchPatients() }
    catch (e) { console.error(e) }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">לוח בקרה</h1>
          <p className="text-slate-500 mt-1">ניהול תיקי מטופלים</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          תיק מטופל חדש
        </button>
      </div>

      {/* Import sal habriut */}
      <div className="mb-4">
        <button onClick={() => { setShowImportSal(!showImportSal); setImportResult(null) }}
          className="btn-secondary text-sm flex items-center gap-2">
          🏥 ייבוא סל הבריאות לפי ת.ז.
        </button>
        {showImportSal && (
          <div className="mt-3 card max-w-md">
            <p className="text-sm font-medium text-slate-700 mb-3">ייבוא כיסויי סל הבריאות לתיק מטופל</p>
            <form onSubmit={handleImportSal} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="הכנס מספר ת.ז."
                value={importIdNumber}
                onChange={e => setImportIdNumber(e.target.value)}
                required
              />
              <button type="submit" disabled={importing} className="btn-primary text-sm whitespace-nowrap">
                {importing ? 'מייבא...' : 'ייבא'}
              </button>
            </form>
            {importResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {importResult.success
                  ? `✅ ${importResult.message} (${importResult.count} כיסויים)`
                  : `❌ ${importResult.message}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-slate-500">סה"כ מטופלים</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{patients.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">עם אבחנה</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{patients.filter(p => p.diagnosis_status === 'yes').length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">בבירור</p>
          <p className="text-3xl font-bold text-yellow-600 mt-1">{patients.filter(p => p.diagnosis_status === 'pending').length}</p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-5">תיק מטופל חדש</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">שם מלא *</label>
                  <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
                </div>
                <div>
                  <label className="label">מספר ת.ז.</label>
                  <input className="input" value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})} />
                </div>
                <div>
                  <label className="label">סטטוס אבחנה</label>
                  <select className="input" value={form.diagnosis_status} onChange={e => setForm({...form, diagnosis_status: e.target.value})}>
                    <option value="no">ללא אבחנה</option>
                    <option value="yes">אבחנה קיימת</option>
                    <option value="pending">בבירור</option>
                  </select>
                </div>
                {form.diagnosis_status === 'yes' && (
                  <div className="col-span-2">
                    <label className="label">פירוט האבחנה</label>
                    <textarea className="input" rows={3} value={form.diagnosis_details} onChange={e => setForm({...form, diagnosis_details: e.target.value})} />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="label">הערות</label>
                  <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
                <button type="submit" className="btn-primary">יצירת תיק</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patients list */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">טוען...</div>
      ) : patients.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">אין מטופלים עדיין</p>
          <p className="text-slate-400 text-sm mt-1">לחץ על "תיק מטופל חדש" להתחלה</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {patients.map(p => (
            <div key={p.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/manager/patients/${p.id}`)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">{p.full_name[0]}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{p.full_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={DIAGNOSIS_COLORS[p.diagnosis_status]}>{DIAGNOSIS_LABELS[p.diagnosis_status]}</span>
                      {p.diagnosis_details && <span className="text-xs text-slate-500 truncate max-w-xs">{p.diagnosis_details}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); navigate(`/manager/patients/${p.id}/strategy`) }}
                    className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                    אסטרטגיה
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                    className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-100">
                    מחק
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
