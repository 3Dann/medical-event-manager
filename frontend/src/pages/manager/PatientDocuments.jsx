import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const CATEGORIES = ['רפואי', 'ביטוחי', 'משפטי', 'פיננסי', 'אחר']

const FILE_ICONS = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/gif': '🖼️',
  'image/webp': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PatientDocuments() {
  const { id } = useParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: 'רפואי', notes: '' })
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchDocs() }, [id])

  async function fetchDocs() {
    setLoading(true)
    try {
      const res = await axios.get(`/api/patients/${id}/documents`)
      setDocs(res.data)
    } catch {
      setError('שגיאה בטעינת מסמכים')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('category', form.category)
    fd.append('notes', form.notes)
    try {
      await axios.post(`/api/patients/${id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowForm(false)
      setSelectedFile(null)
      setForm({ category: 'רפואי', notes: '' })
      fetchDocs()
    } catch (err) {
      setError(err.response?.data?.detail || 'שגיאה בהעלאה')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(doc) {
    try {
      const res = await axios.get(`/api/patients/${id}/documents/${doc.id}/download`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = doc.original_name
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('שגיאה בהורדת הקובץ')
    }
  }

  async function handleDelete(docId) {
    if (!window.confirm('למחוק את המסמך?')) return
    setDeletingId(docId)
    try {
      await axios.delete(`/api/patients/${id}/documents/${docId}`)
      setDocs(prev => prev.filter(d => d.id !== docId))
    } catch {
      setError('שגיאה במחיקה')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">מסמכים</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-primary text-sm"
        >
          {showForm ? 'ביטול' : '+ העלאת מסמך'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleUpload}
          className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">קובץ *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
              onChange={e => setSelectedFile(e.target.files[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-0 file:ml-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-slate-400 mt-1">PDF, תמונות, Word, Excel — עד 20MB</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="input-field w-full"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full"
                placeholder="הערה קצרה (אופציונלי)"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">ביטול</button>
            <button type="submit" disabled={uploading || !selectedFile} className="btn-primary text-sm">
              {uploading ? 'מעלה...' : 'העלאה'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-12">טוען...</div>
      ) : docs.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <div className="text-4xl mb-3">📂</div>
          <p>אין מסמכים עדיין</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
            >
              <span className="text-2xl shrink-0">{FILE_ICONS[doc.file_type] || '📎'}</span>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{doc.original_name}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                  {doc.category && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{doc.category}</span>
                  )}
                  {doc.file_size && <span>{formatBytes(doc.file_size)}</span>}
                  <span>{formatDate(doc.created_at)}</span>
                  {doc.uploaded_by_name && <span>{doc.uploaded_by_name}</span>}
                  {doc.notes && <span className="text-slate-500 italic">{doc.notes}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownload(doc)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  הורדה
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  {deletingId === doc.id ? '...' : 'מחיקה'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
