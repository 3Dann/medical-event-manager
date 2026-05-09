import React from 'react'
import { useNavigate } from 'react-router-dom'

const FLAG_TYPE_LABELS = {
  medical: 'רפואי',
  financial: 'פיננסי',
  caregiver: 'שחיקת מטפל',
}

/**
 * AlertsPanel — התראות אסקלציה (נורות קריטיות + פניות ממתינות).
 *
 * props.alerts — מערך ממה שמחזיר /api/admin/dashboard
 * כל alert: { type, severity, patient_id, patient_name, manager_name, title, description, flag_type? }
 *
 * להוספת סוג התראה חדש: הוסף type ב-backend ותמוך בו כאן.
 */
export default function AlertsPanel({ alerts }) {
  const navigate = useNavigate()

  if (alerts.length === 0)
    return (
      <div className="card text-center py-10">
        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm font-medium">אין התראות פעילות</p>
        <p className="text-slate-400 text-xs mt-1">כל המטופלים תקינים</p>
      </div>
    )

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const isCritical = alert.severity === 'critical'
        return (
          <button
            key={i}
            onClick={() => navigate(`/manager/patients/${alert.patient_id}`)}
            className={`w-full text-right p-3 rounded-xl border transition-colors hover:shadow-sm
              ${isCritical
                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${isCritical ? 'text-red-800' : 'text-yellow-800'}`}>
                  {alert.title}
                </p>
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{alert.description}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-slate-500">
                    מטופל: <span className="font-medium text-slate-700">{alert.patient_name}</span>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500">מלווה: {alert.manager_name}</span>
                  {alert.flag_type && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                        ${isCritical ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {FLAG_TYPE_LABELS[alert.flag_type] ?? alert.flag_type}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
          </button>
        )
      })}
    </div>
  )
}
