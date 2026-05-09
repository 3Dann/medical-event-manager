import React from 'react'

/**
 * עטיפה אחידה לכל פאנל בדשבורד.
 * שימוש: <DashboardWidget title="..." badge={5} colSpan={2}> ... </DashboardWidget>
 *
 * להוספת פאנל חדש: צור קומפוננט, עטוף ב-DashboardWidget, הוסף ל-AdminDashboardPage.
 */
export default function DashboardWidget({ title, badge, children, action }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          {title}
          {badge != null && badge > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
