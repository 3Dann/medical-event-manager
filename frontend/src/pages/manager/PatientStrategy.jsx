import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444']

const CATEGORY_LABELS = {
  second_opinion: 'חוות דעת', surgery: 'ניתוחים', transplant: 'השתלות',
  hospitalization: 'אישפוזים', rehabilitation: 'שיקום', advanced_tech: 'טכנולוגיות',
  critical_illness: 'מחלות קשות', diagnostics: 'בדיקות',
}

const STEP_TYPE_BADGE = {
  medical:        'bg-blue-100 text-blue-700',
  financial:      'bg-green-100 text-green-700',
  administrative: 'bg-slate-100 text-slate-600',
}
const STEP_TYPE_LABEL = { medical: 'רפואי', financial: 'פיננסי', administrative: 'מנהלתי' }

const STATUS_COLORS = {
  active:    'bg-blue-50 border-blue-200',
  completed: 'bg-green-50 border-green-200',
  paused:    'bg-amber-50 border-amber-200',
  cancelled: 'bg-red-50 border-red-200',
}

function ConfidenceBadge({ rate }) {
  if (rate === null || rate === undefined) return null
  if (rate >= 70) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ביטחון גבוה</span>
  if (rate >= 40) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">ביטחון בינוני</span>
  return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ביטחון נמוך</span>
}

