import React, { useState } from 'react'
import axios from 'axios'
import AppToast from '../AppToast'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../ConfirmDialog'

const STATUS_STYLES = {
  pending:   { bg: 'bg-slate-50',   border: 'border-slate-200', badge: 'bg-slate-100 text-slate-500',  icon: '○', label: 'ממתין' },
  active:    { bg: 'bg-blue-50',    border: 'border-blue-300',  badge: 'bg-blue-100 text-blue-700',    icon: '●', label: 'פעיל'  },
  completed: { bg: 'bg-green-50',   border: 'border-green-300', badge: 'bg-green-100 text-green-700',  icon: '✓', label: 'הושלם' },
  skipped:   { bg: 'bg-slate-50',   border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600',  icon: '⇢', label: 'דולג'  },
}

// ── Step type badge ──────────────────────────────────────────────────────────
const STEP_TYPE_STYLES = {
  medical:        { cls: 'bg-blue-100 text-blue-700',    label: 'רפואי'  },
  financial:      { cls: 'bg-green-100 text-green-700',  label: 'כספי'   },
  administrative: { cls: 'bg-slate-100 text-slate-600',  label: 'מנהלי'  },
}

function StepTypeBadge({ stepType }) {
  if (!stepType) return null
  const style = STEP_TYPE_STYLES[stepType]
  if (!style) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.cls}`}>
      {style.label}
    </span>
  )
}

// ── SLA countdown badge ──────────────────────────────────────────────────────
function SlaBadge({ deadline, status }) {
  if (!deadline || status !== 'active') return null
  const now = new Date()
  const dl  = new Date(deadline)
  if (dl < now) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 animate-pulse">
        ⚠ חריגת SLA
      </span>
    )
  }
  const daysLeft = Math.ceil((dl - now) / (1000 * 60 * 60 * 24))
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
      SLA: {daysLeft} ימים
    </span>
  )
}

export default function StepCard({ step: initialStep, instanceId, onUpdated, gateBlocked = false }) {
  const [step, setStep] = useState(initialStep)
  const [expanded, setExpanded] = useState(initialStep.status === 'active')
  const [notes, setNotes] = useState(initialStep.notes || '')
  const [saving, setSaving] = useState(false)
  const { toast, showToast, dismissToast } = useToast()
  const [confirm, ConfirmUI] = useConfirm()
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showForceConfirm, setShowForceConfirm] = useState(false)
  const [togglingTask, setTogglingTask] = useState(null)

  // Keep step in sync when parent passes a new version
  React.useEffect(() => { setStep(initialStep) }, [initialStep])

  const st = STATUS_STYLES[step.status] || STATUS_STYLES.pending
  const tasks = step.tasks || []
  const completedCount = tasks.filter(t => t.is_completed).length
  const allTasksDone = tasks.length === 0 || completedCount === tasks.length
  const pendingCount = tasks.length - completedCount

  const handleAdvance = async (force = false) => {
    setSaving(true)
    setShowForceConfirm(false)
    try {
      const res = await axios.post(
        `/api/workflows/instances/${instanceId}/steps/${step.id}/advance`,
        { notes, force }
      )
      onUpdated(res.data)
    } catch (e) {
      showToast('לא ניתן להתקדם בשלב כרגע. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    setSaving(true)
    try {
      const res = await axios.post(`/api/workflows/instances/${instanceId}/steps/${step.id}/skip`, { reason: notes })
      onUpdated(res.data)
    } catch (e) {
      showToast('לא ניתן לדלג על השלב כרגע. נסה שוב.')
    } finally {
      setSaving(false)
      setShowSkipConfirm(false)
    }
  }

  const handleForceGate = async () => {
    const ok = await confirm({ title: 'עקיפת שער לוגיקה', message: 'האם לעקוף את שער הלוגיקה? פעולה זו תתועד.', confirmLabel: 'עקוף שער', danger: true })
    if (!ok) return
    setSaving(true)
    try {
      const res = await axios.post(`/api/workflows/instances/${instanceId}/steps/${step.id}/force-gate`)
      onUpdated(res.data)
    } catch (e) {
      showToast('לא ניתן לעקוף את השער כרגע. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTask = async (taskId) => {
    setTogglingTask(taskId)
    try {
      const res = await axios.post(
        `/api/workflows/instances/${instanceId}/steps/${step.id}/tasks/${taskId}/toggle`
      )
      setStep(res.data)
    } catch (e) {
      showToast('לא ניתן לעדכן את המשימה. נסה שוב.')
    } finally {
      setTogglingTask(null)
    }
  }

  const handleDeleteTask = async (taskId) => {
    try {
      await axios.delete(`/api/workflows/instances/${instanceId}/steps/${step.id}/tasks/${taskId}`)
    } catch (e) {
      showToast('לא ניתן למחוק את המשימה.')
      return
    }
    try {
      const res = await axios.get(`/api/workflows/instances/${instanceId}`)
      onUpdated(res.data)
    } catch (e) {
      showToast('המשימה נמחקה, אך לא ניתן לרענן את הנתונים.')
    }
  }

  const formatDate = d => d ? new Date(d).toLocaleDateString('he-IL') : null

  return (
    <>
    <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
    {ConfirmUI}
    <div className={`border-2 rounded-xl transition-all ${st.border} ${st.bg}`}>
      <button
        className="w-full flex items-center gap-3 p-3 text-right"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`text-lg font-bold w-6 text-center ${step.status === 'completed' ? 'text-green-600' : step.status === 'active' ? 'text-blue-600' : 'text-slate-500'}`}>
          {st.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 text-sm">{step.name}</span>
            <StepTypeBadge stepType={step.step_type} />
            <SlaBadge deadline={step.sla_deadline} status={step.status} />
            {step.is_optional && (
              <span className="text-xs text-slate-600">(אופציונלי)</span>
            )}
            {tasks.length > 0 && step.status !== 'completed' && step.status !== 'skipped' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${allTasksDone ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                {completedCount}/{tasks.length} משימות
              </span>
            )}
          </div>
          {step.due_date && step.status !== 'completed' && step.status !== 'skipped' && (
            <div className={`text-xs mt-0.5 ${new Date(step.due_date) < new Date() ? 'text-red-500' : 'text-slate-500'}`}>
              דדליין: {formatDate(step.due_date)}
              {new Date(step.due_date) < new Date() && ' ⚠️'}
            </div>
          )}
          {step.status === 'completed' && step.completed_at && (
            <div className="text-xs text-green-600 mt-0.5">הושלם {formatDate(step.completed_at)}</div>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
        <span className="text-slate-600 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-current border-opacity-10">
          {step.instructions && (
            <div className="bg-white/70 rounded-lg p-3 text-sm text-slate-600 mt-3">
              <div className="font-medium text-slate-700 mb-1 text-xs">הנחיות:</div>
              {step.instructions}
            </div>
          )}

          {/* Force-gate button — shown only when active and gate is blocking */}
          {step.status === 'active' && step.gate && step.gate.fulfilled === false && (
            <div className="flex items-center gap-2 mt-2">
              {step.gate.error_msg && (
                <span className="text-xs text-amber-700 flex-1">{step.gate.error_msg}</span>
              )}
              <button
                onClick={handleForceGate}
                disabled={saving}
                className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-200 disabled:opacity-40 font-medium whitespace-nowrap"
              >
                בטל שער ▸
              </button>
            </div>
          )}

          {/* Task checklist */}
          {(tasks.length > 0 || step.status === 'active') && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">
                  צ׳קליסט
                  {tasks.length > 0 && (
                    <span className="mr-1 text-slate-400">({completedCount}/{tasks.length})</span>
                  )}
                </span>
                {step.status === 'active' && (
                  <AddTaskInline
                    instanceId={instanceId}
                    stepId={step.id}
                    onAdded={onUpdated}
                  />
                )}
              </div>
              {tasks.length > 0 && (
                <div className="space-y-1.5">
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                      ${task.is_completed ? 'bg-green-50/70' : 'bg-white/50'}
                    `}>
                      <button
                        onClick={() => step.status === 'active' && handleToggleTask(task.id)}
                        disabled={step.status !== 'active' || togglingTask === task.id}
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold transition-colors
                          ${task.is_completed
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-300 bg-white hover:border-green-400'
                          }
                        `}
                      >
                        {task.is_completed ? '✓' : ''}
                      </button>
                      <span className={`flex-1 text-right ${task.is_completed ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                        {task.title}
                      </span>
                      {step.status === 'active' && !task.is_completed && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-slate-300 hover:text-red-400 text-xs px-1 flex-shrink-0 transition-colors"
                          title="מחק משימה"
                        >✕</button>
                      )}
                      {togglingTask === task.id && (
                        <span className="text-xs text-slate-400">...</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tasks.length === 0 && step.status === 'active' && (
                <p className="text-xs text-slate-400 text-center py-1">אין משימות — הוסף למעלה</p>
              )}
            </div>
          )}

          {/* Action log */}
          {step.actions?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">היסטוריה:</div>
              {step.actions.slice(-3).map(a => (
                <div key={a.id} className="text-xs text-slate-500 flex gap-2">
                  <span className="text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleDateString('he-IL') : ''}</span>
                  <span>{a.description || a.action_type}</span>
                </div>
              ))}
            </div>
          )}

          {step.status === 'active' && (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="הערות (אופציונלי)..."
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right resize-none bg-white"
              />

              {/* Force confirm banner */}
              {showForceConfirm && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-right">
                  <div className="font-medium text-amber-800 mb-1">אילוץ מעבר שלב</div>
                  <div className="text-amber-700 text-xs mb-2">
                    {pendingCount} משימות לא הושלמו. המעבר יירשם בלוג.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdvance(true)}
                      disabled={saving}
                      className="flex-1 bg-amber-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
                    >
                      {saving ? 'שומר...' : 'אלץ מעבר'}
                    </button>
                    <button
                      onClick={() => setShowForceConfirm(false)}
                      className="px-3 py-1.5 text-slate-500 hover:bg-white rounded-lg text-sm border border-slate-200"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}

              {!showForceConfirm && (
                <div className="flex gap-2">
                  <button
                    onClick={() => allTasksDone ? handleAdvance(false) : setShowForceConfirm(true)}
                    disabled={saving || gateBlocked}
                    title={gateBlocked ? (step.gate?.error_msg || 'שלב נעול — יש להשלים תנאי שער לפני ההתקדמות') : undefined}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors
                      ${gateBlocked
                        ? 'bg-amber-100 text-amber-700 cursor-not-allowed'
                        : allTasksDone
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }
                    `}
                  >
                    {saving ? 'שומר...' : gateBlocked ? '🔒 שלב נעול' : allTasksDone ? '✓ השלם שלב' : `השלם שלב (${pendingCount} משימות פתוחות)`}
                  </button>
                  {step.is_optional && !showSkipConfirm && (
                    <button
                      onClick={() => setShowSkipConfirm(true)}
                      className="px-3 py-2 text-slate-500 hover:bg-white rounded-lg text-sm border border-slate-200"
                    >
                      דלג
                    </button>
                  )}
                  {showSkipConfirm && (
                    <button
                      onClick={handleSkip}
                      disabled={saving}
                      className="px-3 py-2 text-orange-600 hover:bg-orange-50 rounded-lg text-sm border border-orange-200"
                    >
                      אשר דילוג
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {step.status === 'completed' && step.notes && (
            <div className="text-sm text-slate-600 bg-white/70 rounded-lg p-2">
              <span className="text-xs text-slate-600">הערה: </span>{step.notes}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}

// ── AddTaskInline — small inline form to add a checklist item ────────────────
function AddTaskInline({ instanceId, stepId, onAdded }) {
  const [open, setOpen]   = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await axios.post(
        `/api/workflows/instances/${instanceId}/steps/${stepId}/tasks`,
        { title: title.trim() }
      )
      setTitle('')
      setOpen(false)
      onAdded()
    } catch {
      // ignore — parent will refresh
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
    >
      + הוסף משימה
    </button>
  )

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5" dir="rtl">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="שם המשימה..."
        className="text-xs border border-slate-300 rounded px-2 py-1 w-36 focus:outline-none focus:border-blue-400"
        maxLength={120}
      />
      <button type="submit" disabled={saving || !title.trim()}
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-40">
        {saving ? '...' : '✓'}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="text-xs text-slate-400 hover:text-slate-600 px-1">
        ✕
      </button>
    </form>
  )
}
