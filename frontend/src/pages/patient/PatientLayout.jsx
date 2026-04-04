import React from 'react'
import { Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function PatientLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800">מסע מטופל</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            בית
          </Link>
          <span className="text-sm text-slate-600">שלום, {user?.full_name}</span>
          <button onClick={() => { logout(); navigate('/login') }} className="text-sm text-slate-500 hover:text-slate-700">התנתק</button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
