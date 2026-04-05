import React, { useState, useEffect } from 'react'
import axios from 'axios'
import ResizablePanel from '../../components/ResizablePanel'

const CATEGORY_LABELS = {
  claim: 'תביעה', appeal: 'ערר', treatment: 'טיפול', hospitalization: 'אשפוז'
}
const CATEGORY_COLORS = {
  claim: 'bg-blue-100 text-blue-700',
  appeal: 'bg-amber-100 text-amber-700',
  treatment: 'bg-green-100 text-green-700',
  hospitalization: 'bg-purple-100 text-purple-700',
}

export default function WorkflowsPage() {
  const [templates, setTemplates] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/workflows/templates')
      .then(r => { setTemplates(r.data); if (r.data.length) setSelected(r.data[0]) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">טוען תבניות...</div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">תבניות זרימת עבודה</h1>
        <p className="text-slate-500 text-sm mt-1">תבניות מובנות לניהול תהליכי טיפול ותביעות</p>
      </div>

      <div className="flex gap-0">
        {/* Template list — resizable sidebar */}
        <ResizablePanel
          direction="horizontal"
          defaultSize={288}
          minSize={200}
          maxSize={480}
          className="flex-shrink-0"
        >
        <div className="space-y-2 overflow-y-auto h-full pr-4">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                selected?.id === t.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[t.category] || 'bg-slate-100 text-slate-500'}`}>
                  {CATEGORY_LABELS[t.category] || t.category}
                </span>
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{t.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t.steps.length} שלבים</div>
                </div>
              </div>
              {t.is_builtin && (
                <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                  <span>🔒</span> תבנית מובנית
                </div>
              )}
            </button>
          ))}
        </div>
        </ResizablePanel>

        {/* Template detail */}
        {selected && (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 mr-6 overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <span className={`text-sm px-3 py-1 rounded-full ${CATEGORY_COLORS[selected.category] || 'bg-slate-100 text-slate-500'}`}>
                {CATEGORY_LABELS[selected.category] || selected.category}
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
                {selected.description && (
                  <p className="text-slate-500 text-sm mt-1">{selected.description}</p>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute right-5 top-0 bottom-0 w-0.5 bg-slate-200" />
              <div className="space-y-4">
                {selected.steps.map((step, idx) => (
                  <div key={step.id} className="flex gap-4 relative">
                    <div className="flex-1" />
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm z-10 relative">
                      {idx + 1}
                    </div>
                    <div className="flex-[2] bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{step.name}</span>
                        {step.is_optional && (
                          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">אופציונלי</span>
                        )}
                        {step.duration_days && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                            ~{step.duration_days} ימים
                          </span>
                        )}
                      </div>
                      {step.instructions && (
                        <p className="text-sm text-slate-500">{step.instructions}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
