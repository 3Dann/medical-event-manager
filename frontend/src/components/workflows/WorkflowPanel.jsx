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

const STEP_STATUS = {
  pending:   { circle: 'bg-slate-100 border-slate-300 text-slate-400',  line: 'bg-slate-200', label: 'text-slate-400' },
  active:    { circle: 'bg-blue-600  border-blue-600  text-white',       line: 'bg-slate-200', label: 'text-blue-700 font-semibold' },
  completed: { circle: 'bg-green-500 border-green-500 text-white',       line: 'bg-green-400', label: 'text-green-700' },
  skipped:   { circle: 'bg-slate-200 border-slate-300 text-slate-400',   line: 'bg-slate-200', label: 'text-slate-400 line-through' },
}

const STEP_ICON = { pending: null, active: null, completed: '✓', skipped: '⇢' }

export default function WorkflowPanel({ patientId }) {
  const [instances, setInstances] = useState([])
  const [selected, setSelected] = useState(null)
  const [activeStep, setActiveStep] = useState(null)   // step object currently expanded
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(false) // first confirmation step

  const fetchInstances = useCallback(async () => {
    try {
      const res = await axios.get(`/api/workflows/instances?patient_id=${patientId}`)
      setInstances(res.data)
      if (res.data.length > 0 && !selected) {
        const first = res.data.find(i => i.status === 'active') || res.data[0]
        setSelected(first)
      }
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { fetchInstances() }, [fetchInstances])

  // Auto-expand the active step when instance changes; reset delete confirm
  useEffect(() => {
    setDeleteConfirm(false)
    if (selected?.steps) {
      const act = selected.steps.find(s => s.status === 'active') || selected.steps[0]
      setActiveStep(act || null)
    } else {
      setActiveStep(null)
    }
  }, [selected?.id])

  const handleUpdated = async (updatedInstance) => {
    const res = await axios.get(`/api/workflows/instances/${updatedInstance.id}`)
    setSelected(res.data)
    setInstances(prev => prev.map(i => i.id === res.data.id ? res.data : i))
  }

  const handleAction = async (action, instanceId) => {
    try {
      if (action === 'pause')  await axios.post(`/api/workflows/instances/${instanceId}/pause`,  { reason: '' })
      if (action === 'resume') await axios.post(`/api/workflows/instances/${instanceId}/resume`)
      if (action === 'cancel') {
        if (!window.confirm('לבטל את הזרימה?')) return
        await axios.post(`/api/workflows/instances/${instanceId}/cancel`, { reason: '' })
      }
      if (action === 'delete') {
        await axios.delete(`/api/workflows/instances/${instanceId}`)
        const remaining = instances.filter(i => i.id !== instanceId)
        setInstances(remaining)
        setSelected(remaining[0] || null)
        setDeleteConfirm(false)
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
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
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
          {/* Instance sidebar */}
          <div className="w-44 border-l border-slate-200 overflow-y-auto flex-shrink-0 bg-slate-50">
            {instances.map(inst => (
              <button
                key={inst.id}
                onClick={() => setSelected(inst)}
                className={`w-full text-right p-3 border-b border-slate-200 transition-colors ${
                  selected?.id === inst.id ? 'bg-white border-r-2 border-r-blue-500' : 'hover:bg-white'
                }`}
              >
                <div className="text-xs font-medium text-slate-700 truncate">{inst.title}</div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${STATUS_COLORS[inst.status]}`}>
                  {STATUS_LABELS[inst.status]}
                </span>
                <div className="mt-1.5">
                  <div className="h-1 bg-slate-200 rounded-full">
                    <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${inst.progress}%` }} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{inst.progress}%</div>
                </div>
              </button>
            ))}
          </div>

          {/* Main area */}
          {selected && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Instance header */}
              <div className="px-5 py-3 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-1.5 flex-shrink-0">
                    {selected.status === 'active' && (
                      <>
                        <button onClick={() => handleAction('pause', selected.id)}
                          className="text-xs px-2 py-1 text-amber-600 hover:bg-amber-50 rounded border border-amber-200">
                          השהה
                        </button>
                        <button onClick={() => handleAction('cancel', selected.id)}
                          className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded border border-red-200">
                          בטל
                        </button>
                      </>
                    )}
                    {selected.status === 'paused' && (
                      <button onClick={() => handleAction('resume', selected.id)}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
                        חדש
                      </button>
                    )}
                    {!deleteConfirm ? (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200"
                        title="מחק זרימה לצמיתות"
                      >
                        מחק
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded px-2 py-1">
                        <span className="text-xs text-red-700 font-medium">למחוק לצמיתות?</span>
                        <button
                          onClick={() => handleAction('delete', selected.id)}
                          className="text-xs bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700"
                        >
                          כן, מחק
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="text-xs text-slate-500 hover:text-slate-700 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-right min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{selected.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>
                        {STATUS_LABELS[selected.status]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {selected.completed_steps}/{selected.total_steps} שלבים
                      </span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-slate-200 rounded-full">
                  <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${selected.progress}%` }} />
                </div>
              </div>

              {/* Horizontal step track */}
              <div className="px-5 py-5 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
                <div className="flex items-start gap-0 min-w-max" dir="ltr">
                  {selected.steps?.map((step, idx) => {
                    const st = STEP_STATUS[step.status] || STEP_STATUS.pending
                    const icon = STEP_ICON[step.status]
                    const isLast = idx === selected.steps.length - 1
                    const isSelected = activeStep?.id === step.id

                    return (
                      <div key={step.id} className="flex items-start">
                        {/* Step node */}
                        <button
                          onClick={() => setActiveStep(isSelected ? null : step)}
                          className="flex flex-col items-center gap-1.5 group"
                          style={{ width: 80 }}
                        >
                          <div className={`
                            w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold
                            transition-all shadow-sm
                            ${st.circle}
                            ${isSelected ? 'ring-2 ring-offset-2 ring-blue-400 scale-110' : 'group-hover:scale-105'}
                          `}>
                            {icon || (idx + 1)}
                          </div>
                          <div className={`text-xs text-center leading-tight max-w-[76px] ${st.label}`}>
                            {step.name}
                          </div>
                          {step.duration_days && step.status !== 'completed' && step.status !== 'skipped' && (
                            <div className="text-xs text-slate-400">~{step.duration_days}י׳</div>
                          )}
                        </button>

                        {/* Connector line */}
                        {!isLast && (
                          <div className="flex items-center" style={{ width: 32, marginTop: 19 }}>
                            <div className={`h-0.5 w-full rounded-full ${st.line}`} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Step detail panel */}
              <div className="flex-1 overflow-y-auto">
                {activeStep ? (
                  <div className="p-4">
                    <StepCard
                      key={activeStep.id}
                      step={activeStep}
                      instanceId={selected.id}
                      onUpdated={handleUpdated}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    לחץ על שלב לפרטים
                  </div>
                )}
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
