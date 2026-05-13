import React from 'react'

function StatCard({ label, value, color = 'slate', sub }) {
  const palette = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    slate: 'text-slate-600',
    emerald: 'text-emerald-600',
  }
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${palette[color] ?? palette.slate}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * StatsBar — שורת כרטיסי סיכום עליונים.
 *
 * props.stats = [{ label, value, color?, sub? }, ...]
 * להוספת סטטיסטיקה: הוסף איבר למערך stats ב-AdminDashboardPage.
 */
export default function StatsBar({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s, i) => (
        <StatCard key={i} {...s} />
      ))}
    </div>
  )
}
