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
const TYPE_LABELS   = { medical: 'טיפולי', financial: 'פיננסי' }

const STAGE_ICONS = ['🔍', '📋', '💉', '🌱']
const STAGE_COLORS = {
  future:    { ring: 'ring-slate-200',  bg: 'bg-slate-50',   text: 'text-slate-500',  dot: 'bg-slate-300',  label: 'bg-slate-100 text-slate-500' },
  active:    { ring: 'ring-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'bg-blue-100 text-blue-700' },
  completed: { ring: 'ring-green-400',  bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  label: 'bg-green-100 text-green-700' },
}

function JourneyTimeline({ stages, onUpdateStage }) {
  const [editing, setEditing] = useState(null) // stage id being edited
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate]   = useState('')

  const sorted = [...stages].sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0))

  const saveStage = async (stage) => {
    await onUpdateStage(stage.id, { notes: editNotes, planned_date: editDate, status: stage.status })
    setEditing(null)
  }

  return (
    <div className="card mb-6">
      <h2 className="font-semibold text-slate-800 mb-5">מסע הטיפול הרפואי</h2>

      {/* Desktop: horizontal timeline */}
      <div className="hidden md:flex items-start gap-0">
        {sorted.map((stage, i) => {
          const c = STAGE_COLORS[stage.status] || STAGE_COLORS.future
          const isLast = i === sorted.length - 1
          return (
            <React.Fragment key={stage.id}>
              <div className="flex flex-col items-center flex-1 min-w-0">
                {/* Circle */}
                <button
                  onClick={() => { setEditing(editing === stage.id ? null : stage.id); setEditNotes(stage.notes || ''); setEditDate(stage.planned_date || '') }}
                  className={`w-14 h-14 rounded-full ring-2 ${c.ring} ${c.bg} flex items-center justify-center text-2xl shadow-sm hover:scale-105 transition-transform`}
                  title="לחץ לעריכה"
                >
                  {stage.status === 'completed' ? '✅' : STAGE_ICONS[i] || '📌'}
                </button>

                {/* Label */}
                <p className={`mt-2 text-xs font-semibold text-center px-1 ${c.text}`}>{stage.description}</p>

                {/* Status badge */}
                <span className={`mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${c.label}`}>
                  {STATUS_LABELS[stage.status]}
                </span>

                {/* Date */}
                {stage.planned_date && (
                  <span className="mt-1 text-[10px] text-slate-400">📅 {stage.planned_date}</span>
                )}

                {/* Notes snippet */}
                {stage.notes && (
                  <span className="mt-1 text-[10px] text-slate-400 text-center px-1 truncate max-w-[90px]">{stage.notes}</span>
                )}

                {/* Status selector */}
                <select
                  value={stage.status}
                  onChange={e => onUpdateStage(stage.id, { status: e.target.value })}
                  className="mt-2 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                >
                  <option value="future">עתידי</option>
                  <option value="active">פעיל</option>
                  <option value="completed">הושלם</option>
                </select>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex items-center mt-7 flex-shrink-0 w-8">
                  <div className={`h-0.5 w-full ${stage.status === 'completed' ? 'bg-green-400' : 'bg-slate-200'}`} />
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.status === 'completed' ? 'bg-green-400' : 'bg-slate-200'}`} />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Mobile: vertical list */}
      <div className="md:hidden space-y-3">
        {sorted.map((stage, i) => {
          const c = STAGE_COLORS[stage.status] || STAGE_COLORS.future
          return (
            <div key={stage.id} className={`flex items-start gap-3 p-3 rounded-xl ring-1 ${c.ring} ${c.bg}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${c.bg}`}>
                {stage.status === 'completed' ? '✅' : STAGE_ICONS[i] || '📌'}
              </div>
              <div className="flex-1">
                <p className={`font-semibold text-sm ${c.text}`}>{stage.description}</p>
                {stage.planned_date && <p className="text-xs text-slate-400 mt-0.5">📅 {stage.planned_date}</p>}
                {stage.notes && <p className="text-xs text-slate-500 mt-0.5">{stage.notes}</p>}
                <select
                  value={stage.status}
                  onChange={e => onUpdateStage(stage.id, { status: e.target.value })}
                  className="mt-2 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                >
                  <option value="future">עתידי</option>
                  <option value="active">פעיל</option>
                  <option value="completed">הושלם</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit panel */}
      {editing && (() => {
        const stage = sorted.find(s => s.id === editing)
        if (!stage) return null
        return (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="font-medium text-sm text-slate-700 mb-3">עריכת שלב: {stage.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">תאריך מתוכנן</label>
                <input type="date" className="input" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="label">הערות</label>
                <input className="input" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="הוסף הערה..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm py-1.5">ביטול</button>
              <button onClick={() => saveStage(stage)} className="btn-primary text-sm py-1.5">שמור</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [nodes, setNodes] = useState([])
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [hmoPlans, setHmoPlans] = useState([])
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
    if (p.data.hmo_name) {
      const plans = await axios.get(`/api/patients/hmo-plans/${p.data.hmo_name}`)
      setHmoPlans(plans.data)
    }
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

  const handleUpdateNode = async (nodeId, updates) => {
    await axios.put(`/api/patients/${id}/nodes/${nodeId}`, updates)
    fetchAll()
  }

  if (!patient) return <div className="p-8 text-slate-500">טוען...</div>

  const journeyStages = nodes.filter(n => n.node_type === 'stage').sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0))
  const customNodes   = nodes.filter(n => n.node_type !== 'stage')

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
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

      {/* Journey Stages Timeline */}
      {journeyStages.length > 0 && (
        <JourneyTimeline stages={journeyStages} onUpdateStage={handleUpdateNode} />
      )}

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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">קופת חולים</label>
                  <select className="input" value={editForm.hmo_name || ''} onChange={async e => {
                    const hmo = e.target.value
                    setEditForm({...editForm, hmo_name: hmo, hmo_level: ''})
                    if (hmo) {
                      const res = await axios.get(`/api/patients/hmo-plans/${hmo}`)
                      setHmoPlans(res.data)
                    } else { setHmoPlans([]) }
                  }}>
                    <option value="">— לא מוגדר —</option>
                    <option value="clalit">כללית</option>
                    <option value="maccabi">מכבי</option>
                    <option value="meuhedet">מאוחדת</option>
                    <option value="leumit">לאומית</option>
                  </select>
                </div>
                <div>
                  <label className="label">ביטוח משלים</label>
                  <select className="input" value={editForm.hmo_level || ''} onChange={e => setEditForm({...editForm, hmo_level: e.target.value})} disabled={!editForm.hmo_name}>
                    <option value="">— בחר תוכנית —</option>
                    {hmoPlans.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">הערות</label><textarea className="input" rows={2} value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} /></div>
              <button onClick={handleSavePatient} className="btn-primary w-full">שמור</button>
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-500">אבחנה</dt><dd className="font-medium">{patient.diagnosis_status === 'yes' ? 'קיימת' : patient.diagnosis_status === 'pending' ? 'בבירור' : 'ללא'}</dd></div>
              {patient.diagnosis_details && <div><dt className="text-slate-500">פירוט</dt><dd>{patient.diagnosis_details}</dd></div>}
              {patient.hmo_name && (
                <div>
                  <dt className="text-slate-500">קופת חולים</dt>
                  <dd className="font-medium">
                    {{ clalit:'כללית', maccabi:'מכבי', meuhedet:'מאוחדת', leumit:'לאומית' }[patient.hmo_name]}
                    {patient.hmo_level && <span className="text-slate-500 font-normal mr-1">— {hmoPlans.find(p => p.key === patient.hmo_level)?.label || patient.hmo_level}</span>}
                  </dd>
                </div>
              )}
              {patient.notes && <div><dt className="text-slate-500">הערות</dt><dd>{patient.notes}</dd></div>}
            </dl>
          )}
        </div>

        {/* Quick nav */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">ניווט מהיר</h2>
          <div className="grid grid-cols-1 gap-2">
            {[
              { path: 'insurance', label: 'ניהול ביטוחים',      desc: 'הוסף וערוך פוליסות',           color: 'bg-green-50 text-green-700' },
              { path: 'claims',    label: 'מעקב תביעות',         desc: 'סטטוס תביעות ועדכונים',        color: 'bg-blue-50 text-blue-700' },
              { path: 'strategy',  label: 'אסטרטגיה פיננסית',   desc: 'המלצות ומיפוי כיסויים',        color: 'bg-purple-50 text-purple-700' },
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

      {/* Custom decision nodes */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-slate-800">צמתי החלטה נוספים</h2>
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

        {customNodes.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">אין צמתים נוספים. הוסף נקודות החלטה ספציפיות למטופל.</p>
        ) : (
          <div className="space-y-3">
            {customNodes.map((node, i) => (
              <div key={node.id} className="flex items-start gap-4 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${node.status === 'completed' ? 'bg-green-100 text-green-700' : node.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</div>
                  {i < customNodes.length - 1 && <div className="w-px h-6 bg-slate-200" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${node.node_type === 'medical' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {TYPE_LABELS[node.node_type]}
                    </span>
                    <span className="font-medium text-sm">{node.description}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {node.planned_date && <span className="text-xs text-slate-500">📅 {node.planned_date}</span>}
                    {node.notes && <span className="text-xs text-slate-500">{node.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={node.status} onChange={e => handleUpdateNode(node.id, { status: e.target.value })}
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
