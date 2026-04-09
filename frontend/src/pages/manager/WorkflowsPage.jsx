import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const CATEGORY_LABELS = {
  claim: 'תביעה', appeal: 'ערר', treatment: 'טיפול',
  hospitalization: 'אשפוז', general: 'כללי',
}
const CATEGORY_COLORS = {
  claim: 'bg-blue-100 text-blue-700',
  appeal: 'bg-amber-100 text-amber-700',
  treatment: 'bg-green-100 text-green-700',
  hospitalization: 'bg-purple-100 text-purple-700',
  general: 'bg-slate-100 text-slate-600',
}
const STATUS_LABELS = {
  active: 'פעיל', completed: 'הושלם', paused: 'מושהה',
  cancelled: 'בוטל', draft: 'טיוטה',
}
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
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
    if (!form.name.trim()) { setError('שם תבנית הוא שדה חובה'); return }
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
            {template ? `עריכת תבנית${template.is_builtin ? ' — גיבוי נשמר אוטומטית' : ''}` : 'תבנית חדשה'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">שם תבנית *</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-700">שלבים ({form.steps.length})</span>
              <button
                onClick={addStep}
                className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
              >
                + הוסף שלב
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
                      placeholder="שם השלב *"
                      value={step.name}
                      onChange={e => updateStep(idx, 'name', e.target.value)}
                    />
                    <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 px-1">↑</button>
                    <button onClick={() => moveStep(idx, 1)} disabled={idx === form.steps.length - 1}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 px-1">↓</button>
                    <button onClick={() => removeStep(idx)}
                      className="text-red-400 hover:text-red-600 px-1">✕</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                      placeholder="הוראות"
                      value={step.instructions}
                      onChange={e => updateStep(idx, 'instructions', e.target.value)}
                    />
                    <input
                      type="number"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                      placeholder="ימים משוערים"
                      value={step.duration_days}
                      onChange={e => updateStep(idx, 'duration_days', e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={step.is_optional}
                        onChange={e => updateStep(idx, 'is_optional', e.target.checked)}
                      />
                      אופציונלי
                    </label>
                  </div>
                </div>
              ))}
              {form.steps.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-4">אין שלבים — לחץ "הוסף שלב" להתחלה</p>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-200 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm">
            ביטול
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'שומר...' : 'שמור תבנית'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin

  const [activeTab, setActiveTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [instances, setInstances] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = new template

  const loadTemplates = useCallback(() => {
    return axios.get('/api/workflows/templates').then(r => {
      const visible = r.data.filter(t => !t.name.startsWith('[גיבוי]'))
      setTemplates(visible)
      setSelected(s => s ? visible.find(t => t.id === s.id) || visible[0] : visible[0])
    })
  }, [])

  const loadInstances = useCallback(() => {
    return axios.get('/api/workflows/instances').then(r => setInstances(r.data))
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadTemplates(), loadInstances()]).finally(() => setLoading(false))
  }, [loadTemplates, loadInstances])

  const openEditor = (tmpl = null) => {
    setEditTarget(tmpl)
    setEditorOpen(true)
  }

  const handleSaved = () => {
    setEditorOpen(false)
    loadTemplates()
  }

  const deleteTemplate = async (tmpl) => {
    if (!window.confirm(`למחוק את התבנית "${tmpl.name}"?`)) return
    try {
      await axios.delete(`/api/workflows/templates/${tmpl.id}`)
      loadTemplates()
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה במחיקה')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">טוען...</div>
  )

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">זרימות עבודה</h1>
          <p className="text-slate-500 text-sm mt-1">תבניות וניהול הרצות</p>
        </div>
        {isAdmin && activeTab === 'templates' && (
          <button
            onClick={() => openEditor(null)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            + תבנית חדשה
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {[['templates', 'תבניות'], ['instances', 'הרצות']].map(([key, label]) => (
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

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto max-h-[70vh]">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                  selected?.id === t.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[t.category] || 'bg-slate-100 text-slate-500'}`}>
                    {CATEGORY_LABELS[t.category] || t.category}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.steps.length} שלבים</div>
                  </div>
                </div>
                {t.is_builtin && (
                  <div className="mt-2 text-xs text-slate-400">🔒 מובנית</div>
                )}
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 overflow-y-auto max-h-[70vh]">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
                    <span className={`text-sm px-3 py-0.5 rounded-full ${CATEGORY_COLORS[selected.category] || 'bg-slate-100 text-slate-500'}`}>
                      {CATEGORY_LABELS[selected.category] || selected.category}
                    </span>
                    {selected.is_builtin && <span className="text-xs text-slate-400">🔒 מובנית</span>}
                  </div>
                  {selected.description && <p className="text-slate-500 text-sm">{selected.description}</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEditor(selected)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      ✏️ עריכה
                    </button>
                    {!selected.is_builtin && (
                      <button
                        onClick={() => deleteTemplate(selected)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                      >
                        מחיקה
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Steps timeline */}
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
                            <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">אופציונלי</span>
                          )}
                          {step.duration_days && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">~{step.duration_days} ימים</span>
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

      {/* Instances Tab */}
      {activeTab === 'instances' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {instances.length === 0 ? (
            <div className="text-center py-16 text-slate-400">אין הרצות פעילות</div>
          ) : (
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-right">
                  <th className="px-5 py-3 font-semibold text-slate-600">מטופל</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">אבחנה</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">סטטוס</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">תבנית</th>
                  <th className="px-5 py-3 font-semibold text-slate-600">התקדמות</th>
                </tr>
              </thead>
              <tbody>
                {instances.map(inst => (
                  <tr key={inst.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{inst.patient_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 max-w-xs truncate">{inst.diagnosis || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[inst.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABELS[inst.status] || inst.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{inst.template_name || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${inst.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{inst.completed_steps}/{inst.total_steps}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <TemplateEditorModal
          template={editTarget}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
