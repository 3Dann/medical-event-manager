import { useState, useEffect } from 'react'
import axios from 'axios'

const TYPE_CONFIG = {
  medical:   { icon: '🚨', bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-800',   btn: 'text-red-600 hover:text-red-800' },
  financial: { icon: '⚠️', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-800', btn: 'text-amber-600 hover:text-amber-800' },
  caregiver: { icon: '💜', bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-800',btn: 'text-purple-600 hover:text-purple-800' },
}

const FLAG_TYPES = [
  { value: 'medical',   label: 'רפואי' },
  { value: 'financial', label: 'פיננסי' },
  { value: 'caregiver', label: 'שחיקת מטפל' },
]

const SUGGESTIONS = {
  medical: [
    'חום גבוה מעל 38° — מצב חירום',
    'כאב חריג לא מאוזן מעל 24 שעות',
    'הידרדרות תפקודית פתאומית',
    'חוסר תקשורת מהצוות הרפואי',
  ],
  financial: [
    'דחיית תביעה ביטוחית — יש לערור',
    'תרופה מחוץ לסל ללא כיסוי',
    'הוצאות שוטפות חורגות מהכנסות',
    'כפל תשלום — יש לדרוש החזר',
  ],
  caregiver: [
    'בידוד חברתי של המטפל',
    'חוסר שינה כרוני',
    'תחושת אשמה קבועה',
    'קושי בקבלת עזרה',
  ],
}

function AddFlagModal({ patientId, onClose, onSaved }) {
  const [form, setForm] = useState({ flag_type: 'medical', severity: 'warning', title: '', description: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const cfg = TYPE_CONFIG[form.flag_type]

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await axios.post(`/api/patients/${patientId}/red-flags`, form)
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">הוספת נורה אדומה</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 p-2 -m-2 rounded-lg">✕</button>
        </div>
        <form onSubmit={save}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">סוג</label>
              <select className="input" value={form.flag_type} onChange={e => set('flag_type', e.target.value)}>
                {FLAG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">חומרה</label>
              <select className="input" value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="warning">אזהרה</option>
                <option value="critical">קריטי</option>
              </select>
            </div>
          </div>

          {/* Suggestions */}
          <div>
            <label className="label">בחר מהצעות או כתוב בעצמך</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(SUGGESTIONS[form.flag_type] || []).map(s => (
                <button key={s} onClick={() => set('title', s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                    ${form.title === s ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="תיאור קצר..." />
          </div>

          <div>
            <label className="label">פרטים נוספים</label>
            <textarea className="input resize-none" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button type="button" onClick={onClose} className="btn-secondary">ביטול</button>
          <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary disabled:opacity-40">
            {saving ? 'שומר...' : 'הוסף נורה'}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}

export default function RedFlagsBanner({ patientId }) {
  const [flags, setFlags] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const load = (signal) =>
    axios.get(`/api/patients/${patientId}/red-flags?active_only=true`, { signal })
      .then(r => setFlags(r.data)).catch(e => { if (axios.isCancel(e)) return })

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [patientId])

  const resolve = async (id) => {
    await axios.put(`/api/patients/${patientId}/red-flags/${id}/resolve`)
    load()
  }

  if (flags.length === 0 && !showAdd) {
    return (
      <div className="px-4 md:px-6 py-1.5 flex justify-end">
        <button onClick={() => setShowAdd(true)}
          className="text-xs text-slate-600 hover:text-red-500 transition-colors">
          + הוסף נורה אדומה
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 md:px-6 pb-2 space-y-1.5">
        <div className="flex items-center justify-between">
          {flags.length > 0 && (
            <button onClick={() => setCollapsed(c => !c)}
              className="text-xs text-slate-500 hover:text-slate-700">
              {collapsed ? `▸ ${flags.length} נורות אדומות פעילות` : '▾ כווץ נורות אדומות'}
            </button>
          )}
          <button onClick={() => setShowAdd(true)}
            className="text-xs text-red-500 hover:text-red-700 mr-auto">
            + הוסף נורה
          </button>
        </div>

        {!collapsed && flags.map(f => {
          const cfg = TYPE_CONFIG[f.flag_type] || TYPE_CONFIG.medical
          return (
            <div key={f.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
              <span className="text-base shrink-0">{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${cfg.text}`}>{f.title}</span>
                {f.description && <p className={`text-xs mt-0.5 opacity-80 ${cfg.text}`}>{f.description}</p>}
              </div>
              <button onClick={() => resolve(f.id)}
                aria-label={f.title ? `סמן כטופל: ${f.title}` : 'סמן כטופל'}
                className={`text-xs shrink-0 min-h-[44px] min-w-[44px] ${cfg.btn} transition-colors`}>
                ✓ טופל
              </button>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <AddFlagModal patientId={patientId}
          onClose={() => setShowAdd(false)} onSaved={load} />
      )}
    </>
  )
}
