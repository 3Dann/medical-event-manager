import { useState, useEffect } from 'react'
import axios from 'axios'

const STATUS_LABELS = { active: 'פעיל', completed: 'הושלם', paused: 'מושהה', cancelled: 'בוטל' }
const STATUS_COLORS = {
  active:    'bg-blue-500',
  completed: 'bg-emerald-500',
  paused:    'bg-amber-400',
  cancelled: 'bg-slate-300',
}

export default function AnalyticsFunnelPanel() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/analytics/workflow-funnel', { signal: ctrl.signal })
      .then(r => { setData(r.data); setError(null) })
      .catch(e => { if (!axios.isCancel(e)) setError('שגיאה בטעינת הנתונים') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  if (loading) return <div className="py-6 text-center text-slate-500 text-sm">טוען...</div>
  if (error)   return <div className="py-4 text-center text-red-500 text-sm">{error}</div>
  if (!data)   return null

  const { summary, templates } = data
  const byStatus = summary?.by_status || {}
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const statusOrder = ['active', 'completed', 'paused', 'cancelled']

  return (
    <div className="space-y-4">
      {/* שורת סיכום */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{summary?.total_patients_in_workflow ?? 0}</p>
          <p className="text-xs text-blue-600 mt-0.5">מטופלים בזרימה פעילה</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">{total}</p>
          <p className="text-xs text-slate-500 mt-0.5">סה״כ הרצות זרימה</p>
        </div>
      </div>

      {/* פסי סטטוס */}
      {total > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">התפלגות לפי סטטוס</p>
          <div className="flex rounded-lg overflow-hidden h-4">
            {statusOrder.map(s => {
              const cnt = byStatus[s] || 0
              if (!cnt) return null
              const pct = Math.round((cnt / total) * 100)
              return (
                <div key={s} title={`${STATUS_LABELS[s]}: ${cnt}`}
                  className={`${STATUS_COLORS[s]} transition-all`}
                  style={{ width: `${pct}%` }} />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {statusOrder.map(s => {
              const cnt = byStatus[s] || 0
              if (!cnt) return null
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s]}`} />
                  <span className="text-xs text-slate-600">{STATUS_LABELS[s]}: <strong>{cnt}</strong></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* תבניות נפוצות */}
      {templates?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">שימוש לפי תבנית</p>
          <div className="space-y-1.5">
            {templates.filter(t => t.total > 0).slice(0, 5).map(t => {
              const maxTotal = Math.max(...templates.map(x => x.total), 1)
              const pct = Math.round((t.total / maxTotal) * 100)
              return (
                <div key={t.template_id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-slate-700 truncate">{t.template_name}</span>
                      <span className="text-xs font-semibold text-slate-600 mr-2">{t.total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-center text-slate-500 text-sm py-4">אין הרצות זרימה עדיין</p>
      )}
    </div>
  )
}
