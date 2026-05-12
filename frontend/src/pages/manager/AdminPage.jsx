import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import FundManagementPanel from './FundManagementPanel'
import { useTranslation } from 'react-i18next'

const DEV_EMAIL = 'da.tzalik@gmail.com'


export default function AdminPage() {
  const { t } = useTranslation('admin')
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const isDev = currentUser?.email === DEV_EMAIL
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetResult, setResetResult] = useState(null)
  const [actionStatus, setActionStatus] = useState({})

  // Permissions state
  const [tab, setTab] = useState('users') // 'users' | 'permissions' | 'activity'
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
      setResetResult({ userId: user.id, name: user.full_name, tempPassword: res.data.temp_password })
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

  const managers = users.filter(u => u.role === 'manager' && !u.is_admin)

  return (
    <div className="p-4 md:p-8" dir="rtl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{t('title')}</h1>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 mt-4 border-b border-slate-200 flex-wrap items-end">
        {[
          { key: 'users',       label: t('tab_users') },
          { key: 'permissions', label: t('tab_permissions') },
          { key: 'activity',    label: t('tab_activity') },
          { key: 'funds',       label: t('tab_funds') },
        ].map(tb => (
          <button key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${tab === tb.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tb.label}
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
          <p className="text-slate-500 text-sm mb-6">{t('users_registered', { count: users.length })}</p>

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
                    </div>
                  </div>
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
                  <p className="text-xs font-medium text-slate-600 mb-2">הענק גישה למנהל אירוע</p>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1 text-sm"
                      value={grantManagerId}
                      onChange={e => setGrantManagerId(e.target.value)}
                    >
                      <option value="">בחר מנהל...</option>
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
                      הענק
                    </button>
                  </div>
                </div>

                {/* Existing permissions */}
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">גישות פעילות</p>
                  {permsLoading ? (
                    <p className="text-sm text-slate-600">טוען...</p>
                  ) : permissions.length === 0 ? (
                    <p className="text-sm text-slate-600 py-3">אין הרשאות נוספות — רק הבעלים ניגש לתיק זה</p>
                  ) : (
                    <div className="space-y-2">
                      {permissions.map(perm => (
                        <div key={perm.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-slate-800">{perm.manager_name}</span>
                            <span className="text-xs text-slate-600 mr-2">{perm.manager_email}</span>
                            <div className="text-xs text-slate-600">הוענק ע"י {perm.granted_by_name}</div>
                          </div>
                          <button
                            onClick={() => handleRevoke(perm.manager_id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                          >
                            בטל גישה
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

      {/* ── Funds tab ── */}
      {tab === 'funds' && (
        <div>
          <p className="text-slate-500 text-sm mb-6">ניהול מאגר הקרנות הגלובלי — קרנות סיוע, זכאויות סוציאליות, הלוואות והטבות מס</p>
          <FundManagementPanel />
        </div>
      )}

      {/* ── Drug Database Panel ─────────────────────────────────────── */}
      <DrugDatabasePanel />
    </div>
  )
}

const ACTION_LABELS = {
  login:             'התחברות',
  view_patient:      'צפייה בתיק',
  create_patient:    'יצירת תיק',
  edit_patient:      'עדכון תיק',
  delete_patient:    'מחיקת תיק',
  download_document: 'הורדת מסמך',
  upload_document:   'העלאת מסמך',
  delete_document:   'מחיקת מסמך',
  create_claim:      'יצירת תביעה',
  edit_claim:        'עדכון תביעה',
  delete_claim:      'מחיקת תביעה',
  add_insurance:     'הוספת ביטוח',
  admin_change_role: 'שינוי הרשאות',
  admin_reset_user:  'איפוס סיסמה',
  admin_delete_data: 'מחיקת נתונים',
  view_activity_log: 'צפייה בלוג',
}

const RESOURCE_LABELS = {
  patient:   'מטופל',
  document:  'מסמך',
  claim:     'תביעה',
  insurance: 'ביטוח',
  user:      'משתמש',
}

function ActivityLogPanel({ logs, total, loading, page, users, userFilter, actionFilter, dateFrom, dateTo,
  onUserFilter, onActionFilter, onDateFrom, onDateTo, onSearch, onClear, onPage }) {

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
          <label className="block text-xs text-slate-500 mb-1">משתמש</label>
          <select className="input text-sm py-1.5 w-44" value={userFilter} onChange={e => onUserFilter(e.target.value)}>
            <option value="">כולם</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">פעולה</label>
          <select className="input text-sm py-1.5 w-48" value={actionFilter} onChange={e => onActionFilter(e.target.value)}>
            <option value="">כל הפעולות</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">מתאריך</label>
          <input type="date" className="input text-sm py-1.5" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">עד תאריך</label>
          <input type="date" className="input text-sm py-1.5" value={dateTo} onChange={e => onDateTo(e.target.value)} />
        </div>
        <button onClick={onSearch} className="btn-primary text-sm px-4 py-1.5">חפש</button>
        <button onClick={onClear} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100">נקה</button>
      </div>

      <p className="text-xs text-slate-600 mb-3">{total.toLocaleString()} רשומות</p>

      {loading ? (
        <div className="text-center py-12 text-slate-600 text-sm">טוען...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm">אין רשומות</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm flex-wrap">
                <span className="text-slate-600 text-xs font-mono w-36 flex-shrink-0">
                  {log.created_at ? new Date(log.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </span>
                <span className="font-medium text-slate-800 w-32 flex-shrink-0 truncate">{log.user_name || <span className="text-slate-600">אנונימי</span>}</span>
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
            הקודם
          </button>
          <span className="text-sm text-slate-500">עמוד {page} מתוך {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
            הבא
          </button>
        </div>
      )}
    </div>
  )
}

function DrugDatabasePanel() {
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
          <h3 className="font-bold text-slate-800">מאגר תרופות</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            עדכון אוטומטי שבועי מ-openFDA · עדכון ידני זמין
          </p>
        </div>
        <button
          onClick={triggerUpdate}
          disabled={updating}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {updating ? 'מעדכן...' : '↻ עדכן עכשיו'}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{status.total_drugs.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">תרופות במאגר</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-700">{status.by_source?.openfda ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">נוספו מ-openFDA</p>
          </div>
        </div>
      )}

      {last && (
        <div className={`text-xs rounded-lg px-3 py-2 ${last.status === 'success' ? 'bg-green-50 text-green-700' : last.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
          עדכון אחרון: {last.status === 'success' ? '✓' : last.status === 'failed' ? '✗' : '⏳'}
          {' '}{last.started_at ? new Date(last.started_at).toLocaleString('he-IL') : '—'}
          {last.drugs_added > 0 && <span className="mr-2">· +{last.drugs_added} תרופות חדשות</span>}
          {last.message && <span className="mr-2">· {last.message}</span>}
        </div>
      )}

      {msg && <p className="text-xs text-blue-600 mt-2">{msg}</p>}
    </div>
  )
}
