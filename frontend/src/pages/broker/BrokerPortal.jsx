import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const STATUS_LABELS = {
  pending:   { label: 'ממתין',   color: 'bg-yellow-100 text-yellow-700' },
  submitted: { label: 'הוגש',    color: 'bg-blue-100 text-blue-700' },
  approved:  { label: 'אושר',    color: 'bg-green-100 text-green-700' },
  partial:   { label: 'חלקי',    color: 'bg-cyan-100 text-cyan-700' },
  rejected:  { label: 'נדחה',    color: 'bg-red-100 text-red-700' },
  draft:     { label: 'טיוטה',   color: 'bg-slate-100 text-slate-600' },
}

const DIAGNOSIS_LABELS = {
  yes:     { label: 'כן',      color: 'bg-red-100 text-red-700' },
  no:      { label: 'לא',      color: 'bg-green-100 text-green-700' },
  pending: { label: 'ממתין',   color: 'bg-yellow-100 text-yellow-700' },
}

const HMO_LABELS = {
  clalit:   'כללית',
  maccabi:  'מכבי',
  meuhedet: 'מאוחדת',
  leumit:   'לאומית',
}

export default function BrokerPortal() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [claimsMap, setClaimsMap] = useState({})
  const [claimsLoading, setClaimsLoading] = useState({})

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/broker/patients', { signal: ctrl.signal })
      .then(r => setPatients(r.data))
      .catch(e => { if (!axios.isCancel(e)) setError('שגיאה בטעינת המטופלים') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const togglePatient = async (patientId) => {
    if (expandedId === patientId) {
      setExpandedId(null)
      return
    }
    setExpandedId(patientId)
    if (!claimsMap[patientId]) {
      setClaimsLoading(prev => ({ ...prev, [patientId]: true }))
      try {
        const r = await axios.get(`/api/broker/patients/${patientId}/claims`)
        setClaimsMap(prev => ({ ...prev, [patientId]: r.data }))
      } catch {
        setClaimsMap(prev => ({ ...prev, [patientId]: [] }))
      } finally {
        setClaimsLoading(prev => ({ ...prev, [patientId]: false }))
      }
    }
  }

  const handleLogout = () => { logout(); navigate('/') }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">פורטל ברוקר</h1>
          <p className="text-sm text-slate-500 mt-0.5">Orly Medical — תצוגת סוכן ביטוח</p>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">{user.full_name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            התנתק
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">

        {/* Stats bar */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">מטופלים</p>
            <p className="text-3xl font-bold text-slate-800">{patients.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">סה"כ תביעות</p>
            <p className="text-3xl font-bold text-slate-800">
              {Object.values(claimsMap).reduce((s, arr) => s + arr.length, 0)}
            </p>
          </div>
        </div>

        {/* Patient list */}
        {loading && (
          <div className="py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">טוען מטופלים...</p>
          </div>
        )}

        {error && (
          <div className="py-10 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && patients.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-slate-500 text-sm">אין מטופלים משויכים לחשבונך.</p>
            <p className="text-slate-400 text-xs mt-2">פנה למנהל המערכת להגדרת גישה.</p>
          </div>
        )}

        <div className="space-y-3">
          {patients.map(p => {
            const diag = DIAGNOSIS_LABELS[p.diagnosis_status] || { label: p.diagnosis_status, color: 'bg-slate-100 text-slate-600' }
            const tags = p.condition_tags ? p.condition_tags.split(',').filter(Boolean) : []
            const isExpanded = expandedId === p.id
            const claims = claimsMap[p.id] || []
            const isLoadingClaims = claimsLoading[p.id]

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Patient row */}
                <button
                  onClick={() => togglePatient(p.id)}
                  className="w-full text-right px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                  aria-expanded={isExpanded}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 font-bold text-sm">
                    {p.full_name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{p.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diag.color}`}>
                        אבחון: {diag.label}
                      </span>
                      {p.hmo_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {HMO_LABELS[p.hmo_name] || p.hmo_name}
                        </span>
                      )}
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {tags.slice(0, 4).map(tag => (
                          <span key={tag} className="text-[11px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expand arrow */}
                  <svg
                    className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Claims accordion */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">תביעות</h3>
                    {isLoadingClaims && (
                      <p className="text-sm text-slate-400 py-2">טוען תביעות...</p>
                    )}
                    {!isLoadingClaims && claims.length === 0 && (
                      <p className="text-sm text-slate-500 py-2">אין תביעות</p>
                    )}
                    {!isLoadingClaims && claims.length > 0 && (
                      <div className="space-y-2">
                        {claims.map(c => {
                          const st = STATUS_LABELS[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-600' }
                          return (
                            <div key={c.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800">{c.category}</p>
                                {c.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 text-left">
                                {c.amount_requested != null && (
                                  <span className="text-xs text-slate-600">
                                    ₪{c.amount_requested.toLocaleString()}
                                  </span>
                                )}
                                {c.amount_approved != null && (
                                  <span className="text-xs text-green-700 font-medium">
                                    אושר: ₪{c.amount_approved.toLocaleString()}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                                  {st.label}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
