import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444']

const CATEGORY_LABELS = {
  second_opinion: 'חוות דעת', surgery: 'ניתוחים', transplant: 'השתלות',
  hospitalization: 'אישפוזים', rehabilitation: 'שיקום', advanced_tech: 'טכנולוגיות',
  critical_illness: 'מחלות קשות', diagnostics: 'בדיקות',
}

function ConfidenceBadge({ rate }) {
  if (rate === null || rate === undefined) return null
  if (rate >= 70) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ביטחון גבוה</span>
  if (rate >= 40) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">ביטחון בינוני</span>
  return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ביטחון נמוך</span>
}

export default function PatientStrategy() {
  const { id } = useParams()
  const [strategy, setStrategy] = useState(null)
  const [matrix, setMatrix] = useState(null)
  const [insights, setInsights] = useState(null)
  const [tab, setTab] = useState('strategy')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [s, m, i] = await Promise.all([
        axios.get(`/api/patients/${id}/strategy`),
        axios.get(`/api/patients/${id}/strategy/matrix`),
        axios.get(`/api/learning/patients/${id}/insights`),
      ])
      setStrategy(s.data)
      setMatrix(m.data)
      setInsights(i.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="p-8 text-slate-500">מחשב אסטרטגיה...</div>

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">מפה פיננסית ואסטרטגיה</h2>
        <button onClick={fetchAll} className="btn-secondary text-sm">רענן</button>
      </div>

      {/* Summary cards */}
      {strategy && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card bg-blue-50 border-blue-100">
            <p className="text-sm text-blue-600">מקורות ביטוח פעילים</p>
            <p className="text-3xl font-bold text-blue-800 mt-1">{strategy.summary?.total_sources || 0}</p>
          </div>
          <div className="card bg-green-50 border-green-100">
            <p className="text-sm text-green-600">קטגוריות מכוסות</p>
            <p className="text-3xl font-bold text-green-800 mt-1">{strategy.summary?.categories_covered || 0}</p>
          </div>
          <div className="card bg-red-50 border-red-100">
            <p className="text-sm text-red-600">פערים בכיסוי</p>
            <p className="text-3xl font-bold text-red-800 mt-1">{strategy.summary?.gaps?.length || 0}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['strategy', 'המלצות ורצף תביעות'],
          ['matrix', 'מטריצת כיסויים'],
          ['insights', '🧠 תובנות'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Strategy tab */}
      {tab === 'strategy' && strategy && (
        <div className="space-y-4">
          {strategy.summary?.gaps?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="font-semibold text-red-700 mb-2">⚠️ פערים בכיסוי</p>
              <div className="flex flex-wrap gap-2">
                {strategy.summary.gaps.map(g => <span key={g} className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">{g}</span>)}
              </div>
            </div>
          )}

          {strategy.recommendations.map((rec, ri) => (
            <div key={ri} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-sm">{ri + 1}</span>
                </div>
                <h3 className="font-semibold text-slate-800">{rec.category_label}</h3>
                <span className="badge-blue text-xs">{rec.total_sources} מקורות</span>
              </div>
              <div className="space-y-2">
                {rec.claim_sequence.map((step, si) => {
                  const confidence = insights?.patient_confidence?.[step.source_label] ??
                    insights?.company_approval_rates?.find(r => step.source_label?.includes(r.company_name))?.approval_rate ?? null
                  return (
                    <div key={si} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${si === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {step.order}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-slate-800">{step.source_label}</p>
                          <ConfidenceBadge rate={confidence} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{step.reason}</p>
                      </div>
                      <div className="text-left text-xs text-slate-600">
                        {step.amount && <p>₪{step.amount.toLocaleString()}</p>}
                        {step.percentage && <p>{step.percentage}%</p>}
                        <p className="text-slate-400">ציון: {step.responsiveness_score}/10</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {strategy.recommendations.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-slate-500">אין מספיק נתוני ביטוח לייצור אסטרטגיה.</p>
              <p className="text-slate-400 text-sm mt-1">הוסף מקורות ביטוח וכיסויים בלשונית "ביטוחים".</p>
            </div>
          )}
        </div>
      )}

      {/* Matrix tab */}
      {tab === 'matrix' && matrix && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="p-3 text-right font-medium sticky right-0 bg-slate-800">קטגוריה</th>
                  {matrix.sources.map(s => (
                    <th key={s.id} className="p-3 text-center font-medium min-w-[130px]">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.matrix.map((row, ri) => (
                  <tr key={row.category} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 font-medium text-slate-800 sticky right-0 bg-inherit border-l">{row.category_label}</td>
                    {row.sources.map(s => (
                      <td key={s.source_id} className="p-3 text-center">
                        {s.is_covered ? (
                          <div>
                            <span className="text-green-500 text-lg">✓</span>
                            {s.percentage && <p className="text-xs text-slate-500">{s.percentage}%</p>}
                            {s.amount && <p className="text-xs text-slate-500">₪{s.amount?.toLocaleString()}</p>}
                            {s.copay && <p className="text-xs text-orange-500">השת"ע ₪{s.copay}</p>}
                            {s.abroad && <p className="text-xs text-blue-500">+חו"ל</p>}
                          </div>
                        ) : (
                          <span className="text-red-400 text-lg">✗</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matrix.sources.length === 0 && (
            <div className="text-center py-10 text-slate-400">אין מקורות ביטוח. הוסף ביטוחים כדי לראות את המטריצה.</div>
          )}
        </div>
      )}

      {/* Insights tab */}
      {tab === 'insights' && (
        <div className="space-y-5">
          {/* No data yet */}
          {insights && insights.company_approval_rates.length === 0 && insights.similar_gaps.length === 0 && (
            <div className="card text-center py-14">
              <p className="text-4xl mb-3">🧠</p>
              <p className="font-medium text-slate-700">המערכת עדיין לא אספה מספיק נתונים</p>
              <p className="text-sm text-slate-400 mt-1">ברגע שתביעות יאושרו או יידחו, יופיעו כאן תובנות</p>
            </div>
          )}

          {/* Similar patients gaps */}
          {insights?.similar_gaps?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">👥</span>
                <h3 className="font-semibold text-slate-800">פערים נפוצים במטופלים דומים</h3>
                <span className="text-xs text-slate-400">
                  ({insights.similar_patients_count} מטופלים עם אותה קופת חולים)
                </span>
              </div>
              <div className="space-y-2">
                {insights.similar_gaps.map(gap => (
                  <div key={gap.category} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{gap.category_label}</p>
                      <p className="text-xs text-slate-500">{gap.count} מתוך {insights.similar_patients_count} מטופלים חסרים כיסוי זה</p>
                    </div>
                    <div className="text-right">
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${gap.pct}%` }} />
                      </div>
                      <p className="text-xs text-amber-700 mt-1">{gap.pct}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Company approval rates */}
          {insights?.company_approval_rates?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📊</span>
                <h3 className="font-semibold text-slate-800">שיעורי אישור לפי מקור ביטוח</h3>
                <span className="text-xs text-slate-400">(מכל המטופלים במערכת)</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={insights.company_approval_rates} layout="vertical" margin={{ right: 40, left: 10 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="company_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v}%`, 'שיעור אישור']} />
                  <Bar dataKey="approval_rate" radius={[0, 4, 4, 0]}>
                    {insights.company_approval_rates.map((entry, i) => (
                      <Cell key={i} fill={entry.approval_rate >= 70 ? '#22c55e' : entry.approval_rate >= 40 ? '#f59e0b' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 grid gap-2">
                {insights.company_approval_rates.map(r => (
                  <div key={r.company_name} className="flex items-center justify-between text-sm px-1">
                    <span className="text-slate-700">{r.company_name}</span>
                    <div className="flex items-center gap-3 text-slate-500 text-xs">
                      <span>{r.total_claims} תביעות</span>
                      <span className="text-green-600">{r.approved} אושרו</span>
                      <span className="text-red-500">{r.rejected} נדחו</span>
                      <span className="font-semibold text-slate-700">{r.approval_rate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patient's own confidence */}
          {insights?.patient_confidence && Object.keys(insights.patient_confidence).length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🎯</span>
                <h3 className="font-semibold text-slate-800">ביטחון אישי לפי היסטוריית תביעות</h3>
                <span className="text-xs text-slate-400">(תביעות מטופל זה בלבד)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(insights.patient_confidence).map(([company, rate]) => (
                  <div key={company} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">{company}</span>
                    {rate !== null ? (
                      <ConfidenceBadge rate={rate} />
                    ) : (
                      <span className="text-xs text-slate-400">אין נתונים</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
