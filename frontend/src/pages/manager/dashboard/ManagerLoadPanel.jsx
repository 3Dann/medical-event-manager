import React from 'react'
import { useNavigate } from 'react-router-dom'

function LoadBar({ value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = pct >= 75 ? 'bg-red-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-5 text-left">{value}</span>
    </div>
  )
}

function Badge({ children, color }) {
  const palette = {
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${palette[color]}`}>
      {children}
    </span>
  )
}

/**
 * ManagerLoadPanel — עומס תיקים לפי מלווה.
 *
 * props.managers — מערך ממה שמחזיר /api/admin/dashboard
 * להוספת עמודה/מדד: הוסף שדה ב-backend ועיין כאן.
 */
export default function ManagerLoadPanel({ managers }) {
  const navigate = useNavigate()
  const maxPatients = Math.max(1, ...managers.map(m => m.patient_count))

  if (managers.length === 0)
    return <div className="card text-center py-10 text-slate-600 text-sm">אין מלווים במערכת</div>

  return (
    <div className="space-y-2">
      {managers.map(mgr => (
        <div key={mgr.id} className="card hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-bold text-sm">{mgr.full_name[0]}</span>
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{mgr.full_name}</p>
                <p className="text-xs text-slate-600">{mgr.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {mgr.critical_flags > 0 && <Badge color="red">{mgr.critical_flags} קריטי</Badge>}
              {mgr.warning_flags  > 0 && <Badge color="orange">{mgr.warning_flags} אזהרה</Badge>}
              {mgr.pending_requests > 0 && <Badge color="yellow">{mgr.pending_requests} פניות</Badge>}
              {mgr.pending_claims   > 0 && <Badge color="slate">{mgr.pending_claims} תביעות</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-12 text-right">תיקים</span>
            <LoadBar value={mgr.patient_count} max={maxPatients} />
          </div>
          {mgr.patient_count === 0 && (
            <p className="text-xs text-slate-600 mt-2 text-center">אין תיקים פעילים</p>
          )}
        </div>
      ))}
    </div>
  )
}
