import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SkeletonCard } from '../../components/Skeleton'
import { useToast } from '../../hooks/useToast'
import AppToast from '../../components/AppToast'
import { useConfirm } from '../../components/ConfirmDialog'
const DIAGNOSIS_COLORS = { yes: 'badge-blue', no: 'badge-gray', pending: 'badge-yellow' }
const SESSION_DRAFT_KEY = 'intake_wizard_draft'
const LOCAL_DRAFT_KEY   = 'intake_draft_patient_id'

function hasSessionDraft() {
  try {
    const raw = sessionStorage.getItem(SESSION_DRAFT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return !!(parsed?.full_name?.trim())
  } catch { return false }
}

export default function ManagerDashboard() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [globalInsights, setGlobalInsights] = useState(null)
  const [sessionDraft, setSessionDraft] = useState(false)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { toast, showToast, dismissToast } = useToast()
  const [confirmDelete, ConfirmUI] = useConfirm()

  useEffect(() => {
    setSessionDraft(hasSessionDraft())
    const controller = new AbortController()
    fetchPatients(controller.signal)
    fetchInsights(controller.signal)
    return () => controller.abort()
  }, [])

  const fetchPatients = async (signal) => {
    try {
      const res = await axios.get('/api/patients', { signal })
      setPatients(res.data)
    } catch (e) {
      if (!axios.isCancel(e)) showToast('שגיאת שרת. נסה שוב.')
    } finally { setLoading(false) }
  }

  const fetchInsights = async (signal) => {
    try {
      const res = await axios.get('/api/learning/insights', { signal })
      setGlobalInsights(res.data)
    } catch (e) {
      if (!axios.isCancel(e)) {}
    }
  }

  const handleDelete = async (id) => {
    const ok = await confirmDelete({
      title: 'מחיקת מטופל',
      message: 'פעולה זו בלתי הפיכה. כל הנתונים, המסמכים והתביעות של המטופל יימחקו לצמיתות.',
      confirmLabel: 'מחק',
      danger: true,
    })
    if (!ok) return
    try { await axios.delete(`/api/patients/${id}`); fetchPatients() }
    catch (e) { showToast('שגיאת שרת. נסה שוב.') }
  }

  const topInsurer = globalInsights?.approval_rates?.[0]
  const hasInsights = globalInsights && globalInsights.total_claims_analyzed > 0

  return (
    <div className="p-4 md:p-8">
      {toast && <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />}
      {ConfirmUI}
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">{t('dashboard:title')}</h1>
          <p className="text-slate-500 mt-1">{t('dashboard:subtitle')}</p>
        </div>
        <button onClick={() => navigate('/manager/patients/new')} className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('dashboard:new_patient')}
        </button>
      </header>



      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-5 md:mb-6">
        <div className="card">
          <p className="text-sm text-slate-500">{t('dashboard:total_patients')}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{patients.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('dashboard:with_diagnosis')}</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{patients.filter(p => p.diagnosis_status === 'yes').length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('dashboard:pending')}</p>
          <p className="text-3xl font-bold text-yellow-600 mt-1">{patients.filter(p => p.diagnosis_status === 'pending').length}</p>
        </div>
      </div>

      {/* AI Insights widget */}
      {hasInsights && (
        <div className="mb-6 rounded-xl border border-blue-100 bg-gradient-to-l from-blue-50 to-indigo-50 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <p className="font-semibold text-slate-800 text-sm">
                {t('dashboard:ai_analyzed', { count: globalInsights.total_claims_analyzed })}
                {globalInsights.total_patients > 0 && ` ${t('dashboard:ai_from_patients', { count: globalInsights.total_patients })}`}
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                {topInsurer && (
                  <span className="text-xs text-slate-600">
                    🏆 {t('dashboard:top_insurer')}: <span className="font-medium text-green-700">{topInsurer.company_name} ({topInsurer.approval_rate}%)</span>
                  </span>
                )}
                {globalInsights.common_gaps?.[0] && (
                  <span className="text-xs text-slate-600">
                    ⚠️ {t('dashboard:top_gap')}: <span className="font-medium text-red-600">{globalInsights.common_gaps[0].category_label}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-slate-600">
              {globalInsights.total_claims - globalInsights.total_claims_analyzed > 0
                ? t('dashboard:open_claims', { count: globalInsights.total_claims - globalInsights.total_claims_analyzed })
                : t('dashboard:all_analyzed')}
            </p>
          </div>
        </div>
      )}

      {/* No insights yet — subtle hint */}
      {globalInsights && !hasInsights && patients.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-3 text-sm text-slate-500">
          <span>🧠</span>
          <span>{t('dashboard:insights_hint')}</span>
        </div>
      )}


      {/* Session draft — form data in progress, not yet saved to DB */}
      {sessionDraft && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-blue-500 text-lg">✏️</span>
            <div>
              <p className="font-semibold text-blue-800 text-sm">יש אינטייק שלא הסתיים</p>
              <p className="text-blue-600 text-xs">המשך ממקום שעצרת — הנתונים שמורים זמנית בדפדפן</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { sessionStorage.removeItem(SESSION_DRAFT_KEY); localStorage.removeItem(LOCAL_DRAFT_KEY); setSessionDraft(false) }}
              className="text-xs text-blue-400 hover:text-blue-600 px-2 py-1"
            >
              בטל
            </button>
            <button
              onClick={() => navigate('/manager/patients/new')}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
            >
              המשך אינטייק ←
            </button>
          </div>
        </div>
      )}

      {/* Incomplete intakes — saved to DB */}
      {!loading && patients.filter(p => !p.intake_completed).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-amber-800">אינטייקים לא הושלמו</h2>
          </div>
          <div className="space-y-2">
            {patients.filter(p => !p.intake_completed).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-amber-700 font-semibold text-sm">{p.full_name[0]}</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{p.full_name}</p>
                    <p className="text-xs text-amber-700">שלב {(p.intake_step || 0) + 1} מתוך 7 — לא הושלם</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/manager/patients/new?resume=${p.id}`)}
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 font-medium whitespace-nowrap"
                >
                  המשך אינטייק ←
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patients list */}
      {loading ? (
        <div className="space-y-3 mt-4">
          {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : patients.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">{t('dashboard:no_patients')}</p>
          <p className="text-slate-600 text-sm mt-1">{t('dashboard:no_patients_hint')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {patients.map(p => (
            <button
              key={p.id}
              className="card hover:shadow-md transition-shadow text-right w-full"
              onClick={() => navigate(`/manager/patients/${p.id}`)}
              aria-label={`פתח תיק מטופל: ${p.full_name}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">{p.full_name[0]}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{p.full_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={DIAGNOSIS_COLORS[p.diagnosis_status]}>{t(`diagnosis:${p.diagnosis_status}`)}</span>
                      {p.diagnosis_details && <span className="text-xs text-slate-500 truncate max-w-xs">{p.diagnosis_details}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); navigate(`/manager/patients/${p.id}/strategy`) }}
                    className="text-xs bg-blue-50 text-blue-600 px-2 md:px-3 py-1.5 rounded-lg hover:bg-blue-100 whitespace-nowrap">
                    {t('dashboard:strategy')}
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                    className="text-xs bg-red-50 text-red-500 px-2 md:px-3 py-1.5 rounded-lg hover:bg-red-100">
                    {t('common:delete')}
                  </button>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
