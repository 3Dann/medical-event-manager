import { useState, useEffect } from 'react'
import { useParams, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import RedFlagsBanner from '../../components/RedFlagsBanner'

export default function PatientLayout() {
  const { id }    = useParams()
  const { t }     = useTranslation('nav')
  const [patient, setPatient] = useState(null)

  useEffect(() => {
    axios.get(`/api/patients/${id}`)
      .then(r => setPatient(r.data))
      .catch(() => {})
  }, [id])

  const tabs = [
    { to: '',              label: t('details_nodes'),  end: true },
    { to: 'insurance',     label: t('insurance') },
    { to: 'claims',        label: t('claims') },
    { to: 'financial-map', label: t('financial_map') },
    { to: 'strategy',      label: t('strategy') },
    { to: 'medications',   label: t('medications') },
    { to: 'documents',     label: t('documents') },
    { to: 'meetings',      label: t('meetings') },
    { to: 'nsclc',         label: 'מסע NSCLC' },
  ]

  return (
    <div dir="rtl">
      {/* Patient header */}
      <div className="px-4 md:px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-100">
        <h1 className="text-2xl font-bold text-slate-800">
          {patient?.full_name ?? '...'}
        </h1>
        <p className="text-slate-500 text-sm">
          {patient?.id_number ? `ת.ז.: ${patient.id_number}` : ' '}
        </p>
      </div>

      {/* Tab bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={`/manager/patients/${id}${tab.to ? '/' + tab.to : ''}`}
              end={tab.end}
              className={({ isActive }) =>
                `px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors
                 ${isActive
                   ? 'border-blue-600 text-blue-600'
                   : 'border-transparent text-slate-500 hover:text-slate-800'}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Red flags banner */}
      <RedFlagsBanner patientId={id} />

      {/* Tab content */}
      <Outlet />
    </div>
  )
}
