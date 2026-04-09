import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useTranslation } from 'react-i18next'

const STATUS_COLORS = {
  pending: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-500',
}
const STEP_STATUS_COLORS = {
  active: 'bg-blue-500',
  completed: 'bg-green-500',
  skipped: 'bg-slate-300',
  pending: 'bg-slate-200',
}
const DOC_CATEGORY_LABELS = {
  medical: 'רפואי',
  insurance: 'ביטוח',
  financial: 'פיננסי',
  legal: 'משפטי',
  other: 'אחר',
}

export default function PatientSummary() {
  const { t } = useTranslation()
  const [patient, setPatient] = useState(null)
  const [claims, setClaims] = useState([])
  const [documents, setDocuments] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('timeline')

  useEffect(() => {
    axios.get('/api/patients/me')
      .then(res => {
        const p = res.data
        setPatient(p)
        return Promise.all([
          axios.get(`/api/patients/${p.id}/claims`),
          axios.get(`/api/patients/${p.id}/documents`),
          axios.get(`/api/workflows/instances?patient_id=${p.id}`),
        ])
      })
      .then(([c, d, w]) => {
        setClaims(c.data)
        setDocuments(d.data)
        setWorkflows(w.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-20 text-slate-500">{t('common:loading')}</div>

  if (!patient) return (
    <div className="text-center py-20">
      <p className="text-slate-500">{t('patient_portal:no_file')}</p>
      <p className="text-slate-400 text-sm mt-2">{t('patient_portal:no_file_hint')}</p>
    </div>
  )

  const tabs = [
    { key: 'timeline', label: t('patient_portal:tab_timeline') },
    { key: 'claims', label: `${t('patient_portal:tab_claims')} (${claims.filter(c => c.status !== 'draft').length})` },
    { key: 'documents', label: `${t('patient_portal:tab_documents')} (${documents.length})` },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white rounded-2xl p-5">
        <p className="text-blue-200 text-xs">{t('patient_portal:title')}</p>
        <h1 className="text-xl font-bold mt-0.5">{patient.full_name}</h1>
        {patient.diagnosis_details && (
          <p className="text-blue-100 text-sm mt-1">{patient.diagnosis_details}</p>
        )}
        {patient.hmo_name && (
          <p className="text-blue-200 text-xs mt-1">קופ"ח {patient.hmo_name}{patient.hmo_level ? ` — ${patient.hmo_level}` : ''}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {workflows.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{t('patient_portal:no_workflows')}</p>
          ) : (
            workflows.map(wf => (
              <div key={wf.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">{wf.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{wf.template_name}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    wf.status === 'active' ? 'bg-blue-100 text-blue-700' :
                    wf.status === 'completed' ? 'bg-green-100 text-green-700' :
                    wf.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {wf.status === 'active' ? t('patient_portal:status_active') : wf.status === 'completed' ? t('patient_portal:status_completed') : wf.status === 'paused' ? t('patient_portal:status_paused') : wf.status}
                  </span>
                </div>
                {/* Steps timeline */}
                <div className="space-y-1.5">
                  {(wf.steps || []).map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${STEP_STATUS_COLORS[step.status] || 'bg-slate-200'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm ${step.status === 'completed' ? 'line-through text-slate-400' : step.status === 'active' ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                            {step.name}
                          </p>
                          {step.due_date && step.status !== 'completed' && step.status !== 'skipped' && (
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              {new Date(step.due_date).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {wf.progress !== undefined && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{t('patient_portal:progress')}</span>
                      <span>{wf.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${wf.progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Claims tab */}
      {tab === 'claims' && (
        <div className="space-y-2">
          {claims.filter(c => c.status !== 'draft').length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{t('patient_portal:no_claims')}</p>
          ) : (
            claims.filter(c => c.status !== 'draft').map(c => (
              <div key={c.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.source_label}</p>
                  {c.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>}
                  {c.created_at && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(c.created_at).toLocaleDateString('he-IL')}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-500'}`}>
                  {t(`claim_status:${c.status}`) || c.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && (
        <div className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">{t('patient_portal:no_documents')}</p>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="card flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.original_filename || doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.category && (
                      <span className="text-xs text-slate-400">{DOC_CATEGORY_LABELS[doc.category] || doc.category}</span>
                    )}
                    {doc.uploaded_at && (
                      <span className="text-xs text-slate-400">{new Date(doc.uploaded_at).toLocaleDateString('he-IL')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
