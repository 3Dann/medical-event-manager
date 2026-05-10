import { useState, useEffect, useCallback } from 'react'

const FUND_TYPE_COLORS = {
  aid_fund:           { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200', dot: 'bg-emerald-500' },
  social_entitlement: { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200',   dot: 'bg-blue-500' },
  special_loan:       { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',  dot: 'bg-amber-500' },
  tax_benefit:        { bg: 'bg-purple-50',   text: 'text-purple-700',   border: 'border-purple-200', dot: 'bg-purple-500' },
}

const STATUS_COLORS = {
  considering: 'bg-slate-100 text-slate-600',
  applied:     'bg-blue-100 text-blue-700',
  approved:    'bg-emerald-100 text-emerald-700',
  rejected:    'bg-red-100 text-red-700',
}

const fmt = (n) => n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—'

function SummaryCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    slate:   'bg-slate-50 border-slate-200 text-slate-800',
    green:   'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    red:     'bg-red-50 border-red-200 text-red-800',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  )
}

function FundBadge({ type, label }) {
  const c = FUND_TYPE_COLORS[type] || FUND_TYPE_COLORS.aid_fund
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}

// ── Add Fund Modal ──────────────────────────────────────────────────────────
function AddFundModal({ patientId, onClose, onAdded }) {
  const [mode, setMode]       = useState('registry') // registry | custom
  const [funds, setFunds]     = useState([])
  const [selected, setSelected] = useState(null)
  const [customName, setCustomName] = useState('')
  const [amount, setAmount]   = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetch('/api/financial-funds', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setFunds).catch(() => {})
  }, [])

  const filtered = funds.filter(f =>
    f.name.includes(search) || (f.organization || '').includes(search)
  )

  const save = async () => {
    if (mode === 'registry' && !selected) return
    if (mode === 'custom' && !customName.trim()) return
    setSaving(true)
    try {
      const body = mode === 'registry'
        ? { fund_id: selected.id, expected_amount: amount ? +amount : null, notes }
        : { custom_name: customName, expected_amount: amount ? +amount : null, notes }
      const r = await fetch(`/api/patients/${patientId}/financial-funds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      onAdded(data)
      onClose()
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">הוספת מקור מימון</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl">✕</button>
        </div>

        <div className="flex border-b border-slate-100">
          {[['registry','מהמאגר'],['custom','ידני']].map(([k,l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${mode===k ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode === 'registry' ? (
            <>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                placeholder="חיפוש קרן..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filtered.map(f => (
                  <button key={f.id} onClick={() => setSelected(f)}
                    className={`w-full text-right p-3 rounded-xl border transition-all
                      ${selected?.id === f.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <FundBadge type={f.fund_type} label={f.fund_type_label} />
                      {f.max_amount && <span className="text-xs text-slate-500">עד {fmt(f.max_amount)}</span>}
                    </div>
                    <p className="font-medium text-sm text-slate-800 mt-1">{f.name}</p>
                    <p className="text-xs text-slate-500">{f.organization}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
              placeholder="שם מקור המימון (למשל: תרומה ממשפחה)"
              value={customName} onChange={e => setCustomName(e.target.value)}
            />
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">סכום צפוי (₪)</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
              placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">הערות</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right resize-none"
              rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">ביטול</button>
          <button onClick={save} disabled={saving || (mode==='registry' && !selected) || (mode==='custom' && !customName.trim())}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'שומר...' : 'הוסף'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status Update Modal ─────────────────────────────────────────────────────
function UpdateStatusModal({ patientId, app, onClose, onUpdated }) {
  const [status, setStatus]   = useState(app.status)
  const [approved, setApproved] = useState(app.approved_amount || '')
  const [notes, setNotes]     = useState(app.notes || '')
  const [saving, setSaving]   = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/patients/${patientId}/financial-funds/${app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status, approved_amount: approved ? +approved : null, notes }),
      })
      if (!r.ok) throw new Error()
      onUpdated(await r.json())
      onClose()
    } catch { setSaving(false) }
  }

  const labels = { considering: 'שוקלים', applied: 'הוגשה', approved: 'אושרה', rejected: 'נדחתה' }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 text-lg mb-4 text-right">עדכון סטטוס — {app.display_name}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">סטטוס</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(labels).map(([k, l]) => (
                <button key={k} onClick={() => setStatus(k)}
                  className={`py-2 text-sm rounded-lg border transition-all
                    ${status === k ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium' : 'border-slate-200 text-slate-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {status === 'approved' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">סכום מאושר (₪)</label>
              <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                value={approved} onChange={e => setApproved(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">הערות</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right resize-none"
              rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">ביטול</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function FinancialMapTab({ patientId }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [updating, setUpdating]   = useState(null) // app being updated
  const [expanded, setExpanded]   = useState({})   // stage expansions
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/patients/${patientId}/financial-map`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [patientId])

  useEffect(() => { load() }, [load])

  const generateReport = async () => {
    setGenerating(true)
    try {
      const r = await fetch(`/api/patients/${patientId}/reports/financial-map`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `מפה-פיננסית-${patientId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('שגיאה בייצור הדוח')
    } finally {
      setGenerating(false)
    }
  }

  const removeApp = async (appId) => {
    if (!confirm('להסיר מקור מימון זה?')) return
    await fetch(`/api/patients/${patientId}/financial-funds/${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    load()
  }

  const addRecommended = async (fund) => {
    await fetch(`/api/patients/${patientId}/financial-funds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ fund_id: fund.id }),
    })
    load()
  }

  if (loading) return <div className="py-16 text-center text-slate-600">טוען מפה פיננסית...</div>
  if (!data)   return <div className="py-16 text-center text-slate-600">שגיאה בטעינת הנתונים</div>

  const { summary, by_stage, optional_nodes, fund_applications, recommended_funds, action_items } = data
  const hasCost = summary.total_cost > 0

  // Progress bar widths
  const insurancePct = hasCost ? Math.min(100, summary.coverage_pct) : 0
  const externalPct  = hasCost
    ? Math.min(100 - insurancePct,
        ((summary.external_funding_approved + summary.external_funding_expected) / summary.total_cost * 100))
    : 0
  const gapPct = Math.max(0, 100 - insurancePct - externalPct)

  return (
    <div className="space-y-6">

      {/* ── Report button ──────────────────────────────────────────────── */}
      <div className="flex justify-start">
        <button
          onClick={generateReport}
          disabled={generating}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl
            border border-slate-200 bg-white hover:bg-slate-50 text-slate-700
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {generating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              מייצר דוח...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              הפק דוח PDF
            </>
          )}
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="עלות כוללת מוערכת" value={fmt(summary.total_cost)} color="slate" />
        <SummaryCard label="כיסוי ביטוחי" value={fmt(summary.insurance_covered)}
          sub={hasCost ? `${summary.coverage_pct}% מהעלות` : null} color="green" />
        <SummaryCard label="מימון נוסף"
          value={fmt(summary.external_funding_approved + summary.external_funding_expected)}
          sub={summary.external_funding_approved > 0 ? `${fmt(summary.external_funding_approved)} מאושר` : 'טרם אושר'}
          color="blue" />
        <SummaryCard label="פער נותר" value={fmt(summary.remaining_gap)}
          sub={hasCost && summary.remaining_gap > 0 ? `${Math.round(summary.remaining_gap / summary.total_cost * 100)}% מהעלות` : null}
          color={summary.remaining_gap > 0 ? 'red' : 'green'} />
      </div>

      {/* ── Progress Bar ───────────────────────────────────────────────── */}
      {hasCost && (
        <div className="space-y-2">
          <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
            {insurancePct > 0 && (
              <div className="bg-emerald-400 transition-all" style={{ width: `${insurancePct}%` }} title="כיסוי ביטוחי" />
            )}
            {externalPct > 0 && (
              <div className="bg-blue-400 transition-all" style={{ width: `${externalPct}%` }} title="מימון נוסף" />
            )}
            {gapPct > 0 && (
              <div className="bg-red-300 transition-all" style={{ width: `${gapPct}%` }} title="פער נותר" />
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-500 justify-end">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />כיסוי ביטוחי</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />מימון נוסף</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-300 inline-block" />פער</span>
          </div>
        </div>
      )}

      {/* ── Action Items ───────────────────────────────────────────────── */}
      {action_items.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-semibold text-amber-800 mb-2">צעדים מומלצים לצמצום הפער</p>
          {action_items.map((item, i) => (
            <div key={i} className="flex gap-2 text-sm text-amber-700">
              <span className="mt-0.5 shrink-0">⚡</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Cost Breakdown by Stage ────────────────────────────────────── */}
      {by_stage.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-800">פירוט עלויות לפי שלב מסע</h3>
          {by_stage.map(stage => (
            <div key={stage.stage_order} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(p => ({ ...p, [stage.stage_order]: !p[stage.stage_order] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{expanded[stage.stage_order] ? '▾' : '▸'}</span>
                  <span className="font-medium text-slate-800">{stage.stage_label}</span>
                  <span className="text-xs text-slate-500">{stage.nodes.length} שלבים</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-slate-600">{fmt(stage.total_cost)}</span>
                  {stage.total_covered > 0 && (
                    <span className="text-emerald-600">כיסוי {fmt(stage.total_covered)}</span>
                  )}
                  {stage.total_gap > 0 && (
                    <span className="text-red-500">פער {fmt(stage.total_gap)}</span>
                  )}
                </div>
              </button>

              {expanded[stage.stage_order] && (
                <div className="divide-y divide-slate-100">
                  {stage.nodes.map(node => (
                    <div key={node.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1 text-right">
                        <p className="text-sm font-medium text-slate-800 truncate">{node.description}</p>
                        {node.coverage_categories?.length > 0 && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            {node.coverage_categories.map(c => ({
                              diagnostics: 'בדיקות', surgery: 'ניתוח', hospitalization: 'אשפוז',
                              rehabilitation: 'שיקום', second_opinion: 'חוות דעת', advanced_tech: 'טכנולוגיה',
                              transplant: 'השתלה', critical_illness: 'מחלה קשה'
                            }[c] || c)).join(' · ')}
                          </p>
                        )}
                        {node.best_source && (
                          <p className="text-xs text-emerald-600 mt-0.5">מכוסה ע"י {node.best_source}</p>
                        )}
                      </div>
                      <div className="text-left shrink-0 space-y-0.5">
                        {node.estimated_cost
                          ? <p className="text-sm font-semibold text-slate-700">{fmt(node.estimated_cost)}</p>
                          : <p className="text-sm text-slate-600">עלות לא הוגדרה</p>}
                        {node.covered_amount > 0 && (
                          <p className="text-xs text-emerald-600">{fmt(node.covered_amount)} מכוסה</p>
                        )}
                        {node.gap > 0 && (
                          <p className="text-xs text-red-500">פער {fmt(node.gap)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Totals row */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-xl text-white text-sm font-medium">
            <span>סה"כ</span>
            <div className="flex gap-4">
              <span>{fmt(summary.total_cost)}</span>
              <span className="text-emerald-300">כיסוי {fmt(summary.insurance_covered)}</span>
              <span className="text-red-300">פער {fmt(summary.insurance_gap)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Optional (Overlay) Nodes ───────────────────────────────────── */}
      {optional_nodes?.length > 0 && (
        <div className="border border-dashed border-slate-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">עלויות אופציונליות (זמינות בכל שלב)</p>
          <div className="space-y-2">
            {optional_nodes.map(node => (
              <div key={node.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{node.description}</span>
                <span className="text-slate-500">{fmt(node.estimated_cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── External Funding ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">מקורות מימון נוספים</h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
            + הוסף מקור מימון
          </button>
        </div>

        {fund_applications.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-8 text-center">
            <p className="text-slate-400 text-sm">לא הוגדרו עדיין מקורות מימון</p>
            <button onClick={() => setShowAdd(true)} className="mt-2 text-blue-600 text-sm hover:underline">
              הוסף את הראשון
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {fund_applications.map(app => (
              <div key={app.id} className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-slate-800 text-sm">{app.display_name}</span>
                    <FundBadge type={app.fund_type} label={app.fund_type_label} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[app.status]}`}>
                      {app.status_label}
                    </span>
                  </div>
                  {app.notes && <p className="text-xs text-slate-500 truncate">{app.notes}</p>}
                </div>
                <div className="text-left shrink-0 space-y-1">
                  {app.status === 'approved' && app.approved_amount
                    ? <p className="text-sm font-bold text-emerald-700">{fmt(app.approved_amount)}</p>
                    : app.expected_amount
                    ? <p className="text-sm text-slate-600">צפוי {fmt(app.expected_amount)}</p>
                    : null}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setUpdating(app)}
                      className="text-xs text-blue-600 hover:text-blue-700">עדכן</button>
                    <button onClick={() => removeApp(app.id)}
                      className="text-xs text-red-400 hover:text-red-600">הסר</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recommended Funds ──────────────────────────────────────────── */}
      {recommended_funds.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">קרנות מומלצות למטופל</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {recommended_funds.map(fund => (
              <div key={fund.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <FundBadge type={fund.fund_type} label={fund.fund_type_label} />
                  {fund.max_amount && (
                    <span className="text-xs text-slate-500 shrink-0">עד {fmt(fund.max_amount)}</span>
                  )}
                </div>
                <p className="font-medium text-sm text-slate-800 text-right">{fund.name}</p>
                <p className="text-xs text-slate-500 text-right">{fund.organization}</p>
                {fund.description && (
                  <p className="text-xs text-slate-500 text-right line-clamp-2">{fund.description}</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  {fund.contact_phone && (
                    <a href={`tel:${fund.contact_phone}`} className="text-xs text-blue-600 hover:underline">
                      {fund.contact_phone}
                    </a>
                  )}
                  <button onClick={() => addRecommended(fund)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors mr-auto">
                    הוסף לתוכנית
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showAdd && (
        <AddFundModal
          patientId={patientId}
          onClose={() => setShowAdd(false)}
          onAdded={() => load()}
        />
      )}
      {updating && (
        <UpdateStatusModal
          patientId={patientId}
          app={updating}
          onClose={() => setUpdating(null)}
          onUpdated={() => { setUpdating(null); load() }}
        />
      )}
    </div>
  )
}
