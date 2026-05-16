import React, { useState, useEffect } from 'react'
import axios from 'axios'

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-slate-800">{value}</span>
        {sub && <span className="text-xs text-slate-400 mr-1">{sub}</span>}
      </div>
    </div>
  )
}

export default function SystemStatsPanel() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/admin/system-stats', { signal: ctrl.signal })
      .then(r => setStats(r.data))
      .catch(e => { if (!axios.isCancel(e)) setError('לא ניתן לטעון נתוני מערכת') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  if (loading) return <div className="py-6 text-center text-slate-400 text-sm">טוען...</div>
  if (error)   return <div className="py-6 text-center text-red-500 text-sm">{error}</div>

  const { users_by_role = {}, total_patients, total_documents, total_claims,
          active_sessions, active_users_24h, db_size_mb, last_backup } = stats

  const backupDisplay = last_backup
    ? last_backup.replace(/medical_event_manager_backup_/, '').replace(/\.db\.gz$/, '').replace(/_/g, ' ')
    : 'אין גיבוי שמור'

  return (
    <div className="space-y-4">

      {/* Users by role */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">משתמשים</p>
        <div className="grid grid-cols-2 gap-x-4">
          <StatRow label="מנהלי אירוע"  value={users_by_role.manager ?? 0} />
          <StatRow label="ברוקרים"       value={users_by_role.broker ?? 0} />
          <StatRow label="מטופלים"       value={users_by_role.patient ?? 0} />
          <StatRow label="מנהלי מערכת"   value={users_by_role.admin ?? 0} />
        </div>
      </div>

      {/* Data */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">נתונים</p>
        <StatRow label="תיקי מטופלים"  value={total_patients} />
        <StatRow label="מסמכים שמורים" value={total_documents} />
        <StatRow label="תביעות"         value={total_claims} />
      </div>

      {/* System */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">מערכת</p>
        <StatRow label="Sessions פעילים"     value={active_sessions} />
        <StatRow label="משתמשים פעילים 24ש" value={active_users_24h} />
        <StatRow
          label="גודל מסד נתונים"
          value={db_size_mb > 0 ? `${db_size_mb} MB` : '—'}
        />
        <StatRow label="גיבוי אחרון" value={backupDisplay} />
      </div>

    </div>
  )
}
