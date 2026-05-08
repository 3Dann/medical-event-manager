import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const FUND_TYPES = [
  { value: 'aid_fund',           label: 'קרן סיוע / עמותה' },
  { value: 'social_entitlement', label: 'זכאות סוציאלית' },
  { value: 'special_loan',       label: 'הלוואה ייעודית' },
  { value: 'tax_benefit',        label: 'הטבת מס / ניכוי' },
]

const TYPE_BADGE = {
  aid_fund:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  social_entitlement: 'bg-blue-50 text-blue-700 border-blue-200',
  special_loan:       'bg-amber-50 text-amber-700 border-amber-200',
  tax_benefit:        'bg-purple-50 text-purple-700 border-purple-200',
}

const EMPTY_FORM = {
  name: '', fund_type: 'aid_fund', organization: '', description: '',
  max_amount: '', eligible_ages_min: '', eligible_ages_max: '',
  application_url: '', contact_phone: '', notes: '', is_active: true,
}

function FundModal({ fund, onClose, onSaved }) {
  const isEdit = !!fund?.id
  const [form, setForm] = useState(isEdit ? {
    ...EMPTY_FORM,
    name: fund.name || '',
    fund_type: fund.fund_type || 'aid_fund',
    organization: fund.organization || '',
    description: fund.description || '',
    max_amount: fund.max_amount ?? '',
    eligible_ages_min: fund.eligible_ages_min ?? '',
    eligible_ages_max: fund.eligible_ages_max ?? '',
    application_url: fund.application_url || '',
    contact_phone: fund.contact_phone || '',
    notes: fund.notes || '',
    is_active: fund.is_active !== false,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setErr('שם הקרן הוא שדה חובה'); return }
    setSaving(true); setErr('')
    try {
      const body = {
        name: form.name.trim(),
        fund_type: form.fund_type,
        organization: form.organization || null,
        description: form.description || null,
        max_amount: form.max_amount !== '' ? +form.max_amount : null,
        eligible_conditions: [],
        eligible_ages_min: form.eligible_ages_min !== '' ? +form.eligible_ages_min : null,
        eligible_ages_max: form.eligible_ages_max !== '' ? +form.eligible_ages_max : null,
        application_url: form.application_url || null,
        contact_phone: form.contact_phone || null,
        notes: form.notes || null,
        is_active: form.is_active,
      }
      if (isEdit) {
        await axios.put(`/api/admin/financial-funds/${fund.id}`, body)
      } else {
        await axios.post('/api/admin/financial-funds', body)
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{isEdit ? 'עריכת קרן' : 'קרן חדשה'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">שם הקרן *</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
              value={form.name} onChange={e => set('name', e.target.value)} placeholder="שם הקרן / הזכאות" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">סוג</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
              value={form.fund_type} onChange={e => set('fund_type', e.target.value)}>
              {FUND_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">ארגון / גוף מממן</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
              value={form.organization} onChange={e => set('organization', e.target.value)} placeholder="ביטוח לאומי / עמותה..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">תיאור</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right resize-none"
              rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">סכום מקסימלי (₪)</label>
              <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                value={form.max_amount} onChange={e => set('max_amount', e.target.value)} placeholder="ללא הגבלה" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">גיל מינימלי</label>
              <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                value={form.eligible_ages_min} onChange={e => set('eligible_ages_min', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">גיל מקסימלי</label>
              <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                value={form.eligible_ages_max} onChange={e => set('eligible_ages_max', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">טלפון יצירת קשר</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="03-..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 text-right">קישור להגשה</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.application_url} onChange={e => set('application_url', e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 text-right">הערות למנהל</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right resize-none"
              rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <label className="flex items-center gap-2 justify-end cursor-pointer">
            <span className="text-sm text-slate-700">קרן פעילה</span>
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded" />
          </label>

          {err && <p className="text-sm text-red-600 text-right">{err}</p>}
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
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

export default function FundManagementPanel() {
  const [funds, setFunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // fund object or {} for new
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/financial-funds')
      setFunds(res.data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (fund) => {
    try {
      await axios.put(`/api/admin/financial-funds/${fund.id}`, { ...fund, is_active: !fund.is_active, eligible_conditions: [] })
      load()
    } catch {}
  }

  const fmt = n => n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—'

  const visible = showInactive ? funds : funds.filter(f => f.is_active)
  const active = funds.filter(f => f.is_active).length
  const inactive = funds.length - active

  if (loading) return <p className="text-sm text-slate-400 py-4 text-right">טוען...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInactive(s => !s)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showInactive ? 'הסתר לא פעילות' : `הצג לא פעילות (${inactive})`}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-slate-500">
            {active} קרנות פעילות{inactive > 0 ? `, ${inactive} לא פעילות` : ''}
          </p>
          <button onClick={() => setEditing({})}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
            + הוסף קרן חדשה
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400 text-right py-4">אין קרנות להצגה</p>
      ) : (
        <div className="space-y-2">
          {visible.map(fund => (
            <div key={fund.id}
              className={`border rounded-xl p-4 flex items-start justify-between gap-4 transition-opacity ${!fund.is_active ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0 text-right space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800 text-sm">{fund.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_BADGE[fund.fund_type] || TYPE_BADGE.aid_fund}`}>
                    {FUND_TYPES.find(t => t.value === fund.fund_type)?.label || fund.fund_type}
                  </span>
                  {!fund.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">לא פעילה</span>
                  )}
                </div>
                {fund.organization && (
                  <p className="text-xs text-slate-500">{fund.organization}</p>
                )}
                {fund.description && (
                  <p className="text-xs text-slate-400 line-clamp-1">{fund.description}</p>
                )}
              </div>
              <div className="shrink-0 text-left space-y-2">
                {fund.max_amount && (
                  <p className="text-sm font-medium text-slate-700">עד {fmt(fund.max_amount)}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(fund)}
                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">
                    עריכה
                  </button>
                  <button onClick={() => toggle(fund)}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
                    {fund.is_active ? 'השבת' : 'הפעל'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <FundModal
          fund={editing?.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
