import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import FundManagementPanel from './FundManagementPanel'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../hooks/useToast'
import AppToast from '../../components/AppToast'
import { useConfirm } from '../../components/ConfirmDialog'

export default function AdminPage() {
  const { t } = useTranslation('admin')
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const { toast, showToast, dismissToast } = useToast()
  const [confirm, ConfirmUI] = useConfirm()
  const isDev = currentUser?.is_admin
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetResult, setResetResult] = useState(null)
  const [actionStatus, setActionStatus] = useState({})

  // Registrations badge
  const [pendingRegCount, setPendingRegCount] = useState(0)

  useEffect(() => {
    if (!currentUser?.is_admin) return
    const ctrl = new AbortController()
    axios.get('/api/auth/admin/registrations?status=pending', { signal: ctrl.signal })
      .then(r => setPendingRegCount(Array.isArray(r.data) ? r.data.length : 0))
      .catch(e => { if (!axios.isCancel(e)) {} })
    return () => ctrl.abort()
  }, [currentUser])

  // Permissions state
  const [tab, setTab] = useState('users') // 'users' | 'permissions' | 'activity' | 'registrations'
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [permsLoading, setPermsLoading] = useState(false)
  const [grantManagerId, setGrantManagerId] = useState('')
  const [permMsg, setPermMsg] = useState(null)

  // Activity log state
  const [activityLogs, setActivityLogs] = useState([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [activityUserFilter, setActivityUserFilter] = useState('')
  const [activityActionFilter, setActivityActionFilter] = useState('')
  const [activityDateFrom, setActivityDateFrom] = useState('')
  const [activityDateTo, setActivityDateTo] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    fetchUsers(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  const fetchUsers = async (signal) => {
    setLoading(true)
    try { const res = await axios.get('/api/admin/users', { signal }); setUsers(res.data) }
    catch (e) { if (!axios.isCancel(e)) showToast('שגיאת שרת. נסה שוב.') }
    finally { setLoading(false) }
  }

  const fetchPatients = async () => {
    try { const res = await axios.get('/api/admin/patients'); setPatients(res.data) }
    catch (e) { showToast('שגיאת שרת. נסה שוב.') }
  }

  useEffect(() => {
    if (tab === 'permissions') fetchPatients()
    if (tab === 'activity') fetchActivity(1)
  }, [tab])

  const fetchActivity = async (page = activityPage, overrides = {}) => {
    setActivityLoading(true)
    try {
      const uf  = 'user'   in overrides ? overrides.user   : activityUserFilter
      const af  = 'action' in overrides ? overrides.action : activityActionFilter
      const df  = 'from'   in overrides ? overrides.from   : activityDateFrom
      const dt  = 'to'     in overrides ? overrides.to     : activityDateTo
      const params = { page, limit: 50 }
      if (uf) params.user_id     = uf
      if (af) params.action_type = af
      if (df) params.date_from   = df
      if (dt) params.date_to     = dt + 'T23:59:59'
      const res = await axios.get('/api/admin/activity', { params })
      setActivityLogs(res.data.items)
      setActivityTotal(res.data.total)
      setActivityPage(page)
    } catch (e) { showToast('שגיאת שרת. נסה שוב.') }
    finally { setActivityLoading(false) }
  }

  const fetchPermissions = async (patientId) => {
    setPermsLoading(true)
    try {
      const res = await axios.get(`/api/admin/patients/${patientId}/permissions`)
      setPermissions(res.data)
    } catch (e) { showToast('שגיאת שרת. נסה שוב.') }
    finally { setPermsLoading(false) }
  }

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient)
    setPermissions([])
    setGrantManagerId('')
    setPermMsg(null)
    fetchPermissions(patient.id)
  }

  const handleGrant = async () => {
    if (!grantManagerId || !selectedPatient) return
    try {
      await axios.post(`/api/admin/patients/${selectedPatient.id}/permissions`, { manager_id: parseInt(grantManagerId) })
      setPermMsg({ ok: true, text: 'הרשאה הוענקה' })
      setGrantManagerId('')
      fetchPermissions(selectedPatient.id)
    } catch (e) {
      setPermMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' })
    }
  }

  const handleRevoke = async (managerId) => {
    try {
      await axios.delete(`/api/admin/patients/${selectedPatient.id}/permissions/${managerId}`)
      setPermMsg({ ok: true, text: 'הרשאה בוטלה' })
      fetchPermissions(selectedPatient.id)
    } catch (e) {
      setPermMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה' })
    }
  }

  const setStatus = (userId, ok, msg) => {
    setActionStatus(prev => ({ ...prev, [userId]: { ok, msg } }))
    setTimeout(() => setActionStatus(prev => { const n = { ...prev }; delete n[userId]; return n }), 4000)
  }

  const handleRoleChange = async (user, newRole) => {
    try {
      await axios.put(`/api/admin/users/${user.id}/role`, { role: newRole, is_admin: user.is_admin })
      setStatus(user.id, true, 'תפקיד עודכן')
      fetchUsers()
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }

  const handleAdminToggle = async (user) => {
    try {
      await axios.put(`/api/admin/users/${user.id}/role`, { role: user.role, is_admin: !user.is_admin })
      setStatus(user.id, true, !user.is_admin ? 'הוגדר כאדמין' : 'הוסרה הרשאת אדמין')
      fetchUsers()
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }


  const handleReset = async (user) => {
    try {
      const res = await axios.post(`/api/admin/users/${user.id}/reset`)
      setResetResult({ userId: user.id, name: user.full_name, message: res.data.message, emailSent: res.data.email_sent })
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }

  const handleDeleteData = async (user) => {
    try {
      const res = await axios.post(`/api/admin/users/${user.id}/delete-data`)
      setStatus(user.id, true, res.data.message)
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }

  const handleTogglePreserve = async (user) => {
    try {
      await axios.put(`/api/admin/users/${user.id}/preserve-data`)
      fetchUsers()
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }

  const handleToggleDemoMode = async (user) => {
    try {
      await axios.put(`/api/admin/users/${user.id}/demo-mode`)
      fetchUsers()
    } catch (err) { setStatus(user.id, false, err.response?.data?.detail || 'שגיאה') }
  }

  // Permissions state
  const [permEditorUserId, setPermEditorUserId] = useState(null)
  const [permEditorValues, setPermEditorValues] = useState([])
  const [permSaving, setPermSaving] = useState(false)

  const PERM_OPTIONS = [
    { key: 'create_patient',   label: 'יצירת תיק מטופל',         group: 'עבודה' },
    { key: 'manage_claims',    label: 'ניהול תביעות',              group: 'עבודה' },
    { key: 'manage_workflows', label: 'הפעלת זרימות עבודה',       group: 'עבודה' },
    { key: 'download_docs',    label: 'הורדת מסמכים',             group: 'ייצוא' },
    { key: 'export_pdf',       label: 'ייצוא PDF',                 group: 'ייצוא' },
    { key: 'export_excel',     label: 'ייצוא Excel',               group: 'ייצוא' },
    { key: 'view_financials',  label: 'צפייה בנתונים פיננסיים',  group: 'נתונים' },
  ]

  const PERM_PRESETS = [
    {
      key: 'senior',
      label: 'מלווה בכיר',
      desc: 'כל ההרשאות',
      color: 'purple',
      perms: ['create_patient','manage_claims','manage_workflows','download_docs','export_pdf','export_excel','view_financials'],
    },
    {
      key: 'standard',
      label: 'מלווה סטנדרטי',
      desc: 'עבודה + הורדות',
      color: 'blue',
      perms: ['create_patient','manage_claims','manage_workflows','download_docs','export_pdf'],
    },
    {
      key: 'readonly',
      label: 'צופה בלבד',
      desc: 'נתונים פיננסיים בלבד',
      color: 'slate',
      perms: ['view_financials'],
    },
  ]

  const openPermEditor = (user) => {
    setPermEditorUserId(user.id)
    setPermEditorValues(Array.isArray(user.permissions) ? [...user.permissions] : [])
  }

  const applyPreset = (preset) => {
    setPermEditorValues([...preset.perms])
  }

  const savePerms = async (userId) => {
    setPermSaving(true)
    try {
      await axios.patch(`/api/admin/users/${userId}/permissions`, { permissions: permEditorValues })
      setStatus(userId, true, 'הרשאות עודכנו')
      fetchUsers()
      setPermEditorUserId(null)
    } catch (e) {
      setStatus(userId, false, e.response?.data?.detail || 'שגיאה בשמירה')
    } finally {
      setPermSaving(false)
    }
  }

  const managers = users.filter(u => u.role === 'manager' && !u.is_admin)

  // ── Create user ──────────────────────────────────────────────────────────────
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'manager', is_admin: false, permissions: [] })
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState(null)

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setCreateSaving(true)
    setCreateError(null)
    try {
      await axios.post('/api/admin/users', createForm)
      setShowCreateUser(false)
      setCreateForm({ full_name: '', email: '', password: '', role: 'manager', is_admin: false, permissions: [] })
      showToast('משתמש נוצר בהצלחה')
      fetchUsers()
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'שגיאה ביצירת משתמש')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Delete account ───────────────────────────────────────────────────────────
  const handleDeleteAccount = async (user) => {
    const ok = await confirm({
      title: 'מחיקת חשבון',
      message: `האם למחוק לצמיתות את החשבון של ${user.full_name}? פעולה זו תמחק גם את כל תיקי המטופלים שלו.`,
      confirmLabel: 'מחק חשבון',
      danger: true,
    })
    if (!ok) return
    try {
      await axios.delete(`/api/admin/users/${user.id}`)
      showToast(`החשבון של ${user.full_name} נמחק`)
      fetchUsers()
    } catch (e) {
      showToast(e.response?.data?.detail || 'שגיאה במחיקה')
    }
  }

  // ── Email test ───────────────────────────────────────────────────────────────
  const [emailTesting, setEmailTesting] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState(null)

  const handleTestEmail = async () => {
    setEmailTesting(true)
    setEmailTestResult(null)
    try {
      const res = await axios.post('/api/admin/test-email')
      setEmailTestResult({ ok: res.data.ok, message: res.data.message })
    } catch (e) {
      setEmailTestResult({ ok: false, message: e.response?.data?.detail || 'שגיאת שרת' })
    } finally {
      setEmailTesting(false)
    }
  }

  return (
    <div className="p-4 md:p-8" dir="rtl">
      <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />
      {ConfirmUI}
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('title')}</h1>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 mt-4 border-b border-slate-200 flex-wrap items-end">
        {[
          { key: 'users',       label: t('tab_users') },
          { key: 'permissions', label: t('tab_permissions') },
          { key: 'activity',    label: t('tab_activity') },
          { key: 'sessions',    label: 'Sessions' },
          { key: 'funds',       label: t('tab_funds') },
          { key: 'registrations', label: 'בקשות רישום', badge: pendingRegCount },
        ].map(tb => (
          <button key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === tb.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tb.label}
            {tb.badge > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full">{tb.badge > 9 ? '9+' : tb.badge}</span>
            )}
          </button>
        ))}
        {isDev && (
          <button
            onClick={() => navigate('/manager/landing-editor')}
            className="pb-2 px-4 text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-700 hover:border-amber-400 transition-colors ms-auto"
          >
            ✏️ עריכת דף נחיתה
          </button>
        )}
      </div>

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <>
          {/* Email test banner */}
          <div className="mb-5 flex flex-wrap items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">בדיקת מערכת מייל</p>
              <p className="text-xs text-slate-500 mt-0.5">שלח מייל בדיקה לאימייל שלך כדי לאמת שהגדרות Resend תקינות</p>
            </div>
            <button
              onClick={handleTestEmail}
              disabled={emailTesting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {emailTesting ? (
                <><span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />בודק...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>בדוק מייל</>
              )}
            </button>
            {emailTestResult && (
              <div className={`w-full text-xs px-3 py-2 rounded-lg mt-1 ${emailTestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {emailTestResult.ok ? '✅' : '❌'} {emailTestResult.message}
                <button onClick={() => setEmailTestResult(null)} className="mr-2 opacity-60 hover:opacity-100">✕</button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-6">
            <p className="text-slate-500 text-sm">{t('users_registered', { count: users.length })}</p>
            <button
              onClick={() => setShowCreateUser(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              הוסף משתמש
            </button>
          </div>

          {/* Create user modal */}
          {showCreateUser && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-slate-800">יצירת משתמש חדש</h2>
                  <button onClick={() => { setShowCreateUser(false); setCreateError(null) }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">שם מלא</label>
                    <input className="input w-full" required value={createForm.full_name} onChange={e => setCreateForm(f => ({...f, full_name: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">אימייל</label>
                    <input type="email" className="input w-full" required value={createForm.email} onChange={e => setCreateForm(f => ({...f, email: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">סיסמה זמנית (מינימום 8 תווים)</label>
                    <input type="password" className="input w-full" required minLength={8} value={createForm.password} onChange={e => setCreateForm(f => ({...f, password: e.target.value}))} />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">תפקיד</label>
                      <select className="input w-full" value={createForm.role} onChange={e => setCreateForm(f => ({...f, role: e.target.value}))}>
                        <option value="manager">מנהל אירוע</option>
                        <option value="patient">מטופל</option>
                        <option value="broker">ברוקר / סוכן</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700">
                        <input type="checkbox" checked={createForm.is_admin} onChange={e => setCreateForm(f => ({...f, is_admin: e.target.checked}))} className="w-3.5 h-3.5" />
                        מנהל מערכת
                      </label>
                    </div>
                  </div>

                  {/* Quick presets */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">הרשאות — בחר preset או הגדר ידנית</label>
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {PERM_PRESETS.map(p => (
                        <button
                          key={p.key} type="button"
                          onClick={() => setCreateForm(f => ({...f, permissions: [...p.perms]}))}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            JSON.stringify([...p.perms].sort()) === JSON.stringify([...(createForm.permissions||[])].sort())
                              ? 'bg-blue-100 border-blue-400 text-blue-700 font-medium'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                          <span className="text-slate-400 mr-1 text-[10px]">— {p.desc}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PERM_OPTIONS.map(opt => (
                        <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 select-none">
                          <input
                            type="checkbox"
                            checked={(createForm.permissions||[]).includes(opt.key)}
                            onChange={e => setCreateForm(f => ({
                              ...f,
                              permissions: e.target.checked
                                ? [...(f.permissions||[]), opt.key]
                                : (f.permissions||[]).filter(p => p !== opt.key)
                            }))}
                            className="w-3.5 h-3.5 rounded"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {createError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>}

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => { setShowCreateUser(false); setCreateError(null) }} className="btn-secondary text-sm">ביטול</button>
                    <button type="submit" disabled={createSaving} className="btn-primary text-sm disabled:opacity-50">
                      {createSaving ? 'יוצר...' : 'צור משתמש'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {resetResult && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-amber-800 text-sm">{t('temp_password_for', { name: resetResult.name })}</p>
                  <p className="text-2xl font-mono font-bold text-amber-900 mt-1 tracking-wider">{resetResult.tempPassword}</p>
                  <p className="text-xs text-amber-600 mt-1">{t('temp_password_hint')}</p>
                </div>
                <button onClick={() => setResetResult(null)} className="text-amber-500 hover:text-amber-700 text-xl font-bold p-2 -m-2 rounded-lg">✕</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-slate-500">{t('common:loading', { ns: 'common' })}</div>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <div key={user.id} className="card">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{user.full_name}</span>
                        {user.is_admin && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{t('role_admin')}</span>
                        )}
                        {user.preserve_data && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('preserve_data_badge')}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
                      {actionStatus[user.id] && (
                        <p className={`text-xs mt-1 ${actionStatus[user.id].ok ? 'text-green-600' : 'text-red-500'}`}>
                          {actionStatus[user.id].msg}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">{t('role_label')}:</label>
                      <select
                        className="input text-sm py-1 w-36"
                        value={user.role}
                        onChange={e => handleRoleChange(user, e.target.value)}
                      >
                        <option value="manager">{t('role_manager')}</option>
                        <option value="patient">{t('role_patient')}</option>
                        <option value="broker">ברוקר / סוכן</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAdminToggle(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.is_admin ? 'bg-purple-50 text-purple-600 hover:bg-purple-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {user.is_admin ? t('revoke_admin') : t('grant_admin')}
                      </button>
                      <button
                        onClick={() => handleTogglePreserve(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.preserve_data ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {user.preserve_data ? t('cancel_preserve_data') : t('preserve_data')}
                      </button>
                      <button
                        onClick={() => handleToggleDemoMode(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.demo_mode_allowed ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        title={t('demo_mode_permission_hint')}
                      >
                        {user.demo_mode_allowed ? t('cancel_demo_mode') : t('allow_demo_mode')}
                      </button>
                      <button
                        onClick={() => openPermEditor(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1 ${permEditorUserId === user.id ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'}`}
                        title="ניהול הרשאות"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        הרשאות {Array.isArray(user.permissions) && user.permissions.length > 0 && <span className="bg-blue-200 text-blue-800 rounded-full px-1 text-[10px]">{user.permissions.length}</span>}
                      </button>
                      <button
                        onClick={() => handleReset(user)}
                        className="text-xs bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100"
                      >
                        {t('reset_password')}
                      </button>
                      <button
                        onClick={() => handleDeleteData(user)}
                        disabled={user.preserve_data}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.preserve_data ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                        title={user.preserve_data ? t('preserve_data_tooltip') : ''}
                      >
                        {t('delete_data')}
                      </button>
                      {!user.is_admin && (
                        <button
                          onClick={() => handleDeleteAccount(user)}
                          disabled={user.preserve_data}
                          className={`text-xs px-3 py-1.5 rounded-lg ${user.preserve_data ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                          title={user.preserve_data ? 'אין אפשרות למחוק — שמירת נתונים פעילה' : 'מחק חשבון לצמיתות'}
                        >
                          מחק חשבון
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline permissions editor */}
                  {permEditorUserId === user.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">הרשאות גישה</span>
                        <div className="flex gap-1.5">
                          {PERM_PRESETS.map(p => (
                            <button
                              key={p.key} type="button"
                              onClick={() => applyPreset(p)}
                              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                                JSON.stringify([...p.perms].sort()) === JSON.stringify([...permEditorValues].sort())
                                  ? 'bg-blue-100 border-blue-400 text-blue-700 font-semibold'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 mb-3">
                        {['עבודה','ייצוא','נתונים'].map(group => (
                          <div key={group}>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">{group}</p>
                            {PERM_OPTIONS.filter(o => o.group === group).map(opt => (
                              <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 select-none mb-1">
                                <input
                                  type="checkbox"
                                  checked={permEditorValues.includes(opt.key)}
                                  onChange={e => {
                                    if (e.target.checked) setPermEditorValues(prev => [...prev, opt.key])
                                    else setPermEditorValues(prev => prev.filter(p => p !== opt.key))
                                  }}
                                  className="w-3.5 h-3.5 rounded"
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => savePerms(user.id)}
                          disabled={permSaving}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {permSaving ? 'שומר...' : 'שמור הרשאות'}
                        </button>
                        <button
                          onClick={() => setPermEditorUserId(null)}
                          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Permissions tab ── */}
      {tab === 'permissions' && (
        <div className="flex gap-6">
          {/* Patient list */}
          <div className="w-72 flex-shrink-0">
            <p className="text-xs text-slate-500 mb-2">{t('select_patient_file')}</p>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {patients.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">{t('no_files')}</p>}
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPatient(p)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${selectedPatient?.id === p.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-slate-600">{t('owner_label')}: {p.manager_name || '—'}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions panel */}
          <div className="flex-1">
            {!selectedPatient ? (
              <div className="text-slate-600 text-sm pt-8 text-center">{t('select_patient_for_permissions')}</div>
            ) : (
              <>
                <div className="mb-4">
                  <h2 className="font-semibold text-slate-800">{selectedPatient.full_name}</h2>
                  <p className="text-xs text-slate-500">{t('owner_label')}: {selectedPatient.manager_name || '—'}</p>
                </div>

                {permMsg && (
                  <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${permMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {permMsg.text}
                  </div>
                )}

                {/* Grant access */}
                <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-medium text-slate-600 mb-2">{t('grant_to_manager')}</p>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1 text-sm"
                      value={grantManagerId}
                      onChange={e => setGrantManagerId(e.target.value)}
                    >
                      <option value="">{t('select_manager_placeholder')}</option>
                      {managers
                        .filter(m => m.id !== selectedPatient.manager_id && !permissions.some(p => p.manager_id === m.id))
                        .map(m => (
                          <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>
                        ))
                      }
                    </select>
                    <button
                      onClick={handleGrant}
                      disabled={!grantManagerId}
                      className="btn-primary text-sm px-4 disabled:opacity-40"
                    >
                      {t('grant_btn')}
                    </button>
                  </div>
                </div>

                {/* Existing permissions */}
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">{t('active_permissions')}</p>
                  {permsLoading ? (
                    <p className="text-sm text-slate-600">{t('common:loading', { ns: 'common' })}</p>
                  ) : permissions.length === 0 ? (
                    <p className="text-sm text-slate-600 py-3">{t('no_additional_permissions')}</p>
                  ) : (
                    <div className="space-y-2">
                      {permissions.map(perm => (
                        <div key={perm.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-slate-800">{perm.manager_name}</span>
                            <span className="text-xs text-slate-600 mr-2">{perm.manager_email}</span>
                            <div className="text-xs text-slate-600">{t('granted_by')} {perm.granted_by_name}</div>
                          </div>
                          <button
                            onClick={() => handleRevoke(perm.manager_id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                          >
                            {t('revoke_permission')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Activity Log tab ── */}
      {tab === 'activity' && (
        <ActivityLogPanel
          logs={activityLogs}
          total={activityTotal}
          loading={activityLoading}
          page={activityPage}
          users={users}
          userFilter={activityUserFilter}
          actionFilter={activityActionFilter}
          dateFrom={activityDateFrom}
          dateTo={activityDateTo}
          onUserFilter={v => setActivityUserFilter(v)}
          onActionFilter={v => setActivityActionFilter(v)}
          onDateFrom={v => setActivityDateFrom(v)}
          onDateTo={v => setActivityDateTo(v)}
          onSearch={() => fetchActivity(1)}
          onClear={() => {
            setActivityUserFilter(''); setActivityActionFilter('')
            setActivityDateFrom(''); setActivityDateTo('')
            fetchActivity(1, { user: '', action: '', from: '', to: '' })
          }}
          onPage={p => fetchActivity(p)}
        />
      )}

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && <SessionsPanel />}

      {/* ── Funds tab ── */}
      {tab === 'funds' && (
        <div>
          <p className="text-slate-500 text-sm mb-6">{t('funds_desc')}</p>
          <FundManagementPanel />
        </div>
      )}

      {/* ── Registrations tab ── */}
      {tab === 'registrations' && (
        <RegistrationsPanel onCountChange={setPendingRegCount} showToast={showToast} />
      )}

      {/* ── Drug Database Panel ─────────────────────────────────────── */}
      <DrugDatabasePanel />
    </div>
  )
}

// ── Registrations Panel ───────────────────────────────────────────────────────
function RegistrationsPanel({ onCountChange, showToast }) {
  const [regs, setRegs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [viewStatus, setViewStatus] = useState('pending')
  const [rejectInputs, setRejectInputs] = useState({})
  const [acting, setActing]       = useState(null)

  const load = (status = viewStatus) => {
    const ctrl = new AbortController()
    setLoading(true)
    axios.get(`/api/auth/admin/registrations?status=${status}`, { signal: ctrl.signal })
      .then(r => {
        setRegs(r.data)
        if (status === 'pending' && onCountChange) onCountChange(r.data.length)
      })
      .catch(e => { if (!axios.isCancel(e)) showToast('שגיאה בטעינת בקשות הרישום') })
      .finally(() => setLoading(false))
    return ctrl
  }

  useEffect(() => {
    const ctrl = load(viewStatus)
    return () => ctrl.abort()
  }, [viewStatus])

  const handleApprove = async (id) => {
    setActing(id)
    try {
      await axios.post(`/api/auth/admin/registrations/${id}/approve`)
      showToast('הבקשה אושרה בהצלחה')
      load(viewStatus)
    } catch (e) {
      showToast(e.response?.data?.detail || 'שגיאה באישור הבקשה')
    } finally { setActing(null) }
  }

  const handleReject = async (id) => {
    const reason = rejectInputs[id] || ''
    if (!reason.trim()) { showToast('יש להזין סיבת דחייה'); return }
    setActing(id)
    try {
      await axios.post(`/api/auth/admin/registrations/${id}/reject`, { reason })
      showToast('הבקשה נדחתה')
      setRejectInputs(prev => { const n = { ...prev }; delete n[id]; return n })
      load(viewStatus)
    } catch (e) {
      showToast(e.response?.data?.detail || 'שגיאה בדחיית הבקשה')
    } finally { setActing(null) }
  }

  const ROLE_BADGE = {
    manager: { cls: 'bg-blue-100 text-blue-700', label: 'מנהל' },
    patient:  { cls: 'bg-green-100 text-green-700', label: 'מטופל' },
    broker:   { cls: 'bg-violet-100 text-violet-700', label: 'ברוקר' },
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">בקשות רישום</h3>
          <p className="text-xs text-slate-500 mt-0.5">ניהול בקשות רישום ממתינות ממשתמשים חדשים</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected'].map(s => (
            <button key={s}
              onClick={() => setViewStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${viewStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {s === 'pending' ? 'ממתינות' : s === 'approved' ? 'מאושרות' : 'דחויות'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">טוען...</div>
      ) : regs.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-500 text-sm">
            {viewStatus === 'pending' ? 'אין בקשות רישום ממתינות' : viewStatus === 'approved' ? 'אין בקשות מאושרות' : 'אין בקשות דחויות'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {regs.map(reg => {
            const roleInfo = ROLE_BADGE[reg.role] || { cls: 'bg-slate-100 text-slate-700', label: reg.role }
            const isActing = acting === reg.id
            return (
              <div key={reg.id} className="card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800">{reg.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.cls}`}>{roleInfo.label}</span>
                    </div>
                    <p className="text-sm text-slate-500">{reg.email}</p>
                    {reg.org_name && (
                      <p className="text-xs text-slate-600 mt-0.5">ארגון: {reg.org_name}</p>
                    )}
                    {reg.applicant_message && (
                      <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded p-2 border border-slate-100">{reg.applicant_message}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      הוגש: {reg.created_at ? new Date(reg.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                    {reg.rejection_reason && (
                      <p className="text-xs text-red-600 mt-1">סיבת דחייה: {reg.rejection_reason}</p>
                    )}
                  </div>

                  {viewStatus === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                      <button
                        onClick={() => handleApprove(reg.id)}
                        disabled={isActing}
                        className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                      >
                        {isActing ? 'מעבד...' : 'אשר'}
                      </button>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input text-sm py-1.5 flex-1 min-w-0"
                          placeholder="סיבת דחייה..."
                          value={rejectInputs[reg.id] || ''}
                          onChange={e => setRejectInputs(prev => ({ ...prev, [reg.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => handleReject(reg.id)}
                          disabled={isActing}
                          className="text-sm bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex-shrink-0"
                        >
                          דחה
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Sessions Panel ─────────────────────────────────────────────────────────────
function SessionsPanel() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [revoking, setRevoking] = useState(null)
  const [confirm, ConfirmUI] = useConfirm()

  const load = () => {
    const ctrl = new AbortController()
    setLoading(true)
    axios.get('/api/admin/sessions?active_only=true', { signal: ctrl.signal })
      .then(r => setSessions(r.data || []))
      .catch(e => { if (!axios.isCancel(e)) console.error(e) })
      .finally(() => setLoading(false))
    return ctrl
  }

  useEffect(() => {
    const ctrl = load()
    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const revoke = async (sessionId, userName) => {
    const ok = await confirm({ title: 'ניתוק משתמש', message: `לנתק את ${userName} מהמערכת?`, confirmLabel: 'נתק', danger: true })
    if (!ok) return
    setRevoking(sessionId)
    try {
      await axios.delete(`/api/admin/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (e) {
      alert('שגיאה בביטול ה-session')
    } finally {
      setRevoking(null)
    }
  }

  if (loading) return <div className="py-10 text-center text-slate-500 text-sm">טוען sessions...</div>

  return (
    <div dir="rtl">
      {ConfirmUI}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">משתמשים מחוברים כרגע</h3>
          <p className="text-xs text-slate-500 mt-0.5">עודכן בכל טעינה — לחץ רענן לעדכון</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm">רענן</button>
      </div>

      {sessions.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-sm">אין sessions פעילים</div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => {
            const minsAgo = s.minutes_ago
            const timeLabel = minsAgo == null ? '—'
              : minsAgo < 1  ? 'עכשיו'
              : minsAgo < 60 ? `לפני ${minsAgo} דקות`
              : `לפני ${Math.round(minsAgo / 60)} שעות`
            const isRecent = minsAgo != null && minsAgo < 15
            return (
              <div key={s.id} className="card flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isRecent ? 'bg-green-400' : 'bg-slate-300'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{s.user_name}</span>
                      <span className="text-xs text-slate-500">{s.user_email}</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{s.user_role}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">נכנס: {s.login_at ? new Date(s.login_at).toLocaleString('he-IL') : '—'}</span>
                      <span className={`text-xs font-medium ${isRecent ? 'text-green-600' : 'text-slate-400'}`}>{timeLabel}</span>
                      {s.ip_address && <span className="text-xs text-slate-400 font-mono">{s.ip_address}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => revoke(s.id, s.user_name)}
                  disabled={revoking === s.id}
                  className="text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {revoking === s.id ? 'מנתק...' : 'נתק'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ACTION_LABELS and RESOURCE_LABELS are now computed inside ActivityLogPanel using t()

function ActivityLogPanel({ logs, total, loading, page, users, userFilter, actionFilter, dateFrom, dateTo,
  onUserFilter, onActionFilter, onDateFrom, onDateTo, onSearch, onClear, onPage }) {
  const { t } = useTranslation('admin')

  const ACTION_LABELS = {
    login:             t('action_login'),
    view_patient:      t('action_view_patient'),
    create_patient:    t('action_create_patient'),
    edit_patient:      t('action_edit_patient'),
    delete_patient:    t('action_delete_patient'),
    download_document: t('action_download_document'),
    upload_document:   t('action_upload_document'),
    delete_document:   t('action_delete_document'),
    create_claim:      t('action_create_claim'),
    edit_claim:        t('action_edit_claim'),
    delete_claim:      t('action_delete_claim'),
    add_insurance:     t('action_add_insurance'),
    admin_change_role: t('action_change_role'),
    admin_reset_user:  t('action_reset_user'),
    admin_delete_data: t('action_delete_data'),
    view_activity_log: t('action_view_log'),
  }
  const RESOURCE_LABELS = {
    patient:   t('resource_patient'),
    document:  t('resource_document'),
    claim:     t('resource_claim'),
    insurance: t('resource_insurance'),
    user:      t('resource_user'),
  }

  const totalPages = Math.ceil(total / 50)

  const statusBadge = (code) => {
    if (!code) return null
    const cls = code < 300 ? 'bg-green-100 text-green-700' : code < 500 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
    return <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>{code}</span>
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('activity_user')}</label>
          <select className="input text-sm py-1.5 w-44" value={userFilter} onChange={e => onUserFilter(e.target.value)}>
            <option value="">{t('filter_all_users')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('activity_action')}</label>
          <select className="input text-sm py-1.5 w-48" value={actionFilter} onChange={e => onActionFilter(e.target.value)}>
            <option value="">{t('filter_all_actions')}</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('date_from')}</label>
          <input type="date" className="input text-sm py-1.5" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('date_to')}</label>
          <input type="date" className="input text-sm py-1.5" value={dateTo} onChange={e => onDateTo(e.target.value)} />
        </div>
        <button onClick={onSearch} className="btn-primary text-sm px-4 py-1.5">{t('common:search', { ns: 'common' })}</button>
        <button onClick={onClear} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100">{t('common:clear', { ns: 'common' })}</button>
      </div>

      <p className="text-xs text-slate-600 mb-3">{total.toLocaleString()} {t('records_label')}</p>

      {loading ? (
        <div className="text-center py-12 text-slate-600 text-sm">{t('common:loading', { ns: 'common' })}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm">{t('no_records')}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm flex-wrap">
                <span className="text-slate-600 text-xs font-mono w-36 flex-shrink-0">
                  {log.created_at ? new Date(log.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </span>
                <span className="font-medium text-slate-800 w-32 flex-shrink-0 truncate">{log.user_name || <span className="text-slate-600">{t('anonymous')}</span>}</span>
                <span className="text-slate-700 flex-1 min-w-28">{ACTION_LABELS[log.action_type] || log.action_type}</span>
                {log.resource_type && (
                  <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
                    {RESOURCE_LABELS[log.resource_type] || log.resource_type}
                    {log.resource_id ? ` #${log.resource_id}` : ''}
                  </span>
                )}
                <span className="text-xs text-slate-600 font-mono w-28 flex-shrink-0">{log.ip_address || '—'}</span>
                {statusBadge(log.status_code)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4 justify-center">
          <button disabled={page === 1} onClick={() => onPage(page - 1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
            {t('prev_page')}
          </button>
          <span className="text-sm text-slate-500">{t('page_of', { page, total: totalPages })}</span>
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
            {t('next_page')}
          </button>
        </div>
      )}
    </div>
  )
}

function DrugDatabasePanel() {
  const { t } = useTranslation('admin')
  const [status, setStatus] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [msg, setMsg] = useState('')

  const fetchStatus = useCallback(async (signal) => {
    try {
      const res = await axios.get('/api/drugs/status', { signal })
      setStatus(res.data)
    } catch (e) { if (axios.isCancel(e)) return }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchStatus(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchStatus])

  const triggerUpdate = async () => {
    setUpdating(true); setMsg('')
    try {
      const res = await axios.post('/api/drugs/update')
      setMsg(res.data.message)
      setTimeout(fetchStatus, 3000)
    } catch (e) {
      setMsg(e.response?.data?.detail || 'שגיאה')
    } finally { setUpdating(false) }
  }

  const last = status?.last_update

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-800">{t('drug_db_title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('drug_db_auto_update')}
          </p>
        </div>
        <button
          onClick={triggerUpdate}
          disabled={updating}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {updating ? t('drug_updating') : `↻ ${t('drug_update')}`}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{status.total_drugs.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('drug_total')}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-700">{status.by_source?.openfda ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('drug_added_from_openfda')}</p>
          </div>
        </div>
      )}

      {last && (
        <div className={`text-xs rounded-lg px-3 py-2 ${last.status === 'success' ? 'bg-green-50 text-green-700' : last.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
          {t('last_update_label')}: {last.status === 'success' ? '✓' : last.status === 'failed' ? '✗' : '⏳'}
          {' '}{last.started_at ? new Date(last.started_at).toLocaleString('he-IL') : '—'}
          {last.drugs_added > 0 && <span className="mr-2">· +{last.drugs_added} {t('new_drugs_added')}</span>}
          {last.message && <span className="mr-2">· {last.message}</span>}
        </div>
      )}

      {msg && <p className="text-xs text-blue-600 mt-2">{msg}</p>}
    </div>
  )
}