// ── Coverage item card ─────────────────────────────────────────────────────────
function CoverageItem({ item, rank }) {
  const color = rank === 1 ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
  return (
    <div className={`border rounded-lg p-3 text-sm ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rank === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            {rank}
          </span>
          <span className="font-medium text-slate-800">{item.source_name}</span>
          {item.claim_suggested && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">מומלץ לתביעה</span>
          )}
        </div>
        {item.responsiveness_score && (
          <span className="text-xs text-slate-500">רספ׳ {item.responsiveness_score}/10</span>
        )}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{item.recommendation}</p>
      {item.gap_amount > 0 && (
        <p className="text-xs text-red-600 mt-1">פער: ₪{item.gap_amount?.toLocaleString()}</p>
      )}
    </div>
  )
}

// ── Workflow instance card ─────────────────────────────────────────────────────
function WorkflowCard({ instance, onRefresh }) {
  const [expanded, setExpanded] = useState(false)

  const current = instance.current_step
  const colorClass = STATUS_COLORS[instance.status] || 'bg-slate-50 border-slate-200'
  const statusLabel = { active: 'פעיל', completed: 'הושלם', paused: 'מושהה', cancelled: 'בוטל' }

  return (
    <div className={`border rounded-xl p-4 ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{instance.title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
              {statusLabel[instance.status] || instance.status}
            </span>
            {instance.specialty && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{instance.specialty}</span>
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${instance.progress}%` }} />
            </div>
            <span className="text-xs text-slate-500">{instance.progress}% ({instance.completed_steps}/{instance.total_steps})</span>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-600 hover:underline mr-3 flex-shrink-0">
          {expanded ? 'סגור' : 'פרט'}
        </button>
      </div>

      {/* Current step + coverage */}
      {current && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-slate-700">שלב נוכחי: {current.name}</span>
            {current.step_type && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${STEP_TYPE_BADGE[current.step_type] || ''}`}>
                {STEP_TYPE_LABEL[current.step_type]}
              </span>
            )}
            {current.estimated_cost > 0 && (
              <span className="text-xs text-slate-500 mr-auto">עלות משוערת: ₪{current.estimated_cost?.toLocaleString()}</span>
            )}
          </div>
          {current.instructions && (
            <p className="text-xs text-slate-500 mb-2">{current.instructions}</p>
          )}
          {/* Coverage recommendations */}
          {current.coverage?.items?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">המלצות כיסוי ביטוחי:</p>
              {current.coverage.items.slice(0, 3).map(item => (
                <CoverageItem key={`${item.source_name}-${item.coverage_category}`} item={item} rank={item.rank} />
              ))}
              {current.coverage.total_gap > 0 && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 border border-red-100">
                  ⚠️ פער כולל משוער: ₪{current.coverage.total_gap?.toLocaleString()}
                </div>
              )}
              {!current.coverage.has_coverage && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                  אין כיסוי ביטוחי מוגדר לצעד זה. בדוק הגדרת ביטוחים.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* All steps expanded */}
      {expanded && (
        <div className="mt-3 space-y-1.5">
          {instance.steps.map(step => {
            const done = step.status === 'completed' || step.status === 'skipped'
            const active = step.status === 'active'
            return (
              <div key={step.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                  ${active ? 'bg-blue-100' : done ? 'bg-green-50' : 'bg-slate-50'}`}>
                <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-xs
                  ${active ? 'bg-blue-500' : done ? 'bg-green-500' : 'bg-slate-300'}`}>
                  {done ? '✓' : active ? '●' : '○'}
                </span>
                <span className={done ? 'line-through text-slate-400' : active ? 'font-medium text-blue-700' : 'text-slate-600'}>
                  {step.name}
                </span>
                {step.step_type && (
                  <span className={`text-xs px-1.5 py-0.5 rounded mr-auto ${STEP_TYPE_BADGE[step.step_type] || ''}`}>
                    {STEP_TYPE_LABEL[step.step_type]}
                  </span>
                )}
                {step.estimated_cost > 0 && (
                  <span className="text-xs text-slate-400">₪{step.estimated_cost?.toLocaleString()}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Conflict resolution modal ──────────────────────────────────────────────────
function ConflictModal({ conflicts, onResolve, onClose }) {
  const [resolutions, setResolutions] = useState(
    Object.fromEntries(conflicts.map(c => [c.template_id, 'skip']))
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" dir="rtl">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-1">זרימות כפולות</h3>
          <p className="text-sm text-slate-500 mb-4">נמצאו זרימות פעילות מאותו סוג. בחר כיצד לטפל:</p>
          <div className="space-y-3">
            {conflicts.map(c => (
              <div key={c.template_id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <p className="font-medium text-slate-800 mb-1">{c.name}</p>
                <p className="text-xs text-slate-500 mb-2">
                  סטטוס קיים: {c.instance_status} | ציון התאמה: {c.score}
                </p>
                <div className="flex gap-2">
                  {[
                    { value: 'create_anyway', label: 'צור בכל זאת', color: 'border-blue-300 text-blue-700 bg-blue-50' },
                    { value: 'merge',         label: 'מזג לקיים',   color: 'border-green-300 text-green-700 bg-green-50' },
                    { value: 'skip',          label: 'דלג',          color: 'border-slate-300 text-slate-600 bg-white' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => setResolutions(r => ({ ...r, [c.template_id]: opt.value }))}
                      className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all
                        ${resolutions[c.template_id] === opt.value ? opt.color + ' ring-2 ring-offset-1' : 'border-slate-200 text-slate-500 bg-white'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => onResolve(resolutions)} className="btn-primary flex-1">אשר</button>
            <button onClick={onClose} className="btn-secondary flex-1">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function PatientStrategy() {
  const { id } = useParams()

  const [strategy,   setStrategy]   = useState(null)
  const [matrix,     setMatrix]     = useState(null)
  const [insights,   setInsights]   = useState(null)
  const [suggest,    setSuggest]    = useState(null)    // {auto_create, conflicts}
  const [instances,  setInstances]  = useState([])
  const [tab,        setTab]        = useState('workflows')
  const [loading,    setLoading]    = useState(true)
  const [applying,   setApplying]   = useState(false)
  const [conflict,   setConflict]   = useState(null)   // conflicts waiting for resolution

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, m, i, sg, inst] = await Promise.all([
        axios.get(`/api/patients/${id}/strategy`),
        axios.get(`/api/patients/${id}/strategy/matrix`),
        axios.get(`/api/learning/patients/${id}/insights`),
        axios.get(`/api/workflows/suggest?patient_id=${id}`).catch(() => null),
        axios.get(`/api/workflows/instances?patient_id=${id}`).catch(() => ({ data: [] })),
      ])
      setStrategy(s.data)
      setMatrix(m.data)
      setInsights(i.data)
      if (sg) setSuggest(sg.data)
      setInstances(inst.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleApplySuggestions = async (conflictResolutions = null) => {
    // If there are unresolved conflicts, show modal first
    if (!conflictResolutions && suggest?.conflicts?.length > 0) {
      setConflict(suggest.conflicts)
      return
    }
    setApplying(true)
    try {
      const payload = {
        patient_id: parseInt(id),
        auto_create_ids: suggest?.auto_create?.map(s => s.template_id) || [],
        conflict_resolutions: conflictResolutions
          ? Object.entries(conflictResolutions).map(([template_id, action]) => ({
              template_id: parseInt(template_id), action
            }))
          : [],
      }
      await axios.post('/api/workflows/suggest/apply', payload)
      setConflict(null)
      fetchAll()
    } catch (e) {
      alert('שגיאה ביצירת זרימות')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="p-8 text-slate-500">מחשב אסטרטגיה...</div>

  const activeInstances   = instances.filter(i => i.status === 'active')
  const pausedInstances   = instances.filter(i => i.status === 'paused')
  const finishedInstances = instances.filter(i => ['completed','cancelled'].includes(i.status))

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Conflict modal */}
      {conflict && (
        <ConflictModal
          conflicts={conflict}
          onResolve={handleApplySuggestions}
          onClose={() => setConflict(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">אסטרטגיה רפואית וביטוחית</h2>
        <button onClick={fetchAll} className="btn-secondary text-sm">רענן</button>
      </div>

      {/* Summary cards */}
      {strategy && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card bg-purple-50 border-purple-100 p-4">
            <p className="text-sm text-purple-600">זרימות פעילות</p>
            <p className="text-3xl font-bold text-purple-800 mt-1">{activeInstances.length}</p>
          </div>
          <div className="card bg-blue-50 border-blue-100 p-4">
            <p className="text-sm text-blue-600">מקורות ביטוח</p>
            <p className="text-3xl font-bold text-blue-800 mt-1">{strategy.summary?.total_sources || 0}</p>
          </div>
          <div className="card bg-green-50 border-green-100 p-4">
            <p className="text-sm text-green-600">קטגוריות מכוסות</p>
            <p className="text-3xl font-bold text-green-800 mt-1">{strategy.summary?.categories_covered || 0}</p>
          </div>
          <div className="card bg-red-50 border-red-100 p-4">
            <p className="text-sm text-red-600">פערי כיסוי</p>
            <p className="text-3xl font-bold text-red-800 mt-1">{strategy.summary?.gaps?.length || 0}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['workflows', '⚡ זרימות מנוע'],
          ['strategy',  'המלצות תביעות'],
          ['matrix',    'מטריצת כיסויים'],
          ['insights',  '🧠 תובנות'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── WORKFLOWS TAB ──────────────────────────────────────────────────── */}
      {tab === 'workflows' && (
        <div className="space-y-6">

          {/* Suggestions section */}
          {suggest && (suggest.auto_create?.length > 0 || suggest.conflicts?.length > 0) && (
            <div className="card border-blue-200 bg-blue-50/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">זרימות מומלצות למטופל</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    מנוע הזרימה זיהה {suggest.auto_create?.length || 0} זרימות מתאימות
                    {suggest.conflicts?.length > 0 && ` + ${suggest.conflicts.length} עם קונפליקט`}
                  </p>
                </div>
                <button
                  onClick={() => handleApplySuggestions()}
                  disabled={applying}
                  className="btn-primary text-sm py-1.5 disabled:opacity-50">
                  {applying ? 'יוצר...' : '⚡ הפעל זרימות'}
                </button>
              </div>

              {/* Auto-create list */}
              {suggest.auto_create?.map(s => (
                <div key={s.template_id}
                  className="flex items-start gap-3 p-3 bg-white rounded-lg border border-blue-100 mb-2">
                  <span className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {s.score}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800 text-sm">{s.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.reasons?.map((r, i) => (
                        <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{r}</span>
                      ))}
                    </div>
                  </div>
                  {s.specialty && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex-shrink-0">{s.specialty}</span>
                  )}
                </div>
              ))}

              {/* Conflicts list */}
              {suggest.conflicts?.length > 0 && (
                <div className="mt-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    ⚠️ {suggest.conflicts.length} זרימות כפולות — יש ללחוץ "הפעל זרימות" לבחירת פעולה
                  </p>
                  {suggest.conflicts.map(c => (
                    <p key={c.template_id} className="text-xs text-amber-700">• {c.name}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No suggestions */}
          {suggest && suggest.auto_create?.length === 0 && suggest.conflicts?.length === 0 && activeInstances.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-2xl mb-2">💡</p>
              <p className="text-slate-600 font-medium">אין הצעות זרימה כרגע</p>
              <p className="text-slate-400 text-sm mt-1">הגדר אבחנות ותגיות בטאב "פרטים וצמתים" כדי לקבל הצעות מותאמות</p>
            </div>
          )}

          {/* Active instances */}
          {activeInstances.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                זרימות פעילות ({activeInstances.length})
              </h3>
              <div className="space-y-3">
                {activeInstances.map(inst => (
                  <WorkflowCard key={inst.id} instance={inst} onRefresh={fetchAll} />
                ))}
              </div>
            </div>
          )}

          {/* Paused */}
          {pausedInstances.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                זרימות מושהות ({pausedInstances.length})
              </h3>
              <div className="space-y-3">
                {pausedInstances.map(inst => (
                  <WorkflowCard key={inst.id} instance={inst} onRefresh={fetchAll} />
                ))}
              </div>
            </div>
          )}

          {/* Finished */}
          {finishedInstances.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-2">
                <span>זרימות שהסתיימו ({finishedInstances.length})</span>
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="space-y-3 mt-3">
                {finishedInstances.map(inst => (
                  <WorkflowCard key={inst.id} instance={inst} onRefresh={fetchAll} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── STRATEGY TAB ───────────────────────────────────────────────────── */}
      {tab === 'strategy' && strategy && (
        <div className="space-y-4">
          {strategy.summary?.gaps?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="font-semibold text-red-700 mb-2">⚠️ פערים בכיסוי</p>
              <div className="flex flex-wrap gap-2">
                {strategy.summary.gaps.map(g => (
                  <span key={g} className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                    {CATEGORY_LABELS[g] || g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {strategy.recommendations.map((rec, ri) => (
            <div key={ri} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-sm">{ri + 1}</span>
                </div>
                <h3 className="font-semibold text-slate-800">{rec.category_label}</h3>
                <span className="badge-blue text-xs">{rec.total_sources} מקורות</span>
              </div>
              <div className="space-y-2">
                {rec.claim_sequence.map((step, si) => {
                  const confidence = insights?.patient_confidence?.[step.source_label] ??
                    insights?.company_approval_rates?.find(r => step.source_label?.includes(r.company_name))?.approval_rate ?? null
                  return (
                    <div key={si} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                        ${si === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {step.order}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-slate-800">{step.source_label}</p>
                          <ConfidenceBadge rate={confidence} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{step.reason}</p>
                      </div>
                      <div className="text-left text-xs text-slate-600">
                        {step.amount && <p>₪{step.amount.toLocaleString()}</p>}
                        {step.percentage && <p>{step.percentage}%</p>}
                        <p className="text-slate-400">ציון: {step.responsiveness_score}/10</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {strategy.recommendations.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-slate-500">אין מספיק נתוני ביטוח לייצור אסטרטגיה.</p>
              <p className="text-slate-400 text-sm mt-1">הוסף מקורות ביטוח וכיסויים בלשונית "ביטוחים".</p>
            </div>
          )}
        </div>
      )}

      {/* ── MATRIX TAB ─────────────────────────────────────────────────────── */}
      {tab === 'matrix' && matrix && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="p-3 text-right font-medium sticky right-0 bg-slate-800">קטגוריה</th>
                  {matrix.sources.map(s => (
                    <th key={s.id} className="p-3 text-center font-medium min-w-[130px]">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.matrix.map((row, ri) => (
                  <tr key={row.category} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 font-medium text-slate-800 sticky right-0 bg-inherit border-l">{row.category_label}</td>
                    {row.sources.map(s => (
                      <td key={s.source_id} className="p-3 text-center">
                        {s.is_covered ? (
                          <div>
                            <span className="text-green-500 text-lg">✓</span>
                            {s.percentage && <p className="text-xs text-slate-500">{s.percentage}%</p>}
                            {s.amount && <p className="text-xs text-slate-500">₪{s.amount?.toLocaleString()}</p>}
                            {s.copay && <p className="text-xs text-orange-500">השת"ע ₪{s.copay}</p>}
                            {s.abroad && <p className="text-xs text-blue-500">+חו"ל</p>}
                          </div>
                        ) : (
                          <span className="text-red-400 text-lg">✗</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matrix.sources.length === 0 && (
            <div className="text-center py-10 text-slate-400">אין מקורות ביטוח. הוסף ביטוחים כדי לראות את המטריצה.</div>
          )}
        </div>
      )}

      {/* ── INSIGHTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <div className="space-y-5">
          {insights && insights.company_approval_rates.length === 0 && insights.similar_gaps.length === 0 && (
            <div className="card text-center py-14">
              <p className="text-4xl mb-3">🧠</p>
              <p className="font-medium text-slate-700">המערכת עדיין לא אספה מספיק נתונים</p>
              <p className="text-sm text-slate-400 mt-1">ברגע שתביעות יאושרו או יידחו, יופיעו כאן תובנות</p>
            </div>
          )}
          {insights?.similar_gaps?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">👥</span>
                <h3 className="font-semibold text-slate-800">פערים נפוצים במטופלים דומים</h3>
                <span className="text-xs text-slate-400">({insights.similar_patients_count} מטופלים עם אותה קופת חולים)</span>
              </div>
              <div className="space-y-2">
                {insights.similar_gaps.map(gap => (
                  <div key={gap.category} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{gap.category_label}</p>
                      <p className="text-xs text-slate-500">{gap.count} מתוך {insights.similar_patients_count} מטופלים חסרים כיסוי זה</p>
                    </div>
                    <div className="text-right">
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${gap.pct}%` }} />
                      </div>
                      <p className="text-xs text-amber-700 mt-1">{gap.pct}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {insights?.company_approval_rates?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📊</span>
                <h3 className="font-semibold text-slate-800">שיעורי אישור לפי מקור ביטוח</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={insights.company_approval_rates} layout="vertical" margin={{ right: 40, left: 10 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="company_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v}%`, 'שיעור אישור']} />
                  <Bar dataKey="approval_rate" radius={[0, 4, 4, 0]}>
                    {insights.company_approval_rates.map((entry, i) => (
                      <Cell key={i} fill={entry.approval_rate >= 70 ? '#22c55e' : entry.approval_rate >= 40 ? '#f59e0b' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
