import React, { useState } from 'react'
import axios from 'axios'

const STATUS_STYLES = {
  pending:   { bg: 'bg-slate-50',   border: 'border-slate-200', badge: 'bg-slate-100 text-slate-500',  icon: '○', label: 'ממתין' },
  active:    { bg: 'bg-blue-50',    border: 'border-blue-300',  badge: 'bg-blue-100 text-blue-700',    icon: '●', label: 'פעיל'  },
  completed: { bg: 'bg-green-50',   border: 'border-green-300', badge: 'bg-green-100 text-green-700',  icon: '✓', label: 'הושלם' },
  skipped:   { bg: 'bg-slate-50',   border: 'border-slate-200', badge: 'bg-slate-100 text-slate-400',  icon: '⇢', label: 'דולג'  },
}

export default function StepCard({ step, instanceId, onUpdated }) {
  const [expanded, setExpanded] = useState(step.status === 'active')
  const [notes, setNotes] = useState(step.notes || '')
  const [saving, setSaving] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)

  const st = STATUS_STYLES[step.status] || STATUS_STYLES.pending

  const handleAdvance = async () => {
    setSaving(true)
    try {
      const res = await axios.post(`/api/workflows/instances/${instanceId}/steps/${step.id}/advance`, { notes })
      onUpdated(res.data)
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה')
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
      alert(e.response?.data?.detail || 'שגיאה')
    } finally {
      setSaving(false)
      setShowSkipConfirm(false)
    }
  }

  const formatDate = d => d ? new Date(d).toLocaleDateString('he-IL') : null

  return (
    <div className={`border-2 rounded-xl transition-all ${st.border} ${st.bg}`}>
      <button
        className="w-full flex items-center gap-3 p-3 text-right"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`text-lg font-bold w-6 text-center ${step.status === 'completed' ? 'text-green-600' : step.status === 'active' ? 'text-blue-600' : 'text-slate-400'}`}>
          {st.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 text-sm">{step.name}</span>
            {step.is_optional && (
              <span className="text-xs text-slate-400">(אופציונלי)</span>
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
        <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-current border-opacity-10">
          {step.instructions && (
            <div className="bg-white/70 rounded-lg p-3 text-sm text-slate-600 mt-3">
              <div className="font-medium text-slate-700 mb-1 text-xs">הנחיות:</div>
              {step.instructions}
            </div>
          )}

          {/* Action log */}
          {step.actions?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">היסטוריה:</div>
              {step.actions.slice(-3).map(a => (
                <div key={a.id} className="text-xs text-slate-500 flex gap-2">
                  <span className="text-slate-300">{a.created_at ? new Date(a.created_at).toLocaleDateString('he-IL') : ''}</span>
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
              <div className="flex gap-2">
                <button
                  onClick={handleAdvance}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {saving ? 'שומר...' : '✓ השלם שלב'}
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
            </div>
          )}

          {step.status === 'completed' && step.notes && (
            <div className="text-sm text-slate-600 bg-white/70 rounded-lg p-2">
              <span className="text-xs text-slate-400">הערה: </span>{step.notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
