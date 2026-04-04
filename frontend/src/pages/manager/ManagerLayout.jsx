import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/manager', label: 'לוח בקרה', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', end: true },
  { to: '/manager/doctors', label: 'מאגר רופאים', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { to: '/manager/responsiveness', label: 'ציוני רספונסיביות', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { to: '/manager/feedback', label: 'משובים', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z' },
  { to: '/manager/profile', label: 'פרופיל', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z' },
]

const adminNavItem = { to: '/manager/admin', label: 'ניהול משתמשים', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' }

const ROUTE_LABELS = {
  '/manager': 'לוח בקרה',
  '/manager/doctors': 'מאגר רופאים',
  '/manager/responsiveness': 'ציוני רספונסיביות',
  '/manager/feedback': 'משובים',
  '/manager/profile': 'פרופיל',
  '/manager/admin': 'ניהול משתמשים',
}

const SUB_LABELS = { insurance: 'ביטוחים', claims: 'תביעות', strategy: 'אסטרטגיה' }

function Breadcrumbs({ pathname }) {
  const patientMatch = pathname.match(/^\/manager\/patients\/(\d+)\/?(.*)$/)
  if (patientMatch) {
    const sub = patientMatch[2]
    return (
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/manager" className="hover:text-slate-800 transition-colors">לוח בקרה</Link>
        <span className="text-slate-300">/</span>
        <Link to={`/manager/patients/${patientMatch[1]}`} className="hover:text-slate-800 transition-colors">מטופל</Link>
        {SUB_LABELS[sub] && <>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">{SUB_LABELS[sub]}</span>
        </>}
      </nav>
    )
  }
  const label = ROUTE_LABELS[pathname]
  if (!label || pathname === '/manager') return (
    <nav className="text-sm font-medium text-slate-700">לוח בקרה</nav>
  )
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
      <Link to="/manager" className="hover:text-slate-800 transition-colors">לוח בקרה</Link>
      <span className="text-slate-300">/</span>
      <span className="text-slate-700 font-medium">{label}</span>
    </nav>
  )
}

export default function ManagerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = () => { logout(); navigate('/login') }
  const isRoot = location.pathname === '/manager'

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-14'} bg-slate-800 text-white flex flex-col transition-all duration-200 flex-shrink-0`}>
        {/* Header + toggle */}
        <div className="p-3 flex items-center gap-2 border-b border-slate-700">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
            title={sidebarOpen ? 'כווץ תפריט' : 'הרחב תפריט'}
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M13 5l7 7-7 7M5 5l7 7-7 7'} />
            </svg>
          </button>
          {sidebarOpen && <span className="font-semibold text-sm truncate">ניהול אירוע רפואי</span>}
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {[...navItems, ...(user?.is_admin ? [adminNavItem] : [])].map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-colors text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-700">
          {sidebarOpen && (
            <div className="mb-2 px-2.5 py-1.5">
              <p className="text-xs text-slate-400">מחובר כ:</p>
              <p className="text-sm text-white font-medium truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user?.is_admin ? 'מנהל ראשי' : user?.role === 'manager' ? 'מנהל אירוע רפואי' : 'מטופל'}</p>
            </div>
          )}
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-2.5 py-2.5 text-slate-300 hover:bg-slate-700 rounded-lg text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {sidebarOpen && <span>התנתקות</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative flex flex-col">

        {/* Top nav bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            disabled={isRoot}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${isRoot ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            חזרה
          </button>
          <span className="text-slate-200">|</span>
          <Breadcrumbs pathname={location.pathname} />
        </div>

        {/* Watermark */}
        <div
          style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            fontSize: '9rem', fontWeight: 900,
            color: 'rgba(100, 116, 139, 0.06)',
            letterSpacing: '0.15em', pointerEvents: 'none',
            userSelect: 'none', zIndex: 0, whiteSpace: 'nowrap',
          }}
        >
          Orly Medical
        </div>

        <div className="flex-1">
          <Outlet />
        </div>

        {/* Roaring Lion logo - bottom center */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none z-10 pb-4">
          <img src="/roaring-lion-he.png" alt="שאגת הארי" className="w-20 h-auto" />
        </div>
      </main>
    </div>
  )
}
