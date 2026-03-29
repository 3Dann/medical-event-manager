import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, NavLink, Outlet } from 'react-router-dom'
import axios from 'axios'

const tabs = [
  { to: '', label: 'פרטים וצמתים', end: true },
  { to: 'insurance', label: 'ביטוחים' },
  { to: 'claims', label: 'תביעות' },
  { to: 'strategy', label: 'אסטרטגיה' },
]

const STATUS_LABELS = { future: 'עתידי', active: 'פעיל', completed: 'הושלם' }
const STATUS_COLORS = { future: 'badge-gray', active: 'badge-blue', completed: 'badge-green' }
const TYPE_LABELS = { medical: 'טיפולי', financial: 'פיננסי' }
const TYPE_COLORS = { medical: 'badge-green', financial: 'badge-yellow' }

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [nodes, setNodes] = useState([])
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [nodeForm, setNodeForm] = useState({ node_type: 'medical', description: '', planned_date: '', status: 'future', notes: '' })

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const [p, n] = await Promise.all([
      axios.get(`/api/patients/${id}`),
      axios.get(`/api/patients/${id}/nodes`),
    ])
    setPatient(p.data)
    setEditForm(p.data)
    setNodes(n.data)
  }

  const handleSavePatient = async () => {
    await axios.put(`/api/patients/${id}`, editForm)
    setEditing(false)
    fetchAll()
  }

  const handleAddNode = async (e) => {
    e.preventDefault()
    await axios.post(`/api/patients/${id}/nodes`, nodeForm)
    setShowNodeForm(false)
    setNodeForm({ node_type: 'medical', description: '', planned_date: '', status: 'future', notes: '' })
    fetchAll()
  }

  const handleDeleteNode = async (nodeId) => {
    await axios.delete(`/api/patients/${id}/nodes/${nodeId}`)
    fetchAll()
  }

  const handleUpdateNodeStatus = async (nodeId, status) => {
    await axios.put(`/api/patients/${id}/nodes/${nodeId}`, { status })
    fetchAll()
  }

  if (!patient) return <div className="p-8 text-slate-500">טוען...</div>

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/manager')} className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{patient.full_name}</h1>
          <p className="text-slate-500 text-sm">{patient.id_number ? `ת.ז.: ${patient.id_number}` : 'ללא ת.ז.'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(tab => (
          <NavLink key={tab.to} to={`/manager/patients/${id}${tab.to ? '/' + tab.to : ''}`} end={tab.end}
            className={({ isActive }) => `px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Patient info */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex justify-between items-start mb-4">
            <h2 className="font-semibold text-slate-800">נתונים בסיסיים</h2>
            <button onClick={() => setEditing(!editing)} className="text-sm text-blue-600 hover:underline">
              {editing ? 'ביטול' : 'עריכה'}
            </button>
          </div>
          {editing ? (
            <div className="space-y-3">
              <div><label className="label">שם מלא</label><input className="input" value={editForm.full_name || ''} onChange={e => setEditForm({...editForm, full_name: e.target.value})} /></div>
              <div><label className="label">ת.ז.</label><input className="input" value={editForm.id_number || ''} onChange={e => setEditForm({...editForm, id_number: e.target.value})} /></div>
              <div>
                <label className="label">סטטוס אבחנה</label>
                <select className="input" value={editForm.diagnosis_status || 'no'} onChange={e => setEditForm({...editForm, diagnosis_status: e.target.value})}>
                  <option value="no">ללא אבחנה</option>
                  <option value="yes">אבחנה קיימת</option>
                  <option value="pending">בבירור</option>
                </select>
              </div>
              <div><label className="label">פירוט אבחנה</label><textarea className="input" rows={2} value={editForm.diagnosis_details || ''} onChange={e => setEditForm({...editForm, diagnosis_details: e.target.value})} /></div>
              <div><label className="label">הערות</label><textarea className="input" rows={2} value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} /></div>
              <button onClick={handleSavePatient} className="btn-primary w-full">שמור</button>
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-500">אבחנה</dt><dd className="font-medium">{patient.diagnosis_status === 'yes' ? 'קיימת' : patient.diagnosis_status === 'pending' ? 'בבירור' : 'ללא'}</dd></div>
              {patient.diagnosis_details && <div><dt className="text-slate-500">פירוט</dt><dd>{patient.diagnosis_details}</dd></div>}
              {patient.notes && <div><dt className="text-slate-500">הערות</dt><dd>{patient.notes}</dd></div>}
            </dl>
          )}
        </div>

        {/* Quick nav */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">ניווט מהיר</h2>
          <div className="grid grid-cols-1 gap-2">
            {[
              { path: 'insurance', label: 'ניהול ביטוחים', desc: 'הוסף וערוך פוליסות', color: 'bg-green-50 text-green-700' },
              { path: 'claims', label: 'מעקב תביעות', desc: 'סטטוס תביעות ועדכונים', color: 'bg-blue-50 text-blue-700' },
              { path: 'strategy', label: 'אסטרטגיה פיננסית', desc: 'המלצות ומיפוי כיסויים', color: 'bg-purple-50 text-purple-700' },
            ].map(item => (
              <button key={item.path} onClick={() => navigate(`/manager/patients/${id}/${item.path}`)}
                className={`${item.color} rounded-lg p-3 text-right hover:opacity-90 transition-opacity`}>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs opacity-75 mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nodes */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-slate-800">צמתים — נקודות החלטה</h2>
          <button onClick={() => setShowNodeForm(true)} className="btn-primary text-sm py-1.5">+ צומת חדש</button>
        </div>

        {showNodeForm && (
          <form onSubmit={handleAddNode} className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">סוג</label>
                <select className="input" value={nodeForm.node_type} onChange={e => setNodeForm({...nodeForm, node_type: e.target.value})}>
                  <option value="medical">טיפולי</option>
                  <option value="financial">פיננסי</option>
                </select>
              </div>
              <div>
                <label className="label">סטטוס</label>
                <select className="input" value={nodeForm.status} onChange={e => setNodeForm({...nodeForm, status: e.target.value})}>
                  <option value="future">עתידי</option>
                  <option value="active">פעיל</option>
                  <option value="completed">הושלם</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">תיאור *</label>
                <input className="input" value={nodeForm.description} onChange={e => setNodeForm({...nodeForm, description: e.target.value})} required />
              </div>
              <div>
                <label className="label">תאריך מתוכנן</label>
                <input type="date" className="input" value={nodeForm.planned_date} onChange={e => setNodeForm({...nodeForm, planned_date: e.target.value})} />
              </div>
              <div>
                <label className="label">הערות</label>
                <input className="input" value={nodeForm.notes} onChange={e => setNodeForm({...nodeForm, notes: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNodeForm(false)} className="btn-secondary text-sm py-1.5">ביטול</button>
              <button type="submit" className="btn-primary text-sm py-1.5">הוסף צומת</button>
            </div>
          </form>
        )}

        {nodes.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">אין צמתים. הוסף נקודות החלטה במסע הרפואי.</p>
        ) : (
          <div className="space-y-3">
            {nodes.map((node, i) => (
              <div key={node.id} className="flex items-start gap-4 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${node.status === 'completed' ? 'bg-green-100 text-green-700' : node.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</div>
                  {i < nodes.length - 1 && <div className="w-px h-6 bg-slate-200" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={TYPE_COLORS[node.node_type]}>{TYPE_LABELS[node.node_type]}</span>
                    <span className="font-medium text-sm">{node.description}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {node.planned_date && <span className="text-xs text-slate-500">📅 {node.planned_date}</span>}
                    {node.notes && <span className="text-xs text-slate-500">{node.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={node.status} onChange={e => handleUpdateNodeStatus(node.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1">
                    <option value="future">עתידי</option>
                    <option value="active">פעיל</option>
                    <option value="completed">הושלם</option>
                  </select>
                  <button onClick={() => handleDeleteNode(node.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
