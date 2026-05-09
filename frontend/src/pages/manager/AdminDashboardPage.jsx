import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const FLAG_TYPE_LABELS = {
  medical: 'רפואי',
  financial: 'פיננסי',
  caregiver: 'שחיקת מטפל',
}

const CATEGORY_LABELS = {
  general: 'כללי',
  document: 'מסמך',
  meeting: 'פגישה',
  question: 'שאלה',
  financial: 'פיננסי',
}

function StatCard({ label, value, color = 'blue', sub }) {
  const colors = {
    blue: 'text-blue-600 bg-blue-50',
    red: 'text-red-600 bg-red-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    slate: 'text-slate-600 bg-slate-50',
  }
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color].split(' ')[0]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function LoadBar({ value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = pct >= 75 ? 'bg-red-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-6 text-left">{value}</span>
    </div>
  )
}

function AlertItem({ alert, onNavigate }) {
  const isCritical = alert.severity === 'critical'
  return (
    <button
      onClick={() => onNavigate(alert.patient_id)}
      className={`w-full text-right p-3 rounded-xl border transition-colors hover:shadow-sm
        ${isCritical
          ? 'bg-red-50 border-red-200 hover:bg-red-100'
          : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${isCritical ? 'text-red-800' : 'text-yellow-800'}`}>
            {alert.title}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{alert.description}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-slate-500">מטופל: <span className="font-medium text-slate-700">{alert.patient_name}</span></span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">מלווה: {alert.manager_name}</span>
            {alert.flag_type && (
              <>
                <span className="text-slate-300">·</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${isCritical ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {FLAG_TYPE_LABELS[alert.flag_type] || alert.flag_type}
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
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('/api/admin/dashboard')
      .then(r => setData(r.data))
      .catch(() => setError('שגיאה בטעינת הדשבורד'))
      .finally(() => setLoading(false))
  }, [])

  const maxPatients = data ? Math.max(1, ...data.managers.map(m => m.patient_count)) : 1

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">טוען...</div>
  )
  if (error) return (
    <div className="p-8 text-center text-red-500">{error}</div>
  )

  const { totals, managers, alerts } = data

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">

      {/* כותרת */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">דשבורד ניהולי</h1>
        <p className="text-slate-500 mt-1 text-sm">סקירת עומס מלווים, התראות אסקלציה ופניות ממתינות</p>
      </div>

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="מלווים פעילים" value={totals.managers} color="blue" />
        <StatCard label="מטופלים סה״כ" value={totals.patients} color="slate" />
        <StatCard
          label="נורות קריטיות"
          value={totals.critical_flags}
          color={totals.critical_flags > 0 ? 'red' : 'slate'}
        />
        <StatCard
          label="פניות ממתינות"
          value={totals.pending_requests}
          color={totals.pending_requests > 0 ? 'yellow' : 'slate'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* רשימת מלווים */}
        <div className="lg:col-span-3">
          <h2 className="font-semibold text-slate-700 mb-3">עומס לפי מלווה</h2>

          {managers.length === 0 ? (
            <div className="card text-center py-10 text-slate-400 text-sm">אין מלווים במערכת</div>
          ) : (
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
                        <p className="text-xs text-slate-400">{mgr.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {mgr.critical_flags > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          {mgr.critical_flags} קריטי
                        </span>
                      )}
                      {mgr.warning_flags > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                          {mgr.warning_flags} אזהרה
                        </span>
                      )}
                      {mgr.pending_requests > 0 && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                          {mgr.pending_requests} פניות
                        </span>
                      )}
                      {mgr.pending_claims > 0 && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          {mgr.pending_claims} תביעות
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-16 text-right">תיקים</span>
                      <LoadBar value={mgr.patient_count} max={maxPatients} />
                    </div>
                  </div>

                  {mgr.patient_count === 0 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">אין תיקים פעילים</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* פאנל התראות */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-slate-700 mb-3">
            התראות אסקלציה
            {alerts.length > 0 && (
              <span className="mr-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {alerts.length}
              </span>
            )}
          </h2>

          {alerts.length === 0 ? (
            <div className="card text-center py-10">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm font-medium">אין התראות פעילות</p>
              <p className="text-slate-400 text-xs mt-1">כל המטופלים תקינים</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <AlertItem
                  key={i}
                  alert={alert}
                  onNavigate={pid => navigate(`/manager/patients/${pid}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
