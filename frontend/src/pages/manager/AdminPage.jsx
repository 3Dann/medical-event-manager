import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const DEV_EMAIL = 'da.tzalik@gmail.com'

const ROLE_LABELS = { manager: 'מנהל אירוע', patient: 'מטופל' }

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const isDev = currentUser?.email === DEV_EMAIL
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetResult, setResetResult] = useState(null)
  const [actionStatus, setActionStatus] = useState({})

  // Permissions state
  const [tab, setTab] = useState('users') // 'users' | 'permissions'
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [permsLoading, setPermsLoading] = useState(false)
  const [grantManagerId, setGrantManagerId] = useState('')
  const [permMsg, setPermMsg] = useState(null)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try { const res = await axios.get('/api/admin/users'); setUsers(res.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchPatients = async () => {
    try { const res = await axios.get('/api/admin/patients'); setPatients(res.data) }
    catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (tab === 'permissions') fetchPatients()
  }, [tab])

  const fetchPermissions = async (patientId) => {
    setPermsLoading(true)
    try {
      const res = await axios.get(`/api/admin/patients/${patientId}/permissions`)
      setPermissions(res.data)
    } catch (e) { console.error(e) }
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
      <h1 className="text-2xl font-bold text-slate-800 mb-1">ניהול מערכת</h1>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 mt-4 border-b border-slate-200 flex-wrap items-end">
        {[
          { key: 'users',       label: 'משתמשים' },
          { key: 'permissions', label: 'הרשאות גישה לתיקים' },
        ].map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
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
          <p className="text-slate-500 text-sm mb-6">{users.length} משתמשים רשומים</p>

          {resetResult && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-amber-800 text-sm">סיסמה זמנית עבור {resetResult.name}</p>
                  <p className="text-2xl font-mono font-bold text-amber-900 mt-1 tracking-wider">{resetResult.tempPassword}</p>
                  <p className="text-xs text-amber-600 mt-1">מסור למשתמש ובקש ממנו לשנות בהקדם</p>
                </div>
                <button onClick={() => setResetResult(null)} className="text-amber-500 hover:text-amber-700 text-xl font-bold">✕</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-slate-500">טוען...</div>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <div key={user.id} className="card">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{user.full_name}</span>
                        {user.is_admin && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">אדמין</span>
                        )}
                        {user.preserve_data && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">שמור מידע</span>
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
                      <label className="text-xs text-slate-500">תפקיד:</label>
                      <select
                        className="input text-sm py-1 w-36"
                        value={user.role}
                        onChange={e => handleRoleChange(user, e.target.value)}
                      >
                        <option value="manager">מנהל אירוע</option>
                        <option value="patient">מטופל</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAdminToggle(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.is_admin ? 'bg-purple-50 text-purple-600 hover:bg-purple-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {user.is_admin ? 'הסר אדמין' : 'הגדר אדמין'}
                      </button>
                      <button
                        onClick={() => handleTogglePreserve(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.preserve_data ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {user.preserve_data ? 'בטל שמירת מידע' : 'שמור מידע'}
                      </button>
                      <button
                        onClick={() => handleToggleDemoMode(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.demo_mode_allowed ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        title="הרשאה להפעיל מצב הצגה"
                      >
                        {user.demo_mode_allowed ? 'בטל מצב הצגה' : 'אפשר מצב הצגה'}
                      </button>
                      <button
                        onClick={() => handleReset(user)}
                        className="text-xs bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100"
                      >
                        איפוס סיסמה
                      </button>
                      <button
                        onClick={() => handleDeleteData(user)}
                        disabled={user.preserve_data}
                        className={`text-xs px-3 py-1.5 rounded-lg ${user.preserve_data ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                        title={user.preserve_data ? 'המשתמש ביקש לשמור את המידע' : ''}
                      >
                        מחק נתונים
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
            <p className="text-xs text-slate-500 mb-2">בחר תיק מטופל</p>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {patients.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">אין תיקים</p>}
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPatient(p)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${selectedPatient?.id === p.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-slate-400">בעלים: {p.manager_name || '—'}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions panel */}
          <div className="flex-1">
            {!selectedPatient ? (
              <div className="text-slate-400 text-sm pt-8 text-center">בחר תיק מהרשימה לניהול הרשאות</div>
            ) : (
              <>
                <div className="mb-4">
                  <h2 className="font-semibold text-slate-800">{selectedPatient.full_name}</h2>
                  <p className="text-xs text-slate-500">בעלים: {selectedPatient.manager_name || '—'}</p>
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
                    <p className="text-sm text-slate-400">טוען...</p>
                  ) : permissions.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3">אין הרשאות נוספות — רק הבעלים ניגש לתיק זה</p>
                  ) : (
                    <div className="space-y-2">
                      {permissions.map(perm => (
                        <div key={perm.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-slate-800">{perm.manager_name}</span>
                            <span className="text-xs text-slate-400 mr-2">{perm.manager_email}</span>
                            <div className="text-xs text-slate-400">הוענק ע"י {perm.granted_by_name}</div>
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
    </div>
  )
}
