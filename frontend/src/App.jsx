import React, { useEffect, useState, lazy, Suspense, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import { DevProvider } from './context/DevContext'
import { DemoModeProvider } from './context/DemoModeContext'
import DevGate from './components/DevGate'
import ErrorBoundary from './components/ErrorBoundary'
import './i18n/index.js'
import i18n from './i18n/index.js'

// Always-loaded (critical path)
import LandingPage from './pages/LandingPage'
import NotFoundPage from './pages/NotFoundPage'
import AccessibilityPage from './pages/AccessibilityPage'

// Lazy-loaded pages (loaded only when navigated to)
const LoginPage          = lazy(() => import('./pages/LoginPage'))
const ProgressPage       = lazy(() => import('./pages/ProgressPage'))
const ManagerLayout      = lazy(() => import('./pages/manager/ManagerLayout'))
const ManagerDashboard   = lazy(() => import('./pages/manager/ManagerDashboard'))
const ManagerPatientLayout = lazy(() => import('./pages/manager/PatientLayout'))
const PatientDetail      = lazy(() => import('./pages/manager/PatientDetail'))
const PatientClaims      = lazy(() => import('./pages/manager/PatientClaims'))
const PatientStrategy    = lazy(() => import('./pages/manager/PatientStrategy'))
const PatientDocuments   = lazy(() => import('./pages/manager/PatientDocuments'))
const PatientMedications = lazy(() => import('./pages/manager/PatientMedications'))
const PatientInsurancePolicies = lazy(() => import('./pages/manager/PatientInsurancePolicies'))
const PatientFinancialMap = lazy(() => import('./pages/manager/PatientFinancialMap'))
const PatientMeetings    = lazy(() => import('./pages/manager/PatientMeetings'))
const NSCLCPathwayTab    = lazy(() => import('./pages/manager/NSCLCPathwayTab'))
const ResponsivenessPage = lazy(() => import('./pages/manager/ResponsivenessPage'))
const FeedbackInbox      = lazy(() => import('./pages/manager/FeedbackInbox'))
const DoctorsDatabase    = lazy(() => import('./pages/manager/DoctorsDatabase'))
const ProfilePage        = lazy(() => import('./pages/manager/ProfilePage'))
const AdminPage          = lazy(() => import('./pages/manager/AdminPage'))
const WorkflowsPage      = lazy(() => import('./pages/manager/WorkflowsPage'))
const ReportsPage        = lazy(() => import('./pages/manager/ReportsPage'))
const IntakeWizard       = lazy(() => import('./pages/manager/IntakeWizard'))
const LandingEditorPage  = lazy(() => import('./pages/manager/LandingEditorPage'))
const FeedbackSubmitPage = lazy(() => import('./pages/manager/FeedbackSubmitPage'))
const AdminDashboardPage = lazy(() => import('./pages/manager/AdminDashboardPage'))
const MyDay              = lazy(() => import('./pages/manager/MyDay'))
const PatientIntakeTab   = lazy(() => import('./pages/manager/PatientIntakeTab'))
const DemoPatientPortal  = lazy(() => import('./pages/demo/DemoPatientPortal'))
const DemoBrokerPortal   = lazy(() => import('./pages/demo/DemoBrokerPortal'))
const PatientLayout      = lazy(() => import('./pages/patient/PatientLayout'))
const PatientSummary     = lazy(() => import('./pages/patient/PatientSummary'))
const PatientLoginPage      = lazy(() => import('./pages/patient/PatientLoginPage'))
const ChangePasswordPage    = lazy(() => import('./pages/ChangePasswordPage'))
const ResetPasswordPage     = lazy(() => import('./pages/ResetPasswordPage'))
const BrokerPortal       = lazy(() => import('./pages/broker/BrokerPortal'))

function ScrollToTop() {
  const { pathname } = useLocation()
  const topLevel = pathname.split('/').slice(0, 4).join('/')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [topLevel])
  return null
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen text-slate-400" aria-live="polite" aria-busy="true">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-sm">טוען...</span>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, role, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500">טוען...</div>
  if (!user) return <Navigate to={role === 'patient' ? '/patient-login' : '/'} state={{ openLogin: true }} replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  const effectiveRole = user.role === 'admin' ? 'manager' : user.role
  if (role && effectiveRole !== role) {
    const fallback = effectiveRole === 'manager' ? '/manager'
      : effectiveRole === 'broker' ? '/broker'
      : '/patient'
    return <Navigate to={fallback} replace />
  }
  if (adminOnly && !user.is_admin) return <Navigate to="/manager" replace />
  return children
}

