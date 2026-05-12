import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { fmtDateShort as fmtDate } from '../../../utils/formatters'

const SOURCE_LABELS = {
  manual:          'ידנית',
  meeting_action:  'פגישה',
  workflow_step:   'זרימה',
  patient_request: 'פנייה',
  red_flag:        'נורה🔴',
}

export default function OverdueTasksPanel() {
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/admin/tasks?overdue_only=true&status=pending', { signal: ctrl.signal })
      .then(r => setTasks(r.data))
      .catch(e => { if (axios.isCancel(e)) return })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  if (loading) return <div className="py-6 text-center text-slate-600 text-sm">טוען...</div>

  if (tasks.length === 0) return (
    <div className="py-6 text-center">
      <p className="text-slate-500 text-sm">אין משימות באיחור ✅</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {tasks.slice(0, 10).map(t => (
        <div
          key={t.id}
          onClick={() => navigate('/manager/my-day')}
          className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl cursor-pointer hover:bg-red-100 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {t.assigned_name && (
                <span className="text-xs text-slate-600">{t.assigned_name}</span>
              )}
              {t.patient_name && (
                <span className="text-xs text-blue-600">{t.patient_name}</span>
              )}
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {SOURCE_LABELS[t.source_type] || t.source_type}
              </span>
            </div>
          </div>
          {t.due_date && (
            <span className="text-xs text-red-600 font-semibold flex-shrink-0 mt-0.5">
              {fmtDate(t.due_date)}
            </span>
          )}
        </div>
      ))}
      {tasks.length > 10 && (
        <p className="text-xs text-slate-500 text-center pt-1">
          ועוד {tasks.length - 10} משימות נוספות
        </p>
      )}
    </div>
  )
}
