import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import AppToast from '../../components/AppToast'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'

const CATEGORY_COLORS = {
  claim: 'bg-blue-100 text-blue-700', appeal: 'bg-amber-100 text-amber-700',
  treatment: 'bg-green-100 text-green-700', hospitalization: 'bg-purple-100 text-purple-700',
  general: 'bg-slate-100 text-slate-600',
}
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700', completed: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-500',
}

const EMPTY_STEP = {
  step_key: '', name: '', instructions: '', duration_days: '',
  is_optional: false, step_type: 'administrative', estimated_cost: '',
}
const EMPTY_TEMPLATE = {
  name: '', description: '', category: 'general', steps: [],
}

// ── Template Editor Modal ─────────────────────────────────────────────────────

function TemplateEditorModal({ template, onClose, onSaved }) {
  const { t } = useTranslation('workflows')
  const CATEGORY_LABELS = {
    claim: t('cat_claim'), appeal: t('cat_appeal'), treatment: t('cat_treatment'),
    hospitalization: t('cat_hospitalization'), general: t('cat_general'),
  }
  const [form, setForm] = useState(() => {
    if (template) {
      return {
        name: template.name,
        description: template.description || '',
        category: template.category || 'general',
        steps: template.steps.map(s => ({
          step_key: s.step_key || '',
          name: s.name,
          instructions: s.instructions || '',
          duration_days: s.duration_days ?? '',
          is_optional: s.is_optional || false,
          step_type: s.step_type || 'administrative',
          estimated_cost: s.estimated_cost ?? '',
          step_order: s.step_order,
        })),
      }
    }
    return { ...EMPTY_TEMPLATE, steps: [] }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const updateStep = (idx, field, value) => {
    setForm(f => {
      const steps = [...f.steps]
      steps[idx] = { ...steps[idx], [field]: value }
      return { ...f, steps }
    })
  }

  const addStep = () => {
    setForm(f => ({
      ...f,
      steps: [...f.steps, { ...EMPTY_STEP, step_order: f.steps.length + 1 }],
    }))
  }

  const removeStep = idx => {
    setForm(f => ({
      ...f,
      steps: f.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })),
    }))
  }

  const moveStep = (idx, dir) => {
    setForm(f => {
      const steps = [...f.steps]
      const target = idx + dir
      if (target < 0 || target >= steps.length) return f
      ;[steps[idx], steps[target]] = [steps[target], steps[idx]]
      return { ...f, steps: steps.map((s, i) => ({ ...s, step_order: i + 1 })) }
    })
  }

  const save = async () => {
    if (!form.name.trim()) { setError(t('name_required')); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        steps: form.steps.map((s, i) => ({
          step_key: s.step_key.trim() || `step_${i + 1}`,
          name: s.name.trim(),
          instructions: s.instructions.trim() || null,
          duration_days: s.duration_days !== '' ? Number(s.duration_days) : null,
          is_optional: s.is_optional,
          step_type: s.step_type,
          estimated_cost: s.estimated_cost !== '' ? Number(s.estimated_cost) : null,
          step_order: i + 1,
        })),
      }
      if (template) {
        await axios.put(`/api/workflows/templates/${template.id}`, payload)
      } else {
        await axios.post('/api/workflows/templates', payload)
      }
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">
            {template ? `${t('edit_template')}${template.is_builtin ? ` — ${t('builtin_backup_note')}` : ''}` : t('new_template')}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-2xl leading-none p-2 -m-2 rounded-lg">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('template_name_label')}</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('category_label')}</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('description_label')}</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-700">{t('steps_label')} ({form.steps.length})</span>
              <button
                onClick={addStep}
                className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
              >
                + {t('add_step')}
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pl-1">
              {form.steps.map((step, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                      placeholder={t('step_name_placeholder')}
                      value={step.name}
                      onChange={e => updateStep(idx, 'name', e.target.value)}
                    />
                    <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      className="text-slate-600 hover:text-slate-800 disabled:opacity-30 px-1">↑</button>
                    <button onClick={() => moveStep(idx, 1)} disabled={idx === form.steps.length - 1}
                      className="text-slate-600 hover:text-slate-800 disabled:opacity-30 px-1">↓</button>
                    <button onClick={() => removeStep(idx)}
                      className="text-red-400 hover:text-red-600 px-1">✕</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                      placeholder={t('instructions_placeholder')}
                      value={step.instructions}
                      onChange={e => updateStep(idx, 'instructions', e.target.value)}
                    />
                    <input
                      type="number"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                      placeholder={t('days_placeholder')}
                      value={step.duration_days}
                      onChange={e => updateStep(idx, 'duration_days', e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={step.is_optional}
                        onChange={e => updateStep(idx, 'is_optional', e.target.checked)}
                      />
                      {t('common:optional', { ns: 'common' })}
                    </label>
                  </div>
                </div>
              ))}
              {form.steps.length === 0 && (
                <p className="text-slate-600 text-sm text-center py-4">{t('no_steps_hint')}</p>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-200 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm">
            {t('common:cancel', { ns: 'common' })}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-60"
          >
            {saving ? t('common:saving', { ns: 'common' }) : t('save_template')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kanban helpers ────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date(dateStr) - new Date()) / 86400000)
}

// ── StatsBar ──────────────────────────────────────────────────────────────────

function StatsBar({ instances }) {
  const active    = instances.filter(i => i.status === 'active').length
  const paused    = instances.filter(i => i.status === 'paused').length
  const overdue   = instances.filter(i => i.due_date && daysUntil(i.due_date) < 0).length
  const completed = instances.filter(i => i.status === 'completed').length

  const cards = [
    { label: 'פעילות',   value: active,    ring: 'ring-blue-200',  num: 'text-blue-700'  },
    { label: 'תקועות',   value: paused,    ring: 'ring-amber-200', num: 'text-amber-700' },
    { label: 'חרגו SLA', value: overdue,   ring: 'ring-red-200',   num: 'text-red-600'   },
    { label: 'הושלמו',   value: completed, ring: 'ring-green-200', num: 'text-green-700' },
  ]
  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className={`bg-white rounded-xl border border-slate-200 px-4 py-3 ring-1 ${c.ring}`}>
          <p className={`text-3xl font-bold ${c.num}`}>{c.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── KanbanCard ────────────────────────────────────────────────────────────────

function KanbanCard({ inst, onClick }) {
  const days = daysUntil(inst.due_date)
  const isOverdue = days !== null && days < 0
  const isDueSoon = days !== null && days >= 0 && days <= 7

  return (
    <button
      onClick={() => onClick(inst)}
      className="w-full text-start bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-semibold text-slate-800 text-sm leading-snug">{inst.patient_name || '—'}</p>
        {isOverdue && (
          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">חרג SLA</span>
        )}
        {!isOverdue && isDueSoon && (
          <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0">{days}י׳</span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2.5 truncate">{inst.template_name || '—'}</p>
      {inst.current_step && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 px-2 py-1.5 rounded-lg mb-2.5 truncate">
          {inst.current_step.name}
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all"
            style={{ width: `${inst.progress}%` }}
          />
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{inst.completed_steps}/{inst.total_steps}</span>
      </div>
    </button>
  )
}

// ── KanbanColumn ──────────────────────────────────────────────────────────────

function KanbanColumn({ title, badgeClass, bgClass, instances, emptyLabel, onCardClick }) {
  return (
    <div className="flex-1 min-w-[11rem]">
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>{instances.length}</span>
      </div>
      <div className={`${bgClass} rounded-xl p-2 min-h-48 space-y-2`}>
        {instances.length === 0 ? (
          <p className="text-center text-xs text-slate-400 pt-8">{emptyLabel}</p>
        ) : (
          instances.map(inst => <KanbanCard key={inst.id} inst={inst} onClick={onCardClick} />)
        )}
      </div>
    </div>
  )
}

// ── SLAPanel ──────────────────────────────────────────────────────────────────

function SLAPanel({ instances, onCardClick }) {
  const urgent = instances.filter(i => {
    if (i.status === 'completed' || i.status === 'cancelled') return false
    return (i.due_date && daysUntil(i.due_date) < 0) || i.status === 'paused'
  })
  if (urgent.length === 0) return null

  return (
    <div className="w-64 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <h3 className="font-semibold text-slate-700 text-sm">דורש תשומת לב</h3>
        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">{urgent.length}</span>
      </div>
      <div className="space-y-2">
        {urgent.map(inst => {
          const days = daysUntil(inst.due_date)
          const isOverdue = days !== null && days < 0
          return (
            <button
              key={inst.id}
              onClick={() => onCardClick(inst)}
              className="w-full text-start bg-white rounded-xl border border-red-200 p-3 hover:border-red-400 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-slate-800 truncate">{inst.patient_name}</p>
              <p className="text-xs text-slate-400 truncate mb-1.5">{inst.template_name}</p>
              {isOverdue && (
                <span className="text-xs text-red-600 font-medium">
                  חרג — {new Date(inst.due_date).toLocaleDateString('he-IL')}
                </span>
              )}
              {inst.status === 'paused' && !isOverdue && (
                <span className="text-xs text-amber-600 font-medium">מושהה</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── SlideOver ─────────────────────────────────────────────────────────────────

function SlideOver({ inst, onClose, onRefresh, showToast }) {
  const navigate = useNavigate()
  const [noteText, setNoteText]           = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError]                 = useState(null)
  const [showPauseInput, setShowPauseInput]   = useState(false)
  const [pauseReason, setPauseReason]         = useState('')
  const [showCancelInput, setShowCancelInput] = useState(false)
  const [cancelReason, setCancelReason]       = useState('')

  const currentStep = inst.current_step

  const doAction = async (actionFn, label, opts = {}) => {
    setActionLoading(label)
    setError(null)
    try {
      await actionFn()
      if (!opts.keepOpen) {
        onRefresh()
        onClose()
      } else {
        opts.onSuccess?.()
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בפעולה')
    } finally {
      setActionLoading(null)
    }
  }

  const advance = () => doAction(
    () => axios.post(`/api/workflows/instances/${inst.id}/steps/${currentStep.id}/advance`, { force: false }),
    'advance'
  )

  const skip = () => doAction(
    () => axios.post(`/api/workflows/instances/${inst.id}/steps/${currentStep.id}/skip`, { reason: '' }),
    'skip'
  )

  const pause = () => doAction(
    () => axios.post(`/api/workflows/instances/${inst.id}/pause`, { reason: pauseReason }),
    'pause'
  )

  const resume = () => doAction(
    () => axios.post(`/api/workflows/instances/${inst.id}/resume`),
    'resume'
  )

  const cancel = () => doAction(
    () => axios.post(`/api/workflows/instances/${inst.id}/cancel`, { reason: cancelReason }),
    'cancel'
  )

  const addNote = () => {
    if (!noteText.trim() || !currentStep) return
    doAction(
      () => axios.post(`/api/workflows/instances/${inst.id}/steps/${currentStep.id}/notes`, { text: noteText }),
      'note',
      { keepOpen: true, onSuccess: () => { setNoteText(''); showToast('ההערה נשמרה') } }
    )
  }

  const days = daysUntil(inst.due_date)
  const isOverdue = days !== null && days < 0

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute top-0 end-0 bottom-0 w-[26rem] bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-800 leading-snug truncate">
              {inst.title || inst.template_name}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{inst.patient_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[inst.status] || 'bg-slate-100 text-slate-500'}`}>
              {inst.status === 'active' ? 'בתהליך' : inst.status === 'paused' ? 'מושהה' : inst.status === 'completed' ? 'הושלם' : inst.status === 'cancelled' ? 'בוטל' : 'ממתין'}
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-500">התקדמות</span>
              <span className="font-semibold text-slate-800 tabular-nums">{inst.completed_steps}/{inst.total_steps} שלבים</span>
            </div>
            <div className="bg-slate-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${inst.progress}%` }} />
            </div>
            {isOverdue && (
              <p className="text-xs text-red-500 mt-1.5">
                תאריך יעד: {new Date(inst.due_date).toLocaleDateString('he-IL')} — חרג
              </p>
            )}
            {!isOverdue && inst.due_date && (
              <p className="text-xs text-slate-400 mt-1.5">
                תאריך יעד: {new Date(inst.due_date).toLocaleDateString('he-IL')}
              </p>
            )}
          </div>

          {/* Current step */}
          {currentStep && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-blue-500 font-medium mb-1">שלב נוכחי</p>
              <p className="font-semibold text-slate-800 text-sm">{currentStep.name}</p>
              {currentStep.instructions && (
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{currentStep.instructions}</p>
              )}
            </div>
          )}
          {!currentStep && inst.status === 'active' && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-sm text-slate-500">אין שלב פעיל כרגע</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">פעולות</p>

            {inst.status === 'active' && currentStep && !showPauseInput && !showCancelInput && (
              <div className="space-y-2">
                <button
                  onClick={advance}
                  disabled={!!actionLoading}
                  className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === 'advance' ? 'מעבד...' : 'קדם שלב ✓'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={skip}
                    disabled={!!actionLoading}
                    className="bg-slate-100 text-slate-700 rounded-xl py-2.5 text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'skip' ? '...' : 'דלג שלב'}
                  </button>
                  <button
                    onClick={() => setShowPauseInput(true)}
                    className="bg-amber-50 text-amber-700 rounded-xl py-2.5 text-sm hover:bg-amber-100 transition-colors"
                  >
                    השהה
                  </button>
                </div>
                <button
                  onClick={() => setShowCancelInput(true)}
                  className="w-full text-sm text-red-400 hover:text-red-600 py-1.5 transition-colors"
                >
                  בטל זרימה
                </button>
              </div>
            )}

            {inst.status === 'active' && !currentStep && !showCancelInput && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowCancelInput(true)}
                  className="w-full text-sm text-red-400 hover:text-red-600 py-1.5"
                >
                  בטל זרימה
                </button>
              </div>
            )}

            {showPauseInput && (
              <div className="space-y-2 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-sm font-medium text-amber-800">השהיית זרימה</p>
                <input
                  className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm"
                  placeholder="סיבה להשהיה (אופציונלי)"
                  value={pauseReason}
                  onChange={e => setPauseReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={pause}
                    disabled={!!actionLoading}
                    className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {actionLoading === 'pause' ? '...' : 'אשר השהיה'}
                  </button>
                  <button onClick={() => setShowPauseInput(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-lg py-2 text-sm">
                    ביטול
                  </button>
                </div>
              </div>
            )}

            {showCancelInput && (
              <div className="space-y-2 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-sm font-medium text-red-700">ביטול זרימת עבודה</p>
                <input
                  className="w-full border border-red-200 bg-white rounded-lg px-3 py-2 text-sm"
                  placeholder="סיבה לביטול (אופציונלי)"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={cancel}
                    disabled={!!actionLoading}
                    className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {actionLoading === 'cancel' ? '...' : 'אשר ביטול'}
                  </button>
                  <button onClick={() => setShowCancelInput(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-lg py-2 text-sm">
                    חזרה
                  </button>
                </div>
              </div>
            )}

            {inst.status === 'paused' && !showCancelInput && (
              <div className="space-y-2">
                <button
                  onClick={resume}
                  disabled={!!actionLoading}
                  className="w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading === 'resume' ? '...' : 'חדש זרימה'}
                </button>
                <button
                  onClick={() => setShowCancelInput(true)}
                  className="w-full text-sm text-red-400 hover:text-red-600 py-1.5"
                >
                  בטל זרימה
                </button>
              </div>
            )}

            {inst.status === 'completed' && (
              <div className="text-center py-3">
                <span className="text-sm text-green-600 font-medium">✓ זרימה הושלמה בהצלחה</span>
              </div>
            )}
            {inst.status === 'cancelled' && (
              <div className="text-center py-3">
                <span className="text-sm text-red-500">זרימה בוטלה</span>
              </div>
            )}
          </div>

          {/* Add note */}
          {currentStep && (inst.status === 'active' || inst.status === 'paused') && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">הוסף הערה לשלב</p>
              <textarea
                rows={2}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="כתוב הערה..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <button
                onClick={addNote}
                disabled={!noteText.trim() || !!actionLoading}
                className="mt-2 w-full bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl py-2 text-sm font-medium disabled:opacity-40 transition-colors"
              >
                {actionLoading === 'note' ? 'שומר...' : 'שמור הערה'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => navigate(`/manager/patients/${inst.patient_id}`)}
            className="w-full text-blue-600 hover:text-blue-700 text-sm font-medium py-2.5 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
          >
            עבור לדף המטופל ←
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { t } = useTranslation('workflows')
  const CATEGORY_LABELS = {
    claim: t('cat_claim'), appeal: t('cat_appeal'), treatment: t('cat_treatment'),
    hospitalization: t('cat_hospitalization'), general: t('cat_general'),
  }
  const STATUS_LABELS = {
    active: t('status_active'), completed: t('status_completed'),
    paused: t('status_paused'), cancelled: t('status_cancelled'), draft: t('status_cancelled'),
  }
  const { user } = useAuth()
  const isAdmin = user?.is_admin

  const [activeTab, setActiveTab]     = useState('templates')
  const [templates, setTemplates]     = useState([])
  const [instances, setInstances]     = useState([])
  const [selected, setSelected]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [editorOpen, setEditorOpen]   = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [selectedInst, setSelectedInst] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTemplate, setFilterTemplate] = useState('')
  const { toast, showToast, dismissToast } = useToast()
  const [confirm, ConfirmUI] = useConfirm()

  const loadTemplates = useCallback((signal) => {
    return axios.get('/api/workflows/templates', { signal }).then(r => {
      const visible = r.data.filter(t => !t.name.startsWith('[גיבוי]'))
      setTemplates(visible)
      setSelected(s => s ? visible.find(t => t.id === s.id) || visible[0] : visible[0])
    })
  }, [])

  const loadInstances = useCallback((signal) => {
    return axios.get('/api/workflows/instances', { signal }).then(r => setInstances(r.data))
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    Promise.all([loadTemplates(ctrl.signal), loadInstances(ctrl.signal)])
      .catch(e => { if (axios.isCancel(e)) return })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [loadTemplates, loadInstances])

  const openEditor = (tmpl = null) => { setEditTarget(tmpl); setEditorOpen(true) }
  const handleSaved = () => { setEditorOpen(false); loadTemplates() }

  const deleteTemplate = async (tmpl) => {
    const ok = await confirm({ title: t('delete_template'), message: `${t('delete_confirm_msg', { name: tmpl.name })}`, confirmLabel: t('common:delete', { ns: 'common' }), danger: true })
    if (!ok) return
    try {
      await axios.delete(`/api/workflows/templates/${tmpl.id}`)
      loadTemplates()
    } catch (e) {
      showToast(t('delete_error'))
    }
  }

  // Filter + split instances into kanban columns
  const filteredInstances = instances.filter(inst => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!inst.patient_name?.toLowerCase().includes(q) && !inst.template_name?.toLowerCase().includes(q)) return false
    }
    if (filterTemplate && inst.template_name !== filterTemplate) return false
    return true
  })
  const kanbanCols = {
    pending:   filteredInstances.filter(i => i.status === 'draft'),
    active:    filteredInstances.filter(i => i.status === 'active'),
    paused:    filteredInstances.filter(i => i.status === 'paused'),
    done:      filteredInstances.filter(i => i.status === 'completed' || i.status === 'cancelled'),
  }
  const templateNames = [...new Set(instances.map(i => i.template_name).filter(Boolean))]

  const handleInstRefresh = () => {
    loadInstances()
    setSelectedInst(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-600">{t('common:loading', { ns: 'common' })}</div>
  )

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('manage_desc')}</p>
        </div>
        {isAdmin && activeTab === 'templates' && (
          <button
            onClick={() => openEditor(null)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            + {t('new_template')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {[['templates', t('templates')], ['instances', t('instances')]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            <span className="mr-2 text-xs opacity-60">
              {key === 'templates' ? templates.length : instances.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <div className="flex gap-6">
          <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto max-h-[70vh]">
            {templates.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setSelected(tmpl)}
                className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                  selected?.id === tmpl.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[tmpl.category] || 'bg-slate-100 text-slate-500'}`}>
                    {CATEGORY_LABELS[tmpl.category] || tmpl.category}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{tmpl.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{tmpl.steps.length} {t('steps_count_label')}</div>
                  </div>
                </div>
                {tmpl.is_builtin && (
                  <div className="mt-2 text-xs text-slate-600">🔒 {t('builtin_label')}</div>
                )}
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 overflow-y-auto max-h-[70vh]">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
                    <span className={`text-sm px-3 py-0.5 rounded-full ${CATEGORY_COLORS[selected.category] || 'bg-slate-100 text-slate-500'}`}>
                      {CATEGORY_LABELS[selected.category] || selected.category}
                    </span>
                    {selected.is_builtin && <span className="text-xs text-slate-600">🔒 {t('builtin_label')}</span>}
                  </div>
                  {selected.description && <p className="text-slate-500 text-sm">{selected.description}</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEditor(selected)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      ✏️ {t('common:edit', { ns: 'common' })}
                    </button>
                    {!selected.is_builtin && (
                      <button
                        onClick={() => deleteTemplate(selected)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                      >
                        {t('common:delete', { ns: 'common' })}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute right-5 top-0 bottom-0 w-0.5 bg-slate-200" />
                <div className="space-y-4">
                  {selected.steps.map((step, idx) => (
                    <div key={step.id || idx} className="flex gap-4 relative">
                      <div className="flex-1" />
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm z-10 relative">
                        {idx + 1}
                      </div>
                      <div className="flex-[2] bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-slate-800">{step.name}</span>
                          {step.is_optional && (
                            <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">{t('common:optional', { ns: 'common' })}</span>
                          )}
                          {step.duration_days && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">~{step.duration_days} {t('days_label')}</span>
                          )}
                        </div>
                        {step.instructions && <p className="text-sm text-slate-500">{step.instructions}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Instances Tab — Kanban ── */}
      {activeTab === 'instances' && (
        <>
          <StatsBar instances={instances} />

          {/* Filter bar */}
          <div className="flex gap-3 mb-5">
            <input
              type="search"
              placeholder="חיפוש לפי מטופל או תבנית..."
              className="flex-1 border border-slate-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {templateNames.length > 1 && (
              <select
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
                value={filterTemplate}
                onChange={e => setFilterTemplate(e.target.value)}
              >
                <option value="">כל התבניות</option>
                {templateNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
          </div>

          {instances.length === 0 ? (
            <div className="text-center py-20 text-slate-500">{t('no_instances')}</div>
          ) : (
            <div className="flex gap-5 items-start">
              {/* Kanban board */}
              <div className="flex-1 min-w-0 flex gap-4 overflow-x-auto pb-2">
                <KanbanColumn
                  title="ממתין"
                  badgeClass="bg-slate-100 text-slate-600"
                  bgClass="bg-slate-50"
                  instances={kanbanCols.pending}
                  emptyLabel="אין זרימות ממתינות"
                  onCardClick={setSelectedInst}
                />
                <KanbanColumn
                  title="בתהליך"
                  badgeClass="bg-blue-100 text-blue-700"
                  bgClass="bg-blue-50/50"
                  instances={kanbanCols.active}
                  emptyLabel="אין זרימות פעילות"
                  onCardClick={setSelectedInst}
                />
                <KanbanColumn
                  title="מושהה"
                  badgeClass="bg-amber-100 text-amber-700"
                  bgClass="bg-amber-50/50"
                  instances={kanbanCols.paused}
                  emptyLabel="אין זרימות מושהות"
                  onCardClick={setSelectedInst}
                />
                <KanbanColumn
                  title="הושלם"
                  badgeClass="bg-green-100 text-green-700"
                  bgClass="bg-green-50/30"
                  instances={kanbanCols.done}
                  emptyLabel="אין זרימות שהושלמו"
                  onCardClick={setSelectedInst}
                />
              </div>

              {/* SLA urgent panel */}
              <SLAPanel instances={instances} onCardClick={setSelectedInst} />
            </div>
          )}
        </>
      )}

      {/* Slide-over */}
      {selectedInst && (
        <SlideOver
          inst={selectedInst}
          onClose={() => setSelectedInst(null)}
          onRefresh={handleInstRefresh}
          showToast={showToast}
        />
      )}

      {/* Template editor modal */}
      {editorOpen && (
        <TemplateEditorModal
          template={editTarget}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {ConfirmUI}
    </div>
  )
}
