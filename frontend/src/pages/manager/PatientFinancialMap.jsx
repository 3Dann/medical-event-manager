import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const SEVERITY_COLORS = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info:    'bg-blue-50 border-blue-200 text-blue-700',
  missing: 'bg-red-50 border-red-200 text-red-700',
}

const fmt = (n) => n ? `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}` : '—'

export default function PatientFinancialMap() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('map') // map | priority | alerts

  useEffect(() => {
    setLoading(true)
    axios.get(`/api/patients/${id}/financial-map`)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(e => { setError(e.response?.data?.detail || 'שגיאה בטעינה'); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="p-6 text-center text-slate-400">
      <div className="inline-block w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-2" />
      <p>מחשב מפה פיננסית...</p>
    </div>
  )
  if (error) return <div className="p-6 text-red-500">{error}</div>
  if (!data) return null

  const { summary, categories, claim_priority, alerts } = data

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="עלות כוללת משוערת" value={fmt(summary.total_estimated)} color="slate" />
        <SummaryCard label="מכוסה (מקסימום)" value={fmt(summary.total_covered)} color="green" />
        <SummaryCard label="פער לא מכוסה" value={fmt(summary.total_gap)} color={summary.total_gap > 0 ? 'red' : 'green'} />
        <SummaryCard label="הוגש לתביעה" value={fmt(summary.total_claimed)} color="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'map',      label: 'מטריצת כיסויים' },
          { key: 'priority', label: `תור תביעות (${claim_priority.length})` },
          { key: 'alerts',   label: `התראות (${alerts.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Coverage matrix */}
      {activeTab === 'map' && (
        <div className="card overflow-x-auto">
          {categories.length === 0
            ? <p className="text-slate-400 text-center py-8">אין נתוני ביטוח — הוסף מקורות ביטוח</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-right">
                    <th className="px-4 py-3 font-semibold">קטגוריה</th>
                    <th className="px-4 py-3 font-semibold">עלות משוערת</th>
                    <th className="px-4 py-3 font-semibold">מקורות כיסוי</th>
                    <th className="px-4 py-3 font-semibold">מקסימום כיסוי</th>
                    <th className="px-4 py-3 font-semibold">פער</th>
                    <th className="px-4 py-3 font-semibold">הוגש</th>
                    <th className="px-4 py-3 font-semibold">אושר</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={cat.key} className={`border-t border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">{cat.label}</td>
                      <td className="px-4 py-3 text-slate-600">{cat.estimated ? fmt(cat.estimated) : '—'}</td>
                      <td className="px-4 py-3">
                        {cat.sources.length === 0
                          ? <span className="text-slate-300">—</span>
                          : (
                            <div className="flex flex-wrap gap-1">
                              {cat.sources.map((s, j) => (
                                <span key={j} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
                                  title={s.notes || ''}>
                                  {s.source_label.split('—')[0].trim()}
                                  {s.amount ? ` · ${fmt(s.amount)}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 font-medium text-green-700">{cat.covered ? fmt(cat.covered) : '—'}</td>
                      <td className="px-4 py-3">
                        {cat.gap > 0
                          ? <span className="font-medium text-red-600">{fmt(cat.gap)}</span>
                          : cat.covered > 0 ? <span className="text-green-500">✓ מכוסה</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cat.claimed ? fmt(cat.claimed) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{cat.approved ? fmt(cat.approved) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Claim priority */}
      {activeTab === 'priority' && (
        <div className="space-y-3">
          {claim_priority.length === 0
            ? <p className="text-slate-400 text-center py-8">אין תביעות ממתינות</p>
            : claim_priority.map(item => (
              <div key={`${item.source_id}-${item.category}`}
                className="card flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {item.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{item.source_label}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{item.category_label}</span>
                    {item.responsiveness >= 7 && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">⚡ רספונסיביות {item.responsiveness?.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{item.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-blue-700 text-lg">{item.amount ? fmt(item.amount) : 'מכוסה'}</p>
                  <button
                    onClick={() => window.open(`/manager/patients/${id}/claims`, '_self')}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 mt-1">
                    הגש תביעה →
                  </button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-2">
          {alerts.length === 0
            ? <p className="text-slate-400 text-center py-8">אין התראות</p>
            : alerts.map((alert, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info}`}>
                <span className="mt-0.5">
                  {alert.type === 'unutilized' ? '💡' : alert.type === 'gap' ? '⚠️' : '🔴'}
                </span>
                <div className="flex-1">
                  <p>{alert.text}</p>
                  {alert.amount > 0 && <p className="text-xs opacity-70 mt-0.5">{fmt(alert.amount)}</p>}
                </div>
                {alert.type === 'unutilized' && (
                  <button
                    onClick={() => window.open(`/manager/patients/${id}/claims`, '_self')}
                    className="text-xs underline opacity-70 hover:opacity-100 shrink-0">
                    פתח תביעות
                  </button>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  const colors = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red:   'bg-red-50 border-red-200 text-red-700',
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[color] || colors.slate}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}
