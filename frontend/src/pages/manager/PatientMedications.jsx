import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import {
  MedicationCard, MedRow, DRUG_INDICATION_MAP,
} from '../../components/DrugFormComponents'

const SEVERITY_COLORS = {
  high:   { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',   icon: '🔴' },
  medium: { bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700', icon: '🟡' },
  low:    { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',  icon: '🔵' },
}

const DRUGS_COM_URL = (names) =>
  `https://www.drugs.com/drug_interactions.html?drugs=${encodeURIComponent(names.join('+'))}`


const emptyForm = () => ({
  name: '', generic_name: '', dosage: '', frequency: '', indication: '',
  start_date: '', end_date: '', notes: '', is_active: true,
})

export default function PatientMedications() {
  const { id } = useParams()
  const [medications, setMedications] = useState([])
  const [interactions, setInteractions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  // Document extraction
  const [documents, setDocuments] = useState([])
  const [extractDocId, setExtractDocId] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [showExtract, setShowExtract] = useState(false)

  const fetchAll = async () => {
    const res = await axios.get(`/api/patients/${id}/medications`)
    setMedications(res.data.medications)
    setInteractions(res.data.interactions)
  }

  const fetchDocuments = async () => {
    const res = await axios.get(`/api/patients/${id}/documents`)
    setDocuments(res.data.filter(d => d.file_type?.includes('pdf') || d.original_name?.endsWith('.pdf')))
  }

  useEffect(() => { fetchAll(); fetchDocuments() }, [id])

  const openAdd = () => { setForm(emptyForm()); setEditId(null); setShowForm(true) }
  const openEdit = async (m) => {
    setForm({
      name: m.name || '', generic_name: m.generic_name || '', dosage: m.dosage || '',
      frequency: m.frequency || '', indication: m.indication || '',
      start_date: m.start_date || '', end_date: m.end_date || '',
      notes: m.notes || '', is_active: m.is_active,
    })
    setEditId(m.id)
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await axios.put(`/api/patients/${id}/medications/${editId}`, form)
      } else {
        await axios.post(`/api/patients/${id}/medications`, form)
      }
      setShowForm(false)
      fetchAll()
    } finally { setSaving(false) }
  }

  const handleDelete = async (medId) => {
    if (!confirm('למחוק תרופה זו?')) return
    await axios.delete(`/api/patients/${id}/medications/${medId}`)
    fetchAll()
  }

  const toggleActive = async (m) => {
    await axios.put(`/api/patients/${id}/medications/${m.id}`, { is_active: !m.is_active })
    fetchAll()
  }

  const handleExtract = async () => {
    if (!extractDocId) return
    setExtracting(true); setCandidates([])
    try {
      const res = await axios.get(`/api/patients/${id}/medications/extract/${extractDocId}`)
      setCandidates(res.data.candidates)
    } catch (err) {
      alert(err.response?.data?.detail || 'שגיאה בחילוץ')
    } finally { setExtracting(false) }
  }

  const addCandidate = async (c) => {
    await axios.post(`/api/patients/${id}/medications`, { name: c.name, generic_name: c.generic_name, dosage: c.dosage, frequency: c.frequency, indication: c.indication })
    setCandidates(prev => prev.filter(x => x.name !== c.name))
    fetchAll()
  }

  const active = medications.filter(m => m.is_active)
  const inactive = medications.filter(m => !m.is_active)
  const drugsComNames = active.map(m => m.generic_name || m.name).filter(Boolean)

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Interactions panel */}
      {interactions.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-red-800 flex items-center gap-2">
              ⚠️ התנגשויות תרופות שזוהו ({interactions.length})
            </h3>
            {drugsComNames.length > 1 && (
              <a
                href={DRUGS_COM_URL(drugsComNames)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
              >
                בדיקה מלאה ב-Drugs.com ↗
              </a>
            )}
          </div>
          {interactions.map((ix, i) => {
            const c = SEVERITY_COLORS[ix.severity] || SEVERITY_COLORS.low
            return (
              <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
                <div className="flex items-start gap-2">
                  <span className="text-base mt-0.5">{c.icon}</span>
                  <div>
                    <p className={`font-medium text-sm ${c.text}`}>
                      {ix.drug_a} ↔ {ix.drug_b}
                      <span className={`mr-2 text-xs px-2 py-0.5 rounded-full font-normal ${c.badge}`}>
                        {ix.severity === 'high' ? 'חמור' : ix.severity === 'medium' ? 'בינוני' : 'קל'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">{ix.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
          <p className="text-xs text-slate-500 italic border-t border-red-200 pt-2">
            ⚕️ מידע זה הוא לצורך מידע בלבד ואינו מהווה תחליף לייעוץ רפואי מקצועי. יש להתייעץ עם רופא או רוקח לפני כל שינוי בטיפול התרופתי.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">תרופות</h2>
          <p className="text-sm text-slate-500">{active.length} פעילות{inactive.length > 0 ? `, ${inactive.length} לא פעילות` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExtract(v => !v)}
            className="text-sm border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-xl font-medium"
          >
            📄 זיהוי ממסמך
          </button>
          <button
            onClick={openAdd}
            className="text-sm bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-xl font-medium"
          >
            + הוסף תרופה
          </button>
        </div>
      </div>

      {/* Document extraction panel */}
      {showExtract && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-medium text-blue-800">זיהוי תרופות ממסמך PDF</p>
          <p className="text-xs text-blue-600">המערכת תנסה לזהות שמות תרופות מתוך מסמך רפואי. יש לאשר ידנית כל תרופה שזוהתה.</p>
          <div className="flex gap-2">
            <select
              className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={extractDocId}
              onChange={e => setExtractDocId(e.target.value)}
            >
              <option value="">— בחר מסמך PDF —</option>
              {documents.map(d => (
                <option key={d.id} value={d.id}>{d.original_name}</option>
              ))}
            </select>
            <button
              onClick={handleExtract}
              disabled={!extractDocId || extracting}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {extracting ? 'מזהה...' : 'זהה תרופות'}
            </button>
          </div>
          {documents.length === 0 && (
            <p className="text-xs text-blue-500">אין מסמכי PDF בתיק המטופל — יש להעלות מסמך בטאב מסמכים תחילה.</p>
          )}
          {candidates.length > 0 && (
            <div className="space-y-2 border-t border-blue-200 pt-3">
              <p className="text-xs font-medium text-blue-800">{candidates.length} תרופות שזוהו — לחץ ✓ להוספה:</p>
              {candidates.map((c, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-xl border border-blue-200 px-3 py-2">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <button
                    onClick={() => addCandidate(c)}
                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-100"
                  >
                    ✓ הוסף
                  </button>
                </div>
              ))}
            </div>
          )}
          {!extracting && candidates.length === 0 && extractDocId && (
            <p className="text-xs text-slate-400">לחץ "זהה תרופות" לסריקת המסמך.</p>
          )}
        </div>
      )}

      {/* Active medications */}
      {active.length === 0 && !showForm ? (
        <div className="card text-center py-12 text-slate-400">
          אין תרופות פעילות — לחץ "הוסף תרופה" להתחלה
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(m => <MedRow key={m.id} med={m} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} />)}
        </div>
      )}

      {/* Inactive section */}
      {inactive.length > 0 && (
        <div>
          <button
            onClick={() => setShowInactive(v => !v)}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2"
          >
            {showInactive ? '▾' : '▸'} תרופות לא פעילות / היסטוריה ({inactive.length})
          </button>
          {showInactive && (
            <div className="space-y-2 opacity-70">
              {inactive.map(m => <MedRow key={m.id} med={m} onEdit={openEdit} onDelete={handleDelete} onToggle={toggleActive} />)}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-slate-800">{editId ? 'עריכת תרופה' : 'הוספת תרופה'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSave} autoComplete="off" className="p-6">
              <MedicationCard
                med={form}
                onChange={updated => setForm(f => ({ ...f, ...updated }))}
              />
              <div className="flex gap-3 justify-end border-t pt-4 mt-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ביטול</button>
                <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-50">
                  {saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drugs.com link (floating) */}
      {drugsComNames.length > 1 && interactions.length === 0 && (
        <div className="text-center">
          <a
            href={DRUGS_COM_URL(drugsComNames)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-blue-600 underline"
          >
            בדוק אינטראקציות מלאות ב-Drugs.com ↗
          </a>
          <p className="text-xs text-slate-300 mt-0.5">למידע בלבד — אינו תחליף לייעוץ רפואי</p>
        </div>
      )}
    </div>
  )
}

