import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import StepCard from './StepCard'
import NewWorkflowModal from './NewWorkflowModal'
import AppToast from '../AppToast'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../ConfirmDialog'

const STATUS_LABELS = { active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל', paused: 'מושהה' }
const STATUS_COLORS = {
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  paused:    'bg-amber-100 text-amber-700',
}

const STEP_STATUS = {
  pending:   { circle: 'bg-slate-100 border-slate-300 text-slate-500', label: 'text-slate-500',              row: '' },
  active:    { circle: 'bg-blue-600  border-blue-600  text-white',     label: 'text-blue-700 font-semibold', row: 'bg-blue-50' },
  completed: { circle: 'bg-green-500 border-green-500 text-white',     label: 'text-green-700',              row: '' },
  skipped:   { circle: 'bg-slate-200 border-slate-300 text-slate-400', label: 'text-slate-400 line-through', row: '' },
}
const STEP_ICON = { completed: '✓', skipped: '⇢' }

// ── Helpers ────────────────────────────────────────────────────────────────

function groupSteps(steps) {
  if (!steps) return []
  const result = []
  const seen = new Set()
  for (const step of steps) {
    const g = step.parallel_group
    if (!g) {
      result.push({ type: 'solo', step })
    } else if (!seen.has(g)) {
      seen.add(g)
      result.push({ type: 'parallel', group: g, steps: steps.filter(s => s.parallel_group === g) })
    }
  }
  return result
}

function isOverdue(deadline) {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function GateBlockBadge({ gate }) {
  if (!gate || gate.fulfilled !== false) return null
  const msg = gate.error_msg || 'שלב זה נעול'
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1" title={msg}>
      <span>🔒</span>
      <span className="truncate max-w-[160px]">{msg}</span>
    </div>
  )
}

function SlaTag({ deadline, status }) {
  if (!deadline || status === 'completed' || status === 'skipped') return null
  if (isOverdue(deadline))
    return <span className="text-[10px] text-red-600 font-semibold">⚠ {fmtDate(deadline)}</span>
  return <span className="text-[10px] text-slate-400">⏱ {fmtDate(deadline)}</span>
}

// ── Vertical Step List Item ────────────────────────────────────────────────

function StepListItem({ step, globalIdx, isSelected, onClick, isParallel }) {
  const st = STEP_STATUS[step.status] || STEP_STATUS.pending
  const icon = STEP_ICON[step.status]
  const gateBlocked = step.gate?.fulfilled === false

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-right px-2 py-2 border-b border-slate-100',
        'flex items-start gap-2 transition-colors min-h-[44px]',
        isSelected
          ? 'bg-blue-50 border-r-2 border-r-blue-500'
          : `hover:bg-slate-50 ${st.row}`,
        isParallel ? 'pr-4' : '',
      ].join(' ')}
    >
      {/* Status circle */}
      <div className={[
        'flex-shrink-0 w-7 h-7 rounded-full border-2',
        'flex items-center justify-center text-xs font-bold mt-0.5',
        st.circle,
        isSelected ? 'ring-2 ring-offset-1 ring-blue-400' : '',
      ].join(' ')}>
        {gateBlocked ? '🔒' : (icon || (globalIdx + 1))}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1 text-right">
        <div className={`text-xs leading-tight ${st.label} ${isSelected ? 'font-semibold' : ''}`}>
          {step.name}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {isParallel && (
            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded">מקביל</span>
          )}
          <SlaTag deadline={step.sla_deadline} status={step.status} />
        </div>
      </div>
    </button>
  )
}

// ── VerticalStepList ───────────────────────────────────────────────────────

