import React from 'react'
import { useDashboard } from './dashboard/useDashboard'
import DashboardWidget from './dashboard/DashboardWidget'
import StatsBar from './dashboard/StatsBar'
import ManagerLoadPanel from './dashboard/ManagerLoadPanel'
import AlertsPanel from './dashboard/AlertsPanel'
import OverdueTasksPanel from './dashboard/OverdueTasksPanel'

/**
 * AdminDashboardPage — הדשבורד הניהולי.
 *
 * ─── הוספת פאנל חדש ───────────────────────────────────────────────
 * 1. צור קובץ חדש ב- dashboard/<PanelName>.jsx
 * 2. ייצא ממנו default component שמקבל את ה-data הרלוונטי
 * 3. אם צריך נתון חדש מה-backend — הוסף ל- /api/admin/dashboard
 * 4. ייבא כאן ושלב ב-grid למטה
 * ─────────────────────────────────────────────────────────────────────
 */
export default function AdminDashboardPage() {
  const { data, loading, error, refresh } = useDashboard()

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-600">טוען...</div>
  )
  if (error) return (
    <div className="p-8 text-center text-red-500">{error}</div>
  )

  const { totals, managers, alerts } = data

  // ── סטטיסטיקות עליונות ─────────────────────────────────────────────
  // להוספת כרטיס: הוסף איבר למערך
  const stats = [
    { label: 'מלווים פעילים',  value: totals.managers,          color: 'blue'   },
    { label: 'מטופלים סה״כ',   value: totals.patients,          color: 'slate'  },
    { label: 'נורות קריטיות',  value: totals.critical_flags,    color: totals.critical_flags   > 0 ? 'red'    : 'slate' },
    { label: 'פניות ממתינות',  value: totals.pending_requests,  color: totals.pending_requests > 0 ? 'yellow' : 'slate' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">דשבורד ניהולי</h1>
          <p className="text-slate-500 mt-1 text-sm">סקירת עומס מלווים, התראות אסקלציה ופניות ממתינות</p>
        </div>
        <button onClick={refresh} className="btn-secondary text-sm">רענן</button>
      </div>

      {/* שורת סטטיסטיקות */}
      <StatsBar stats={stats} />

      {/* גריד פאנלים — הוסף/הזז כאן */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        <div className="lg:col-span-3">
          <DashboardWidget title="עומס לפי מלווה">
            <ManagerLoadPanel managers={managers} />
          </DashboardWidget>
        </div>

        <div className="lg:col-span-2">
          <DashboardWidget title="התראות אסקלציה" badge={alerts.length}>
            <AlertsPanel alerts={alerts} />
          </DashboardWidget>
        </div>

        <div className="lg:col-span-5">
          <DashboardWidget title="משימות באיחור">
            <OverdueTasksPanel />
          </DashboardWidget>
        </div>

      </div>
    </div>
  )
}
