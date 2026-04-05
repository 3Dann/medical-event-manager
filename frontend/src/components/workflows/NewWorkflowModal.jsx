import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function NewWorkflowModal({ patientId, onClose, onCreated }) {
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/workflows/templates').then(r => setTemplates(r.data))
  }, [])

  const handleCreate = async () => {
    if (!selectedTemplate) return
    setLoading(true)
    try {
      const res = await axios.post('/api/workflows/instances', {
        template_id: selectedTemplate.id,
        patient_id: patientId,
        title: title || selectedTemplate.name,
      })
      onCreated(res.data)
      onClose()
    } catch (e) {
      alert('שגיאה ביצירת זרימה')
    } finally {
      setLoading(false)
    }
  }

  const CATEGORY_LABELS = {
    claim: 'תביעה', appeal: 'ערר', treatment: 'טיפול', hospitalization: 'אשפוז'
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-800">זרימת עבודה חדשה</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">בחר תבנית</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t); setTitle(t.name) }}
                  className={`w-full text-right p-3 rounded-xl border-2 transition-all ${
                    selectedTemplate?.id === t.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                    <div>
                      <div className="font-medium text-slate-800">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>}
                    </div>
                  </div>
                  {selectedTemplate?.id === t.id && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <div className="text-xs text-blue-600 font-medium mb-1">{t.steps.length} שלבים:</div>
                      <div className="flex flex-wrap gap-1">
                        {t.steps.map(s => (
                          <span key={s.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedTemplate && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">כותרת (אופציונלי)</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                placeholder={selectedTemplate.name}
              />
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            ביטול
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplate || loading}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? 'יוצר...' : 'הפעל זרימה'}
          </button>
        </div>
      </div>
    </div>
  )
}
