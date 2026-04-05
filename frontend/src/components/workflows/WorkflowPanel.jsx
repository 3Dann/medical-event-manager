import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import StepCard from './StepCard'
import NewWorkflowModal from './NewWorkflowModal'

const STATUS_LABELS = { active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל', paused: 'מושהה' }
const STATUS_COLORS = {
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  paused:    'bg-amber-100 text-amber-700',
}

export default function WorkflowPanel({ patientId }) {
  const [instances, setInstances] = useState([])
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchInstances = useCallback(async () => {
    try {
      const res = await axios.get(`/api/workflows/instances?patient_id=${patientId}`)
      setInstances(res.data)
      if (res.data.length > 0 && !selected) {
        setSelected(res.data.find(i => i.status === 'active') || res.data[0])
      }
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { fetchInstances() }, [fetchInstances])

  const handleUpdated = async (updatedInstance) => {
    // re-fetch full instance with steps
    const res = await axios.get(`/api/workflows/instances/${updatedInstance.id}`)
    setSelected(res.data)
    setInstances(prev => prev.map(i => i.id === res.data.id ? res.data : i))
  }

  const handleAction = async (action, instanceId) => {
    try {
      if (action === 'pause') await axios.post(`/api/workflows/instances/${instanceId}/pause`, { reason: '' })
      if (action === 'resume') await axios.post(`/api/workflows/instances/${instanceId}/resume`)
      if (action === 'cancel') {
        if (!window.confirm('לבטל את הזרימה?')) return
        await axios.post(`/api/workflows/instances/${instanceId}/cancel`, { reason: '' })
      }
      if (action === 'delete') {
        if (!window.confirm('למחוק את הזרימה לצמיתות?')) return
        await axios.delete(`/api/workflows/instances/${instanceId}`)
        const remaining = instances.filter(i => i.id !== instanceId)
        setInstances(remaining)
        setSelected(remaining[0] || null)
        return
      }
      const res = await axios.get(`/api/workflows/instances/${instanceId}`)
      setSelected(res.data)
      setInstances(prev => prev.map(i => i.id === res.data.id ? res.data : i))
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה')
    }
  }

  if (loading) return (
    <div className="p-6 text-center text-slate-400 text-sm">טוען זרימות...</div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          <span>+</span> זרימה חדשה
        </button>
        <h3 className="font-semibold text-slate-800">זרימות עבודה</h3>
      </div>

      {instances.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <div className="text-slate-600 font-medium mb-1">אין זרימות עבודה</div>
          <div className="text-slate-400 text-sm mb-4">הפעל זרימה לניהול תהליך מובנה</div>
          <button
            onClick={() => setShowNew(true)}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            הפעל זרימה ראשונה
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Instance list */}
          <div className="w-48 border-l border-slate-200 overflow-y-auto flex-shrink-0 bg-slate-50">
            {instances.map(inst => (
              <button
                key={inst.id}
                onClick={() => setSelected(inst)}
                className={`w-full text-right p-3 border-b border-slate-200 transition-colors ${
                  selected?.id === inst.id ? 'bg-white border-r-2 border-r-blue-500' : 'hover:bg-white'
                }`}
              >
                <div className="text-xs font-medium text-slate-700 truncate">{inst.title}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[inst.status]}`}>
                    {STATUS_LABELS[inst.status]}
                  </span>
                </div>
                <div className="mt-1.5">
                  <div className="h-1 bg-slate-200 rounded-full">
                    <div
                      className="h-1 bg-blue-500 rounded-full transition-all"
                      style={{ width: `${inst.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{inst.progress}%</div>
                </div>
              </button>
            ))}
          </div>

          {/* Instance detail */}
          {selected && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-1.5">
                    {selected.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleAction('pause', selected.id)}
                          className="text-xs px-2 py-1 text-amber-600 hover:bg-amber-50 rounded border border-amber-200"
                        >השהה</button>
                        <button
                          onClick={() => handleAction('cancel', selected.id)}
                          className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded border border-red-200"
                        >בטל</button>
                      </>
                    )}
                    {selected.status === 'paused' && (
                      <button
                        onClick={() => handleAction('resume', selected.id)}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
                      >חדש</button>
                    )}
                    <button
                      onClick={() => handleAction('delete', selected.id)}
                      className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200"
                      title="מחק זרימה לצמיתות"
                    >מחק</button>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-800">{selected.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>
                        {STATUS_LABELS[selected.status]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {selected.completed_steps}/{selected.total_steps} שלבים
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-200 rounded-full">
                      <div
                        className="h-1.5 bg-blue-500 rounded-full transition-all"
                        style={{ width: `${selected.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 space-y-2">
                {selected.steps?.map(step => (
                  <StepCard
                    key={step.id}
                    step={step}
                    instanceId={selected.id}
                    onUpdated={handleUpdated}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showNew && (
        <NewWorkflowModal
          patientId={patientId}
          onClose={() => setShowNew(false)}
          onCreated={inst => {
            setInstances(prev => [inst, ...prev])
            setSelected(inst)
          }}
        />
      )}
    </div>
  )
}