const ADMIN_ROLE = 'manager'

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" state={{ openLogin: true }} replace />} />
        <Route path="/negishot" element={<AccessibilityPage />} />

        {/* Manager routes */}
        <Route path="/manager" element={<ProtectedRoute role={ADMIN_ROLE}><ManagerLayout /></ProtectedRoute>}>
          <Route index element={<ManagerDashboard />} />
          <Route path="patients/:id" element={<ManagerPatientLayout />}>
            <Route index element={<PatientDetail />} />
            <Route path="insurance"     element={<PatientInsurancePolicies />} />
            <Route path="claims"        element={<PatientClaims />} />
            <Route path="strategy"      element={<PatientStrategy />} />
            <Route path="documents"     element={<PatientDocuments />} />
            <Route path="medications"   element={<PatientMedications />} />
            <Route path="financial-map" element={<PatientFinancialMap />} />
            <Route path="meetings"      element={<PatientMeetings />} />
            <Route path="nsclc"         element={<NSCLCPathwayTab />} />
            <Route path="intake"        element={<PatientIntakeTab />} />
          </Route>
          <Route path="doctors" element={<DoctorsDatabase />} />
          <Route path="responsiveness" element={<ResponsivenessPage />} />
          <Route path="feedback" element={<FeedbackInbox />} />
          <Route path="feedback/submit" element={<FeedbackSubmitPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="my-day"       element={<MyDay />} />
          <Route path="patients/new" element={<IntakeWizard />} />
          <Route path="demo/patient" element={<DemoPatientPortal />} />
          <Route path="demo/broker"  element={<DemoBrokerPortal />} />
          <Route path="admin" element={<ProtectedRoute role={ADMIN_ROLE} adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="admin-dashboard" element={<ProtectedRoute role={ADMIN_ROLE} adminOnly><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="landing-editor" element={<ProtectedRoute role={ADMIN_ROLE} adminOnly><LandingEditorPage /></ProtectedRoute>} />
        </Route>

        {/* Broker routes */}
        <Route path="/broker" element={<ProtectedRoute role="broker"><BrokerPortal /></ProtectedRoute>} />

        {/* Patient routes */}
        <Route path="/patient-login" element={<PatientLoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/patient" element={<ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>}>
          <Route index element={<PatientSummary />} />
        </Route>

        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

function GlobalErrorToast() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    const handler = (e) => {
      setMsg(e.detail)
      setTimeout(() => setMsg(null), 5000)
    }
    window.addEventListener('api-server-error', handler)
    window.addEventListener('api-rate-limited', handler)
    window.addEventListener('api-forbidden', handler)
    return () => {
      window.removeEventListener('api-server-error', handler)
      window.removeEventListener('api-rate-limited', handler)
      window.removeEventListener('api-forbidden', handler)
    }
  }, [])
  if (!msg) return null
  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[9999] bg-red-600 text-white rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-3 animate-fade-in" dir="rtl">
      <span className="text-2xl flex-shrink-0">⚠️</span>
      <span className="font-medium">{msg}</span>
      <button onClick={() => setMsg(null)} className="mr-auto text-white/70 hover:text-white text-xl leading-none">×</button>
    </div>
  )
}

function IdleWatcher() {
  const { user, logout } = useAuth()
  const handleIdle = useCallback(() => {
    if (user) logout()
  }, [user, logout])
  useIdleTimeout(handleIdle)
  return null
}

function LangDirectionSync() {
  useEffect(() => {
    // Direction is ALWAYS RTL — the system layout is Hebrew/RTL regardless of content language
    document.documentElement.dir = 'rtl'
    document.documentElement.lang = i18n.language || localStorage.getItem('app_language') || 'he'
    // Update lang attribute on language change (for accessibility/fonts) but NOT direction
    const onLangChange = (lang) => { document.documentElement.lang = lang }
    i18n.on('languageChanged', onLangChange)
    return () => i18n.off('languageChanged', onLangChange)
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
              <ScrollToTop />
              <LangDirectionSync />
              <IdleWatcher />
              {/* Skip to main content — IS 5568 requirement */}
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[9999] focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
              >
                דלג לתוכן הראשי
              </a>
              <GlobalErrorToast />
              <ErrorBoundary>
                <main id="main-content">
                  <AppRoutes />
                </main>
              </ErrorBoundary>
            </BrowserRouter>
          </DemoModeProvider>
        </AuthProvider>
      </DevGate>
    </DevProvider>
  )
}
