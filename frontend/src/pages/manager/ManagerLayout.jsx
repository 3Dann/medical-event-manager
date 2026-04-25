import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useDemoMode } from '../../context/DemoModeContext'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import FeedbackWidget from '../../components/FeedbackWidget'
import { useTranslation } from 'react-i18next'

const navItems = [
  { to: '/manager', tKey: 'nav:dashboard', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', end: true },
  { to: '/manager/doctors', tKey: 'nav:doctors', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { to: '/manager/responsiveness', tKey: 'nav:responsiveness', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { to: '/manager/workflows', tKey: 'nav:workflows', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { to: '/manager/feedback', tKey: 'nav:feedback', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z' },
  { to: '/manager/profile', tKey: 'nav:profile', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z' },
]
const adminNavItem = { to: '/manager/admin', tKey: 'nav:admin', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' }
const landingEditorNavItem = { to: '/manager/landing-editor', tKey: 'nav:landing_editor', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' }

const ROUTE_KEYS = {
  '/manager': 'nav:dashboard',
  '/manager/doctors': 'nav:doctors',
  '/manager/responsiveness': 'nav:responsiveness',
  '/manager/workflows': 'nav:workflows',
  '/manager/feedback': 'nav:feedback',
  '/manager/profile': 'nav:profile',
  '/manager/admin': 'nav:admin',
}
const SUB_KEYS = { insurance: 'ביטוחים', claims: 'תביעות', strategy: 'אסטרטגיה' }

function Breadcrumbs({ pathname }) {
  const { t } = useTranslation()
  const patientMatch = pathname.match(/^\/manager\/patients\/(\d+)\/?(.*)$/)
  if (patientMatch) {
    const sub = patientMatch[2]
    return (
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0">
        <Link to="/manager" className="hover:text-slate-800 transition-colors shrink-0">{t('nav:dashboard')}</Link>
        <span className="text-slate-300">/</span>
        <Link to={`/manager/patients/${patientMatch[1]}`} className="hover:text-slate-800 transition-colors truncate">{t('nav:patients')}</Link>
        {SUB_KEYS[sub] && <>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium truncate">{SUB_KEYS[sub]}</span>
        </>}
      </nav>
    )
  }
  const tKey = ROUTE_KEYS[pathname]
  if (!tKey || pathname === '/manager') return (
    <nav className="text-sm font-medium text-slate-700 truncate">{t('nav:dashboard')}</nav>
  )
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0">
      <Link to="/manager" className="hover:text-slate-800 transition-colors shrink-0">{t('nav:dashboard')}</Link>
      <span className="text-slate-300">/</span>
      <span className="text-slate-700 font-medium truncate">{t(tKey)}</span>
    </nav>
  )
}

export default function ManagerLayout() {
  const { user, logout } = useAuth()
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const canUseDemo = user?.is_admin || user?.demo_mode_allowed
  const [unreadFeedback, setUnreadFeedback] = useState(0)

  const fetchUnread = useCallback(async () => {
    if (!user?.is_admin) return
    try {
      const r = await axios.get('/api/public/feedback/unread-count')
      setUnreadFeedback(r.data.count)
    } catch (_) {}
  }, [user?.is_admin])

  useEffect(() => { fetchUnread() }, [fetchUnread])

  // Reset badge when visiting feedback page
  useEffect(() => {
    if (location.pathname === '/manager/feedback' && unreadFeedback > 0) {
      setUnreadFeedback(0)
    }
  }, [location.pathname])

  // sidebarOpen: collapsed vs expanded (md+ screens)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024)
  // mobileOpen: drawer visible on mobile/small-tablet
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const isRoot = location.pathname === '/manager'

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const SidebarContent = ({ onClose }) => (
    <aside className={`
      ${sidebarOpen ? 'w-64' : 'w-14'}
      bg-slate-800 text-white flex flex-col transition-all duration-200 h-full
    `}>
      {/* Header + toggle */}
      <div className="p-3 flex items-center gap-2 border-b border-slate-700 flex-shrink-0">
        <button
          onClick={() => { setSidebarOpen(o => !o); onClose?.() }}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
          title={sidebarOpen ? t('common:close') : t('common:add')}
        >
          <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={sidebarOpen ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M13 5l7 7-7 7M5 5l7 7-7 7'} />
          </svg>
        </button>
        {sidebarOpen && <span className="font-semibold text-sm truncate">{t('landing:hero_title')}</span>}
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {[...navItems, ...(user?.is_admin ? [adminNavItem, landingEditorNavItem] : [])].map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-colors text-sm
               ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`
            }>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            {sidebarOpen && <span>{t(item.tKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-700 flex-shrink-0 space-y-1">
        {canUseDemo && (
          <button
            onClick={toggleDemoMode}
            title={isDemoMode ? 'כבה מצב הצגה' : 'הפעל מצב הצגה'}
            className={`flex items-center gap-3 w-full px-2.5 py-2.5 rounded-lg text-sm transition-colors ${
              isDemoMode
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            {sidebarOpen && <span>{isDemoMode ? 'מצב הצגה פעיל' : 'מצב הצגה'}</span>}
          </button>
        )}
        {sidebarOpen && (
          <div className="mb-1 px-2.5 py-1.5">
            <p className="text-xs text-slate-400">{t('auth:hello')},</p>
            <p className="text-sm text-white font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {user?.is_admin ? t('nav:admin') : user?.role === 'manager' ? t('auth:role_manager') : t('auth:role_patient')}
            </p>
          </div>
        )}
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full px-2.5 py-2.5 text-slate-300 hover:bg-slate-700 rounded-lg text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {sidebarOpen && <span>{t('auth:logout')}</span>}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Desktop/iPad sidebar (md+) ── */}
      <div className="hidden md:flex flex-shrink-0">
        <SidebarContent />
      </div>

      {/* ── Mobile sidebar drawer + backdrop ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer — slides in from the right (RTL) */}
          <div className="fixed inset-y-0 right-0 z-50 flex md:hidden">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto relative flex flex-col min-w-0">

        {/* Top nav bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-3 md:px-6 py-2.5 flex items-center gap-2 md:gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="פתח תפריט"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            onClick={() => navigate(-1)}
            disabled={isRoot}
            className={`flex items-center gap-1 md:gap-1.5 text-sm px-2 md:px-3 py-1.5 rounded-lg transition-colors
              ${isRoot ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">{t('common:back')}</span>
          </button>
          <span className="text-slate-200 hidden sm:inline">|</span>
          <div className="flex-1 min-w-0">
            <Breadcrumbs pathname={location.pathname} />
          </div>
          <Link to="/"
            className="flex items-center gap-1 md:gap-1.5 text-sm px-2 md:px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="hidden sm:inline">{t('nav:home')}</span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        {/* Demo mode banner */}
        {isDemoMode && (
          <div className="bg-amber-400 text-amber-900 text-center text-sm font-semibold py-1.5 px-4 flex items-center justify-center gap-2 sticky top-[49px] z-10">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            מצב הצגה פעיל — אין שמירת נתונים
          </div>
        )}

        {/* Watermark */}
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-30deg)',
          fontSize: 'clamp(3rem, 10vw, 9rem)', fontWeight: 900,
          color: 'rgba(100, 116, 139, 0.06)',
          letterSpacing: '0.15em', pointerEvents: 'none',
          userSelect: 'none', zIndex: 0, whiteSpace: 'nowrap',
        }}>
          Orly Medical
        </div>

        <div className="flex-1 relative z-10">
          <Outlet />
        </div>

        {/* Lion logo */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none z-10 pb-2 md:pb-4">
          <img src="/roaring-lion-he.png" alt="שאגת הארי"
            className="w-12 md:w-20 h-auto opacity-80 md:opacity-100" />
        </div>
      </main>
    </div>
  )
}
