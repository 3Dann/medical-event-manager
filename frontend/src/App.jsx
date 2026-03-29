import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// Auth
import LoginPage from './pages/LoginPage'

// Manager pages
import ManagerLayout from './pages/manager/ManagerLayout'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import PatientDetail from './pages/manager/PatientDetail'
import PatientInsurance from './pages/manager/PatientInsurance'
import PatientClaims from './pages/manager/PatientClaims'
import PatientStrategy from './pages/manager/PatientStrategy'
import ResponsivenessPage from './pages/manager/ResponsivenessPage'

// Patient pages
import PatientLayout from './pages/patient/PatientLayout'
import PatientSummary from './pages/patient/PatientSummary'

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500">טוען...</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'manager' ? '/manager' : '/patient'} replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'manager' ? '/manager' : '/patient'} replace /> : <LoginPage />} />

      {/* Manager routes */}
      <Route path="/manager" element={<ProtectedRoute role="manager"><ManagerLayout /></ProtectedRoute>}>
        <Route index element={<ManagerDashboard />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="patients/:id/insurance" element={<PatientInsurance />} />
        <Route path="patients/:id/claims" element={<PatientClaims />} />
        <Route path="patients/:id/strategy" element={<PatientStrategy />} />
        <Route path="responsiveness" element={<ResponsivenessPage />} />
      </Route>

      {/* Patient routes */}
      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>}>
        <Route index element={<PatientSummary />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