function VerticalStepList({ steps, activeStep, onSelect }) {
  const grouped = groupSteps(steps)
  let globalIdx = 0

  return (
    <div className="flex-1 overflow-y-auto" dir="rtl">
      {grouped.map((item) => {
        if (item.type === 'solo') {
          const idx = globalIdx++
          return (
            <StepListItem
              key={item.step.id}
              step={item.step}
              globalIdx={idx}
              isSelected={activeStep?.id === item.step.id}
              onClick={() => onSelect(item.step)}
              isParallel={false}
            />
          )
        }

        // Parallel group
        const groupStart = globalIdx
        globalIdx += item.steps.length
        const anyActive = item.steps.some(s => s.status === 'active')
        const allDone   = item.steps.every(s => s.status === 'completed' || s.status === 'skipped')

        return (
          <div key={`pg-${item.group}`}>
            {/* Group header */}
            <div className={[
              'px-2 py-1 border-b border-slate-100 flex items-center gap-1.5',
              allDone   ? 'bg-green-50' :
              anyActive ? 'bg-blue-50'  : 'bg-slate-50',
            ].join(' ')}>
              <span className={[
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                allDone   ? 'bg-green-100 text-green-700' :
                anyActive ? 'bg-blue-100 text-blue-700'   : 'bg-slate-100 text-slate-500',
              ].join(' ')}>
                שלבים מקבילים
              </span>
            </div>
            {/* Parallel steps */}
            {item.steps.map((step, pi) => (
              <StepListItem
                key={step.id}
                step={step}
                globalIdx={groupStart + pi}
                isSelected={activeStep?.id === step.id}
                onClick={() => onSelect(step)}
                isParallel={true}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function WorkflowPanel({ patientId }) {
  const [instances, setInstances]         = useState([])
  const [selected, setSelected]           = useState(null)
  const [activeStep, setActiveStep]       = useState(null)
  const [showNew, setShowNew]             = useState(false)
  const [loading, setLoading]             = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const { toast, showToast, dismissToast } = useToast()
  const [confirm, ConfirmUI]              = useConfirm()
  const hasSetInitial                     = useRef(false)

  useEffect(() => { hasSetInitial.current = false }, [patientId])

  const fetchInstances = useCallback(async (signal) => {
    try {
      const res = await axios.get(`/api/workflows/instances?patient_id=${patientId}`, { signal })
      setInstances(res.data)
      if (!hasSetInitial.current && res.data.length > 0) {
        const first = res.data.find(i => i.status === 'active') || res.data[0]
        setSelected(first)
        hasSetInitial.current = true
      }
    } catch (e) {
      if (axios.isCancel(e)) return
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    const controller = new AbortController()
    fetchInstances(controller.signal)
    return () => controller.abort()
  }, [fetchInstances])

  // Auto-expand active step when instance changes
  useEffect(() => {
    setDeleteConfirm(false)
    if (selected?.steps) {
      const act = selected.steps.find(s => s.status === 'active') || selected.steps[0]
      setActiveStep(act || null)
    } else {
      setActiveStep(null)
    }
  }, [selected])

  const handleUpdated = async (updatedInstance) => {
    const res = await axios.get(`/api/workflows/instances/${updatedInstance.id}`)
    const fresh = res.data
    setSelected(fresh)
    setInstances(prev => prev.map(i => i.id === fresh.id ? fresh : i))
    // Keep activeStep in sync with refreshed data
    if (activeStep) {
      const refreshed = fresh.steps?.find(s => s.id === activeStep.id)
      if (refreshed) setActiveStep(refreshed)
    }
  }

  const handleAction = async (action, instanceId) => {
    if (actionInProgress) return
    setActionInProgress(true)
    try {
      if (action === 'pause')
        await axios.post(`/api/workflows/instances/${instanceId}/pause`, { reason: '' })
      if (action === 'resume')
        await axios.post(`/api/workflows/instances/${instanceId}/resume`)
      if (action === 'cancel') {
        const ok = await confirm({ title: 'ביטול זרימה', message: 'לבטל את הזרימה?', confirmLabel: 'בטל זרימה', danger: true })
        if (!ok) { setActionInProgress(false); return }
        await axios.post(`/api/workflows/instances/${instanceId}/cancel`, { reason: '' })
      }
      if (action === 'delete') {
        const remaining = instances.filter(i => i.id !== instanceId)
        await axios.delete(`/api/workflows/instances/${instanceId}`)
        setInstances(remaining)
        setSelected(remaining[0] || null)
        setDeleteConfirm(false)
        return
      }
      const res = await axios.get(`/api/workflows/instances/${instanceId}`)
      setSelected(res.data)
      setInstances(prev => prev.map(i => i.id === res.data.id ? res.data : i))
    } catch {
      showToast('שגיאה בעדכון הזרימה. נסה שוב.')
    } finally {
      setActionInProgress(false)
    }
  }

  if (loading) return (
    <div className="p-6 text-center text-slate-600 text-sm">טוען זרימות...</div>
  )

  return (
    <div className="h-full flex flex-col" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />

      {/* Panel header */}
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + זרימה חדשה
        </button>
        <h3 className="font-semibold text-slate-800 text-sm">זרימות עבודה</h3>
      </div>

      {instances.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <div className="text-slate-600 font-medium mb-1">אין זרימות עבודה</div>
          <div className="text-slate-500 text-sm mb-4">הפעל זרימה לניהול תהליך מובנה</div>
          <button
            onClick={() => setShowNew(true)}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            הפעל זרימה ראשונה
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* ── Column 1: Instances ────────────────────────────────────── */}
          <div className="w-36 border-l border-slate-200 overflow-y-auto flex-shrink-0 bg-slate-50">
            {instances.map(inst => (
              <button
                key={inst.id}
                onClick={() => setSelected(inst)}
                className={[
                  'w-full text-right p-2.5 border-b border-slate-100 transition-colors',
                  selected?.id === inst.id
                    ? 'bg-white border-r-2 border-r-blue-500'
                    : 'hover:bg-white',
                ].join(' ')}
              >
                <div className="text-xs font-medium text-slate-700 leading-tight">{inst.title}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full mt-1 inline-block ${STATUS_COLORS[inst.status]}`}>
                  {STATUS_LABELS[inst.status]}
                </span>
                <div className="mt-1.5">
                  <div className="h-1 bg-slate-200 rounded-full">
                    <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${inst.progress}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{inst.progress}%</div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Column 2: Steps (vertical) + Instance header ──────────── */}
          {selected && (
            <div className="w-52 border-l border-slate-200 flex flex-col flex-shrink-0 bg-white overflow-hidden">
              {/* Instance header */}
              <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
                <div className="font-semibold text-slate-800 text-xs truncate text-right">{selected.title}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex gap-1 flex-wrap">
                    {selected.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleAction('pause', selected.id)}
                          disabled={actionInProgress}
                          className="text-[11px] px-1.5 py-0.5 text-amber-600 hover:bg-amber-50 rounded border border-amber-200 disabled:opacity-40 transition-colors"
                        >
                          השהה
                        </button>
                        <button
                          onClick={() => handleAction('cancel', selected.id)}
                          disabled={actionInProgress}
                          className="text-[11px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded border border-red-200 disabled:opacity-40 transition-colors"
                        >
                          בטל
                        </button>
                      </>
                    )}
                    {selected.status === 'paused' && (
                      <button
                        onClick={() => handleAction('resume', selected.id)}
                        disabled={actionInProgress}
                        className="text-[11px] px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 disabled:opacity-40 transition-colors"
                      >
                        חדש
                      </button>
                    )}
                    {!deleteConfirm ? (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="text-[11px] px-1.5 py-0.5 text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                      >
                        מחק
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                        <span className="text-[11px] text-red-700 font-medium">למחוק?</span>
                        <button
                          onClick={() => handleAction('delete', selected.id)}
                          className="text-[11px] bg-red-600 text-white px-1.5 py-0.5 rounded hover:bg-red-700"
                        >
                          כן
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 px-0.5"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                {/* Progress */}
                <div className="mt-1.5 h-1 bg-slate-200 rounded-full">
                  <div className="h-1 bg-blue-500 rounded-full transition-all" style={{ width: `${selected.progress}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 text-right">
                  {selected.completed_steps}/{selected.total_steps} שלבים · {selected.progress}%
                </div>
              </div>

              {/* Vertical step list */}
              {selected.steps?.length > 0
                ? <VerticalStepList
                    steps={selected.steps}
                    activeStep={activeStep}
                    onSelect={(step) => setActiveStep(activeStep?.id === step.id ? null : step)}
                  />
                : <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">אין שלבים</div>
              }
            </div>
          )}

          {/* ── Column 3: Step Detail ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-white">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">בחר זרימה</div>
            ) : !activeStep ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">בחר שלב לפרטים</div>
            ) : (
              <div className="p-4 space-y-3">
                <GateBlockBadge gate={activeStep.gate} />
                {isOverdue(activeStep.sla_deadline) && activeStep.status !== 'completed' && activeStep.status !== 'skipped' && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <span>⚠️</span>
                    <span>חריגת SLA — דדליין היה ב-{fmtDate(activeStep.sla_deadline)}</span>
                  </div>
                )}
                <StepCard
                  key={activeStep.id}
                  step={activeStep}
                  instanceId={selected.id}
                  onUpdated={handleUpdated}
                  gateBlocked={activeStep.gate?.fulfilled === false}
                />
              </div>
            )}
          </div>
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
      {ConfirmUI}
    </div>
  )
}
