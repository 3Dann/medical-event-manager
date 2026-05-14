import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import Form17Section from '../../components/Form17Section'
import { useConfirm } from '../../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'

const STATUS_COLORS = { pending: 'badge-gray', submitted: 'badge-blue', approved: 'badge-green', partial: 'badge-yellow', rejected: 'badge-red' }
const FEEDBACK_STATUSES = ['approved', 'partial', 'rejected']

export default function PatientClaims() {
  const { t } = useTranslation(['claims', 'claim_status'])
  const STATUS_LABELS = {
    pending: t('claim_status:pending'), submitted: t('claim_status:submitted'),
    approved: t('claim_status:approved'), partial: t('claim_status:partial'), rejected: t('claim_status:rejected'),
  }
  const CATEGORY_LABELS = {
    second_opinion: t('cat_second_opinion'), surgery: t('cat_surgery'),
    transplant: t('cat_transplant'), hospitalization: t('cat_hospitalization'),
    rehabilitation: t('cat_rehabilitation'), advanced_tech: t('cat_advanced_tech'),
    critical_illness: t('cat_critical_illness'), diagnostics: t('cat_diagnostics'),
  }
  const { id } = useParams()
  const [confirm, ConfirmUI] = useConfirm()
  const [claims, setClaims] = useState([])
  const [sources, setSources] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ insurance_source_id: '', category: 'surgery', description: '', amount_requested: '', status: 'pending', submission_date: '', deadline: '', notes: '', priority_order: '' })
  const [pendingFeedback, setPendingFeedback] = useState(null) // { companyName, outcome, scoreUpdated }
  const [feedbackSaving, setFeedbackSaving] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchAll(ctrl.signal)
    return () => ctrl.abort()
  }, [id])

  const fetchAll = async (signal) => {
    try {
      const [c, s] = await Promise.all([
        axios.get(`/api/patients/${id}/claims`, { signal }),
        axios.get(`/api/patients/${id}/insurance`, { signal }),
      ])
      setClaims(c.data); setSources(s.data)
    } catch (e) { if (!axios.isCancel(e)) console.error('שגיאה בטעינת נתונים', e) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    const payload = { ...form, insurance_source_id: parseInt(form.insurance_source_id), amount_requested: form.amount_requested ? parseFloat(form.amount_requested) : null, priority_order: form.priority_order ? parseInt(form.priority_order) : null }
    await axios.post(`/api/patients/${id}/claims`, payload)
    setShowForm(false); fetchAll().catch(() => {})
  }

  const handleStatusChange = async (claimId, newStatus) => {
    const claim = claims.find(c => c.id === claimId)
    await axios.put(`/api/patients/${id}/claims/${claimId}`, { status: newStatus })
    fetchAll().catch(() => {})
    if (FEEDBACK_STATUSES.includes(newStatus) && claim?.source_label) {
      setPendingFeedback({ companyName: claim.source_label, outcome: newStatus, scoreUpdated: false })
    }
  }

  const handleAmountApproved = async (claimId, amount) => {
    await axios.put(`/api/patients/${id}/claims/${claimId}`, { amount_approved: parseFloat(amount) }); fetchAll().catch(() => {})
  }

  const handleDelete = async (claimId) => {
    const ok = await confirm({ title: 'מחיקת תביעה', message: 'למחוק תביעה זו?', confirmLabel: 'מחק', danger: true })
    if (!ok) return
    await axios.delete(`/api/patients/${id}/claims/${claimId}`); fetchAll().catch(() => {})
  }

  const handleFeedbackConfirm = async () => {
    setFeedbackSaving(true)
    try {
      await axios.post('/api/learning/feedback', {
        company_name: pendingFeedback.companyName,
        outcome: pendingFeedback.outcome,
      })
      setPendingFeedback(prev => ({ ...prev, scoreUpdated: true }))
      setTimeout(() => setPendingFeedback(null), 2500)
    } catch (e) {
      setPendingFeedback(null)
    } finally {
      setFeedbackSaving(false)
    }
  }

  const totalRequested = claims.reduce((s, c) => s + (c.amount_requested || 0), 0)
  const totalApproved = claims.reduce((s, c) => s + (c.amount_approved || 0), 0)

  const outcomeIcon = { approved: '✅', partial: '🔶', rejected: '❌' }
  const outcomeLabel = { approved: t('outcome_approved'), partial: t('outcome_partial'), rejected: t('outcome_rejected') }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {ConfirmUI}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{t('claims_tracker_title')}</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ {t('new_claim')}</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('stat_total_claims'), value: claims.length, color: 'text-slate-800' },
          { label: t('stat_total_requested'), value: `₪${totalRequested.toLocaleString()}`, color: 'text-blue-600' },
          { label: t('stat_total_approved'), value: `₪${totalApproved.toLocaleString()}`, color: 'text-green-600' },
          { label: t('stat_open_claims'), value: claims.filter(c => c.status === 'pending' || c.status === 'submitted').length, color: 'text-yellow-600' },
        ].map(stat => (
          <div key={stat.label} className="card py-4">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Learning feedback banner */}
      {pendingFeedback && !pendingFeedback.scoreUpdated && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">{outcomeIcon[pendingFeedback.outcome]}</span>
            <div>
              <p className="font-medium text-slate-800 text-sm">
                תביעה {outcomeLabel[pendingFeedback.outcome]} — {pendingFeedback.companyName}
              </p>
              <p className="text-xs text-slate-500">{t('feedback_prompt')}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleFeedbackConfirm}
              disabled={feedbackSaving}
              className="btn-primary text-xs px-3 py-2.5"
            >
              {feedbackSaving ? t('updating') : `🧠 ${t('feedback_yes_update')}`}
            </button>
            <button
              onClick={() => setPendingFeedback(null)}
              className="btn-secondary text-xs px-3 py-2.5"
            >
              {t('skip')}
            </button>
          </div>
        </div>
      )}

      {/* Score updated confirmation */}
      {pendingFeedback?.scoreUpdated && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
          <span className="text-green-600">✓</span>
          <p className="text-sm text-green-700">{t('feedback_score_updated', { company: pendingFeedback.companyName })}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="font-semibold mb-4">{t('new_claim')}</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><label className="label">{t('insurance_source')}</label>
                <select className="input" value={form.insurance_source_id} onChange={e => setForm({...form, insurance_source_id: e.target.value})}>
                  <option value="">{t('select_source_placeholder')}</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.source_type === 'kupat_holim' ? `קופ"ח ${s.hmo_name}` : s.company_name || s.source_type}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('category_label')}</label>
                  <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="label">{t('priority')} (#)</label><input type="number" className="input" value={form.priority_order} onChange={e => setForm({...form, priority_order: e.target.value})} placeholder="1, 2, 3..." /></div>
                <div><label className="label">{t('amount_requested_label')}</label><input type="number" className="input" value={form.amount_requested} onChange={e => setForm({...form, amount_requested: e.target.value})} /></div>
                <div><label className="label">{t('status_label')}</label>
                  <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="label">{t('submission_date')}</label><input type="date" className="input" value={form.submission_date} onChange={e => setForm({...form, submission_date: e.target.value})} /></div>
                <div><label className="label">{t('deadline')}</label><input type="date" className="input" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} /></div>
              </div>
              <div><label className="label">{t('description_label')}</label><input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div><label className="label">{t('notes_label')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">{t('common:cancel', { ns: 'common' })}</button>
                <button type="submit" className="btn-primary">{t('add_claim_btn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="card text-center py-10 text-slate-600">{t('no_claims')}</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3 text-right text-slate-600 font-medium">#</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_source')}</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_category')}</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_requested')}</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_approved')}</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_status')}</th>
                <th className="p-3 text-right text-slate-600 font-medium">{t('col_deadline')}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 text-slate-500">{c.priority_order || '—'}</td>
                  <td className="p-3 font-medium text-slate-800 max-w-[160px] truncate">{c.source_label}</td>
                  <td className="p-3">{CATEGORY_LABELS[c.category] || c.category}</td>
                  <td className="p-3">{c.amount_requested ? `₪${c.amount_requested.toLocaleString()}` : '—'}</td>
                  <td className="p-3">
                    {c.status === 'approved' || c.status === 'partial' ? (
                      <input type="number" defaultValue={c.amount_approved || ''} onBlur={e => handleAmountApproved(c.id, e.target.value)}
                        className="w-24 border rounded px-2 py-1 text-xs" placeholder={t('enter_amount')} />
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <select value={c.status} onChange={e => handleStatusChange(c.id, e.target.value)}
                      className={`text-xs rounded-full px-2 py-1 border-0 font-medium ${c.status === 'approved' ? 'bg-green-100 text-green-800' : c.status === 'rejected' ? 'bg-red-100 text-red-800' : c.status === 'submitted' ? 'bg-blue-100 text-blue-800' : c.status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-700'}`}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{c.deadline || '—'}</td>
                  <td className="p-3">
                    <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <Form17Section patientId={id} />
    </div>
  )
}
