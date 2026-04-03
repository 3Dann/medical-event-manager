import React, { useState, useEffect } from 'react'
import axios from 'axios'

const ROLE_LABELS = { manager: 'מנהל אירוע', patient: 'מטופל' }

export default function AdminPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetResult, setResetResult] = useState(null) // { userId, tempPassword }
  const [actionStatus, setActionStatus] = useState({}) // { [userId]: { ok, msg } }

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try { const res = await axios.get('/api/admin/users'); setUsers(res.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
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

  return (
    <div className="p-8" dir="rtl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">ניהול משתמשים</h1>
      <p className="text-slate-500 text-sm mb-8">{users.length} משתמשים רשומים</p>

      {/* Reset password result */}
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
                {/* Info */}
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

                {/* Role selector */}
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

                {/* Actions */}
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
    </div>
  )
}
