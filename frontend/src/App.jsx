import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DevProvider } from './context/DevContext'
import { DemoModeProvider } from './context/DemoModeContext'
import DevGate from './components/DevGate'
import './i18n/index.js'
import { RTL_LANGS } from './i18n/index.js'

// Auth
import LoginPage from './pages/LoginPage'

// Public
import ProgressPage from './pages/ProgressPage'
import LandingPage from './pages/LandingPage'

// Manager pages
import ManagerLayout from './pages/manager/ManagerLayout'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import PatientDetail from './pages/manager/PatientDetail'
import PatientInsurance from './pages/manager/PatientInsurance'
import PatientClaims from './pages/manager/PatientClaims'
import PatientStrategy from './pages/manager/PatientStrategy'
import PatientDocuments from './pages/manager/PatientDocuments'
import PatientMedications from './pages/manager/PatientMedications'
import ResponsivenessPage from './pages/manager/ResponsivenessPage'
import FeedbackInbox from './pages/manager/FeedbackInbox'
import DoctorsDatabase from './pages/manager/DoctorsDatabase'
import ProfilePage from './pages/manager/ProfilePage'
import AdminPage from './pages/manager/AdminPage'
import WorkflowsPage from './pages/manager/WorkflowsPage'
import IntakeWizard from './pages/manager/IntakeWizard'
import LandingEditorPage from './pages/manager/LandingEditorPage'
import FeedbackSubmitPage from './pages/manager/FeedbackSubmitPage'

// Patient pages
import PatientLayout from './pages/patient/PatientLayout'
import PatientSummary from './pages/patient/PatientSummary'

function ProtectedRoute({ children, role, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500">טוען...</div>
  if (!user) return <Navigate to="/" state={{ openLogin: true }} replace />
  const effectiveRole = user.role === 'admin' ? 'manager' : user.role
  if (role && effectiveRole !== role) return <Navigate to={effectiveRole === 'manager' ? '/manager' : '/patient'} replace />
  if (adminOnly && !user.is_admin) return <Navigate to="/manager" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" state={{ openLogin: true }} replace />} />

      {/* Manager routes */}
      <Route path="/manager" element={<ProtectedRoute role="manager"><ManagerLayout /></ProtectedRoute>}>
        <Route index element={<ManagerDashboard />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="patients/:id/insurance" element={<PatientInsurance />} />
        <Route path="patients/:id/claims" element={<PatientClaims />} />
        <Route path="patients/:id/strategy" element={<PatientStrategy />} />
        <Route path="patients/:id/documents" element={<PatientDocuments />} />
        <Route path="patients/:id/medications" element={<PatientMedications />} />
        <Route path="doctors" element={<DoctorsDatabase />} />
        <Route path="responsiveness" element={<ResponsivenessPage />} />
        <Route path="feedback" element={<FeedbackInbox />} />
        <Route path="feedback/submit" element={<FeedbackSubmitPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="patients/new" element={<IntakeWizard />} />
        <Route path="admin" element={<ProtectedRoute role="manager" adminOnly><AdminPage /></ProtectedRoute>} />
        <Route path="landing-editor" element={<ProtectedRoute role="manager" adminOnly><LandingEditorPage /></ProtectedRoute>} />
      </Route>

      {/* Patient routes */}
      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>}>
        <Route index element={<PatientSummary />} />
      </Route>

      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function LangDirectionSync() {
  useEffect(() => {
    const lang = localStorage.getItem('app_language') || 'he'
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [])
  return null
}

export default function App() {
  return (
    <DevProvider>
      <DevGate>
        <AuthProvider>
          <DemoModeProvider>
            <BrowserRouter>
              <LangDirectionSync />
              <AppRoutes />
            </BrowserRouter>
          </DemoModeProvider>
        </AuthProvider>
      </DevGate>
    </DevProvider>
  )
}
