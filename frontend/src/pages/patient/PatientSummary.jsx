import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const STATUS_LABELS = { pending: 'ממתין', submitted: 'הוגש', approved: 'אושר', partial: 'אושר חלקית', rejected: 'נדחה' }
const STATUS_COLORS = { pending: 'bg-slate-100 text-slate-700', submitted: 'bg-blue-100 text-blue-700', approved: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', rejected: 'bg-red-100 text-red-700' }

export default function PatientSummary() {
  const { user } = useAuth()
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState(null)
  const [sources, setSources] = useState([])
  const [claims, setClaims] = useState([])
  const [strategy, setStrategy] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/patients').then(res => {
      setPatients(res.data)
      if (res.data.length > 0) loadPatient(res.data[0])
    }).finally(() => setLoading(false))
  }, [])

  const loadPatient = async (patient) => {
    setSelected(patient)
    const [s, c, st] = await Promise.all([
      axios.get(`/api/patients/${patient.id}/insurance`),
      axios.get(`/api/patients/${patient.id}/claims`),
      axios.get(`/api/patients/${patient.id}/strategy`),
    ])
    setSources(s.data); setClaims(c.data); setStrategy(st.data)
  }

  if (loading) return <div className="text-center py-20 text-slate-500">טוען...</div>

  if (!selected) return (
    <div className="text-center py-20">
      <p className="text-slate-500">אין תיק רפואי מקושר לחשבונך.</p>
      <p className="text-slate-400 text-sm mt-2">פנה למנהל האירוע הרפואי שלך.</p>
    </div>
  )

  const approvedClaims = claims.filter(c => c.status === 'approved' || c.status === 'partial')
  const pendingClaims = claims.filter(c => c.status === 'pending' || c.status === 'submitted')
  const totalApproved = approvedClaims.reduce((s, c) => s + (c.amount_approved || 0), 0)
  const totalPending = pendingClaims.reduce((s, c) => s + (c.amount_requested || 0), 0)
  const nextStep = strategy?.recommendations?.[0]?.claim_sequence?.[0]

  return (
    <div className="space-y-5">
      {/* Patient header */}
      <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white rounded-2xl p-6">
        <p className="text-blue-200 text-sm">מסע מטופל —</p>
        <h1 className="text-2xl font-bold mt-1">{selected.full_name}</h1>
        {selected.diagnosis_details && (
          <p className="text-blue-100 text-sm mt-2">{selected.diagnosis_details}</p>
        )}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-xs text-slate-500 mb-1">סה"כ אושר</p>
          <p className="text-2xl font-bold text-green-600">₪{totalApproved.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{approvedClaims.length} תביעות</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-500 mb-1">בהמתנה לאישור</p>
          <p className="text-2xl font-bold text-blue-600">₪{totalPending.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{pendingClaims.length} תביעות</p>
        </div>
      </div>

      {/* Next step */}
      {nextStep && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-600 mb-1">⚡ הצעד הבא המומלץ</p>
          <p className="font-semibold text-slate-800">{nextStep.source_label}</p>
          <p className="text-sm text-slate-600 mt-0.5">{nextStep.reason}</p>
        </div>
      )}

      {/* Insurance sources */}
      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-3">הביטוחים שלי</h2>
        {sources.length === 0 ? (
          <p className="text-slate-400 text-sm">אין ביטוחים מוגדרים</p>
        ) : (
          <div className="space-y-2">
            {sources.map(s => (
              <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {s.source_type === 'kupat_holim' ? `קופ"ח ${s.hmo_name}` : s.company_name || s.source_type}
                  </p>
                  {s.policy_number && <p className="text-xs text-slate-400">פוליסה: {s.policy_number}</p>}
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">פעיל</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gaps */}
      {strategy?.summary?.gaps?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">פערים בכיסוי הביטוחי</p>
          <div className="flex flex-wrap gap-2">
            {strategy.summary.gaps.map(g => (
              <span key={g} className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full">{g}</span>
            ))}
          </div>
          <p className="text-xs text-red-500 mt-2">מומלץ לדון עם מנהל האירוע הרפואי שלך</p>
        </div>
      )}

      {/* Claims status */}
      <div className="card">
        <h2 className="font-semibold text-slate-800 mb-3">סטטוס תביעות</h2>
        {claims.length === 0 ? (
          <p className="text-slate-400 text-sm">אין תביעות עדיין</p>
        ) : (
          <div className="space-y-2">
            {claims.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.source_label}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </div>
                <div className="text-left">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                  {c.amount_approved && (
                    <p className="text-xs text-green-600 mt-0.5 text-center">₪{c.amount_approved.toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
