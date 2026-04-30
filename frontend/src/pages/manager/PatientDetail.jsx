import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import WorkflowPanel from '../../components/workflows/WorkflowPanel'
import ResizablePanel from '../../components/ResizablePanel'
import { validateIsraeliId } from '../../utils/validateId'
import ConditionTagsSelector from '../../components/ConditionTagsSelector'

const MEDICAL_STAGES = [
  { value: '',                 label: '— לא מוגדר —' },
  { value: 'pre_diagnosis',    label: 'לפני אבחנה' },
  { value: 'active_treatment', label: 'טיפול פעיל' },
  { value: 'recovery',         label: 'החלמה' },
  { value: 'monitoring',       label: 'מעקב' },
]

// tabs are built inside the component using t()

// Fixed journey stages — order values 10,20,30,40,50
const FIXED_STAGES = [10, 20, 30, 40, 50]
const STAGE_ICONS  = { 10: '🔍', 20: '📋', 30: '💉', 40: '🩹', 50: '🔭' }

// Slots where a custom node can be inserted (between / before / after stages)
const INSERT_SLOTS = [
  { label: 'לפני גילוי ואבחון',           value: 5  },
  { label: 'אחרי גילוי ואבחון',           value: 15 },
  { label: 'אחרי תכנון הטיפול',           value: 25 },
  { label: 'אחרי שלב הטיפולים',           value: 35 },
  { label: 'אחרי החלמה ושיקום',           value: 45 },
  { label: 'אחרי מעקב',                   value: 55 },
]

const STATUS_LABELS = { future: 'עתידי', active: 'פעיל', completed: 'הושלם' }
const STATUS_STYLES = {
  future:    { ring: 'ring-slate-200',  bg: 'bg-slate-50',   text: 'text-slate-500',  badge: 'bg-slate-100 text-slate-500',  connector: 'bg-slate-200' },
  active:    { ring: 'ring-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',    connector: 'bg-blue-300'  },
  completed: { ring: 'ring-green-400',  bg: 'bg-green-50',   text: 'text-green-700',  badge: 'bg-green-100 text-green-700',  connector: 'bg-green-400' },
}

function sortNodes(nodes) {
  // Sort: nodes with stage_order first (ascending), then null (by created_at)
  return [...nodes].sort((a, b) => {
    if (a.stage_order != null && b.stage_order != null) return a.stage_order - b.stage_order
    if (a.stage_order != null) return -1
    if (b.stage_order != null) return 1
    return 0
  })
}

export default function PatientDetail() {
  const { t } = useTranslation('nav')
  const { id } = useParams()

  const tabs = [
    { to: '', label: t('details_nodes'), end: true },
    { to: 'insurance', label: t('insurance') },
    { to: 'claims', label: t('claims') },
    { to: 'financial-map', label: t('financial_map') },
    { to: 'strategy', label: t('strategy') },
    { to: 'medications', label: t('medications') },
    { to: 'documents', label: t('documents') },
  ]
  const navigate = useNavigate()

  const [patient,      setPatient]      = useState(null)
  const [nodes,        setNodes]        = useState([])
  const [hmoPlans,     setHmoPlans]     = useState([])
  const [editingInfo,  setEditingInfo]  = useState(false)
  const [editForm,     setEditForm]     = useState({})
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [editingNode,  setEditingNode]  = useState(null)
  const [editNodeData, setEditNodeData] = useState({})
  const [showJourneyModal, setShowJourneyModal] = useState(false)
  const [journeyTemplates, setJourneyTemplates] = useState([])
  const [applyingTemplate, setApplyingTemplate] = useState(null) // key of template being applied
  const [selectedTplPreview, setSelectedTplPreview] = useState(null)
  const [addForm, setAddForm] = useState({
    description: '', node_type: 'medical', status: 'future',
    planned_date: '', notes: '', stage_order: 15,
  })

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const [p, n] = await Promise.all([
      axios.get(`/api/patients/${id}`),
      axios.get(`/api/patients/${id}/nodes`),
    ])
    setPatient(p.data)
    // Parse condition_tags from JSON string if needed
    const patientData = {
      ...p.data,
      condition_tags: typeof p.data.condition_tags === 'string'
        ? JSON.parse(p.data.condition_tags || '[]')
        : (p.data.condition_tags || []),
    }
    setEditForm(patientData)
    setNodes(n.data)
    if (p.data.hmo_name) {
      const plans = await axios.get(`/api/patients/hmo-plans/${p.data.hmo_name}`)
      setHmoPlans(plans.data)
    }
  }

  const handleSavePatient = async () => {
    const payload = {
      ...editForm,
      condition_tags: JSON.stringify(editForm.condition_tags || []),
    }
    await axios.put(`/api/patients/${id}`, payload)
    setEditingInfo(false)
    fetchAll()
  }

  const handleAddNode = async (e) => {
    e.preventDefault()
    await axios.post(`/api/patients/${id}/nodes`, addForm)
    setShowAddForm(false)
    setAddForm({ description: '', node_type: 'medical', status: 'future', planned_date: '', notes: '', stage_order: 15 })
    fetchAll()
  }

  // ── Sub-items ──────────────────────────────────────────────────────────────
  const addSubItem = async (nodeId, text) => {
    if (!text.trim()) return
    await axios.post(`/api/patients/${id}/nodes/${nodeId}/subitems`, {
      text: text.trim(), sort_order: 99,
    })
    fetchAll()
  }

  const toggleSubItem = async (nodeId, itemId, isDone) => {
    await axios.put(`/api/patients/${id}/nodes/${nodeId}/subitems/${itemId}`, { is_done: isDone })
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, sub_items: n.sub_items.map(s => s.id === itemId ? { ...s, is_done: isDone } : s) }
      : n))
  }

  const deleteSubItem = async (nodeId, itemId) => {
    await axios.delete(`/api/patients/${id}/nodes/${nodeId}/subitems/${itemId}`)
    fetchAll()
  }

  // ── Journey templates ──────────────────────────────────────────────────────
  const openJourneyModal = async () => {
    if (!journeyTemplates.length) {
      const res = await axios.get(`/api/patients/${id}/journey-templates`)
      setJourneyTemplates(res.data)
    }
    setShowJourneyModal(true)
  }

  const applyTemplate = async (key) => {
    setApplyingTemplate(true)
    try {
      await axios.post(`/api/patients/${id}/journey-templates/${key}/apply`)
      fetchAll()
      setShowJourneyModal(false)
    } finally { setApplyingTemplate(false) }
  }

  const handleDeleteNode = async (nodeId) => {
    if (!window.confirm('למחוק צומת זה?')) return
    await axios.delete(`/api/patients/${id}/nodes/${nodeId}`)
    fetchAll()
  }

  const handleUpdateNode = async (nodeId, updates) => {
    await axios.put(`/api/patients/${id}/nodes/${nodeId}`, updates)
    fetchAll()
  }

  const startEditNode = (node) => {
    setEditingNode(node.id)
    setEditNodeData({ notes: node.notes || '', planned_date: node.planned_date || '' })
  }

  const saveEditNode = async (node) => {
    await handleUpdateNode(node.id, editNodeData)
    setEditingNode(null)
  }

  const idValid = validateIsraeliId(editForm.id_number)

  if (!patient) return <div className="p-8 text-slate-500">טוען...</div>

  const sorted = sortNodes(nodes)

  return (
    <div dir="rtl">
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{patient.full_name}</h1>
        <p className="text-slate-500 text-sm">{patient.id_number ? `ת.ז.: ${patient.id_number}` : 'ללא ת.ז.'}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <NavLink key={tab.to} to={`/manager/patients/${id}${tab.to ? '/' + tab.to : ''}`} end={tab.end}
            className={({ isActive }) =>
              `px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
               ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Patient info + quick nav */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <div className="flex justify-between items-start mb-4">
            <h2 className="font-semibold text-slate-800">נתונים בסיסיים</h2>
            <button onClick={() => setEditingInfo(!editingInfo)} className="text-sm text-blue-600 hover:underline">
              {editingInfo ? 'ביטול' : 'עריכה'}
            </button>
          </div>
          {editingInfo ? (
            <div className="space-y-3">
              <div><label className="label">שם מלא</label><input className="input" value={editForm.full_name || ''} onChange={e => setEditForm({...editForm, full_name: e.target.value})} /></div>
              <div>
                <label className="label">ת.ז.</label>
                <input
                  className={`input ${editForm.id_number && idValid === false ? 'border-red-400 focus:ring-red-300' : editForm.id_number && idValid === true ? 'border-green-400 focus:ring-green-300' : ''}`}
                  value={editForm.id_number || ''}
                  onChange={e => setEditForm({...editForm, id_number: e.target.value.replace(/\D/g, '').slice(0, 9)})}
                  placeholder="9 ספרות"
                  maxLength={9}
                  inputMode="numeric"
                />
                {editForm.id_number && idValid === false && (
                  <p className="text-red-500 text-xs mt-1">תעודת זהות לא תקינה</p>
                )}
                {editForm.id_number && idValid === true && (
                  <p className="text-green-600 text-xs mt-1">✓ תעודת זהות תקינה</p>
                )}
              </div>
              <div>
                <label className="label">סטטוס אבחנה</label>
                <select className="input" value={editForm.diagnosis_status || 'no'} onChange={e => setEditForm({...editForm, diagnosis_status: e.target.value})}>
                  <option value="no">ללא אבחנה</option><option value="yes">אבחנה קיימת</option><option value="pending">בבירור</option>
                </select>
              </div>
              <div><label className="label">פירוט אבחנה</label><textarea className="input" rows={2} value={editForm.diagnosis_details || ''} onChange={e => setEditForm({...editForm, diagnosis_details: e.target.value})} /></div>
              <div>
                <label className="label">אבחנות ותגיות רפואיות</label>
                <ConditionTagsSelector
                  value={editForm.condition_tags || []}
                  onChange={tags => setEditForm({ ...editForm, condition_tags: tags })}
                />
              </div>
              <div>
                <label className="label">שלב טיפולי</label>
                <select className="input" value={editForm.medical_stage || ''} onChange={e => setEditForm({...editForm, medical_stage: e.target.value})}>
                  {MEDICAL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">קופת חולים</label>
                  <select className="input" value={editForm.hmo_name || ''} onChange={async e => {
                    const hmo = e.target.value; setEditForm({...editForm, hmo_name: hmo, hmo_level: ''})
                    if (hmo) { const r = await axios.get(`/api/patients/hmo-plans/${hmo}`); setHmoPlans(r.data) }
                    else setHmoPlans([])
                  }}>
                    <option value="">— לא מוגדר —</option>
                    <option value="clalit">כללית</option><option value="maccabi">מכבי</option>
                    <option value="meuhedet">מאוחדת</option><option value="leumit">לאומית</option>
                  </select>
                </div>
                <div>
                  <label className="label">ביטוח משלים</label>
                  <select className="input" value={editForm.hmo_level || ''} onChange={e => setEditForm({...editForm, hmo_level: e.target.value})}>
                    <option value="">— בחר תוכנית —</option>
                    {hmoPlans.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">הערות</label><textarea className="input" rows={2} value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} /></div>
              <button
                onClick={handleSavePatient}
                className="btn-primary w-full"
              >שמור</button>
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
              {(() => {
                const tags = typeof patient.condition_tags === 'string'
                  ? JSON.parse(patient.condition_tags || '[]')
                  : (patient.condition_tags || [])
                return tags.length > 0 && (
                  <div>
                    <dt className="text-slate-500">אבחנות</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {tags.map(t => (
                        <span key={t} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </dd>
                  </div>
                )
              })()}
              {patient.medical_stage && (
                <div>
                  <dt className="text-slate-500">שלב טיפולי</dt>
                  <dd className="font-medium">
                    {MEDICAL_STAGES.find(s => s.value === patient.medical_stage)?.label || patient.medical_stage}
                  </dd>
                </div>
              )}
              {patient.notes && <div><dt className="text-slate-500">הערות</dt><dd>{patient.notes}</dd></div>}
            </dl>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">ניווט מהיר</h2>
          <div className="grid grid-cols-1 gap-2">
            {[
              { path: 'insurance', label: 'ניהול ביטוחים',    desc: 'הוסף וערוך פוליסות',        color: 'bg-green-50 text-green-700' },
              { path: 'claims',    label: 'מעקב תביעות',       desc: 'סטטוס תביעות ועדכונים',     color: 'bg-blue-50 text-blue-700' },
              { path: 'strategy',  label: 'אסטרטגיה פיננסית', desc: 'המלצות ומיפוי כיסויים',     color: 'bg-purple-50 text-purple-700' },
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

      {/* ═══ Unified timeline ═══════════════════════════════════════════════ */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-semibold text-slate-800">מסע מטופל — צמתי החלטה</h2>
          <div className="flex gap-2">
            <button onClick={openJourneyModal}
              className="text-sm border border-violet-300 text-violet-700 hover:bg-violet-50 px-3 py-1.5 rounded-xl font-medium">
              {t('apply_journey')}
            </button>
            <button onClick={() => setShowAddForm(v => !v)} className="btn-primary text-sm py-1.5">
              {showAddForm ? t('cancel') : t('add_node')}
            </button>
          </div>
        </div>

        {/* Add node form */}
        {showAddForm && (
          <form onSubmit={handleAddNode} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-sm font-medium text-slate-700">צומת החלטה חדש</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-1 sm:col-span-2">
                <label className="label">תיאור</label>
                <input className="input" value={addForm.description} onChange={e => setAddForm({...addForm, description: e.target.value})} placeholder="תאר את נקודת ההחלטה..." />
              </div>
              <div>
                <label className="label">מיקום בציר הזמן</label>
                <select className="input" value={addForm.stage_order} onChange={e => setAddForm({...addForm, stage_order: Number(e.target.value)})}>
                  {INSERT_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">סוג</label>
                <select className="input" value={addForm.node_type} onChange={e => setAddForm({...addForm, node_type: e.target.value})}>
                  <option value="medical">טיפולי</option>
                  <option value="financial">פיננסי</option>
                </select>
              </div>
              <div>
                <label className="label">תאריך מתוכנן</label>
                <input type="date" className="input" value={addForm.planned_date} onChange={e => setAddForm({...addForm, planned_date: e.target.value})} />
              </div>
              <div>
                <label className="label">סטטוס</label>
                <select className="input" value={addForm.status} onChange={e => setAddForm({...addForm, status: e.target.value})}>
                  <option value="future">עתידי</option><option value="active">פעיל</option><option value="completed">הושלם</option>
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="label">הערות</label>
                <input className="input" value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} placeholder="פרטים נוספים..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary text-sm py-1.5">ביטול</button>
              <button type="submit" className="btn-primary text-sm py-1.5">הוסף לציר</button>
            </div>
          </form>
        )}

        {/* Timeline */}
        <div className="relative">
          {sorted.map((node, i) => {
            const isStage  = node.node_type === 'stage'
            const isFixed  = isStage && FIXED_STAGES.includes(node.stage_order)
            const s        = STATUS_STYLES[node.status] || STATUS_STYLES.future
            const isLast   = i === sorted.length - 1
            const isEditing = editingNode === node.id

            return (
              <div key={node.id} className="flex gap-4 mb-0">
                {/* Left: dot + connector */}
                <div className="flex flex-col items-center flex-shrink-0 w-10">
                  {isFixed ? (
                    <div className={`w-10 h-10 rounded-full ring-2 ${s.ring} ${s.bg} flex items-center justify-center text-xl flex-shrink-0 z-10`}>
                      {node.status === 'completed' ? '✅' : (STAGE_ICONS[node.stage_order] || '📌')}
                    </div>
                  ) : (
                    <div className={`w-7 h-7 mt-1.5 rounded-full ring-2 ${s.ring} ${s.bg} flex items-center justify-center flex-shrink-0 z-10`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${node.status === 'completed' ? 'bg-green-500' : node.status === 'active' ? 'bg-blue-500' : 'bg-slate-300'}`} />
                    </div>
                  )}
                  {!isLast && (
                    <div className={`w-0.5 flex-1 min-h-6 ${s.connector} opacity-40 mt-0`} style={{ minHeight: '24px' }} />
                  )}
                </div>

                {/* Right: content */}
                <div className={`flex-1 pb-6 ${isLast ? 'pb-2' : ''}`}>
                  <div className={`rounded-xl p-3 ${isFixed ? `ring-1 ${s.ring} ${s.bg}` : 'border border-slate-100 bg-white hover:bg-slate-50'} transition-colors`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold text-sm ${isFixed ? s.text : 'text-slate-700'}`}>
                            {node.description}
                          </span>
                          {!isFixed && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${node.node_type === 'medical' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {node.node_type === 'medical' ? 'טיפולי' : 'פיננסי'}
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.badge}`}>
                            {STATUS_LABELS[node.status]}
                          </span>
                          {node.planned_date && (
                            <span className="text-[11px] text-slate-400">📅 {node.planned_date}</span>
                          )}
                        </div>
                        {/* Notes */}
                        {node.notes && !isEditing && (
                          <p className="text-xs text-slate-500 mt-1">{node.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <select
                          value={node.status}
                          onChange={e => handleUpdateNode(node.id, { status: e.target.value })}
                          className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="future">עתידי</option>
                          <option value="active">פעיל</option>
                          <option value="completed">הושלם</option>
                        </select>
                        <button
                          onClick={() => isEditing ? setEditingNode(null) : startEditNode(node)}
                          className="text-xs text-blue-400 hover:text-blue-600 px-1"
                          title="עריכה"
                        >✏️</button>
                        {!isFixed && (
                          <button onClick={() => handleDeleteNode(node.id)} className="text-xs text-red-300 hover:text-red-500 px-1" title="מחק">✕</button>
                        )}
                      </div>
                    </div>

                    {/* ── Sub-items checklist ── */}
                    <NodeChecklist
                      node={node}
                      onToggle={(itemId, done) => toggleSubItem(node.id, itemId, done)}
                      onAdd={(text) => addSubItem(node.id, text)}
                      onDelete={(itemId) => deleteSubItem(node.id, itemId)}
                    />

                    {/* Inline edit panel */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label text-xs">תאריך מתוכנן</label>
                            <input type="date" className="input text-xs py-1" value={editNodeData.planned_date} onChange={e => setEditNodeData({...editNodeData, planned_date: e.target.value})} />
                          </div>
                          <div>
                            <label className="label text-xs">הערות</label>
                            <input className="input text-xs py-1" value={editNodeData.notes} onChange={e => setEditNodeData({...editNodeData, notes: e.target.value})} placeholder="הוסף הערה..." />
                          </div>
                        </div>
                        {!isFixed && (
                          <div>
                            <label className="label text-xs">מיקום בציר</label>
                            <select className="input text-xs py-1" value={editNodeData.stage_order ?? node.stage_order ?? 15} onChange={e => setEditNodeData({...editNodeData, stage_order: Number(e.target.value)})}>
                              {INSERT_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => setEditingNode(null)} className="btn-secondary text-xs py-1 px-2">ביטול</button>
                          <button type="button" onClick={() => saveEditNode(node)} className="btn-primary text-xs py-1 px-2">שמור</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>

    {/* ── Journey template modal ────────────────────────────────────── */}
    {showJourneyModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h3 className="font-bold text-slate-800">החל מסע מחלה</h3>
              <p className="text-xs text-slate-500 mt-0.5">בחר תבנית — תוסיף צמתים עם תת-סעיפים לציר הזמן של המטופל</p>
            </div>
            <button onClick={() => setShowJourneyModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
          <div className="overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {journeyTemplates.map(tpl => (
              <button
                key={tpl.key}
                onClick={() => applyTemplate(tpl.key)}
                disabled={applyingTemplate}
                className="text-right p-4 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{tpl.icon}</span>
                  <span className="font-semibold text-slate-800 text-sm">{tpl.label}</span>
                </div>
                <p className="text-xs text-slate-500">{tpl.category} · {tpl.nodes.length} צמתים</p>
                <p className="text-xs text-slate-400 mt-1">{tpl.nodes.map(n => n.description).join(' → ')}</p>
              </button>
            ))}
          </div>
          {applyingTemplate && (
            <div className="px-6 pb-4 text-center text-sm text-violet-600">
              <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mr-2" />
              מחיל תבנית...
            </div>
          )}
        </div>
      </div>
    )}

    {/* Full-width resizable workflow panel */}
    <ResizablePanel
      direction="vertical"
      defaultSize={380}
      minSize={200}
      maxSize={750}
      className="border-t-2 border-slate-200 bg-white"
    >
      <WorkflowPanel patientId={id} />
    </ResizablePanel>
    </div>
  )
}

// ── NodeChecklist component ────────────────────────────────────────────────────
function NodeChecklist({ node, onToggle, onAdd, onDelete }) {
  const [newText, setNewText] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const items = node.sub_items || []
  const done = items.filter(i => i.is_done).length

  return (
    <div className="mt-2">
      {items.length > 0 && (
        <div className="space-y-1 mb-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={item.is_done}
                onChange={e => onToggle(item.id, e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600 cursor-pointer shrink-0"
              />
              <span className={`text-xs flex-1 ${item.is_done ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                {item.text}
              </span>
              <button
                onClick={() => onDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 text-xs leading-none transition-opacity"
              >✕</button>
            </div>
          ))}
          {items.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-1">{done}/{items.length} הושלמו</p>
          )}
        </div>
      )}

      {showAdd ? (
        <div className="flex gap-1 mt-1">
          <input
            className="flex-1 border border-slate-200 rounded px-2 py-0.5 text-xs"
            placeholder="תת-סעיף חדש..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onAdd(newText); setNewText(''); setShowAdd(false) } }}
            autoFocus
          />
          <button onClick={() => { onAdd(newText); setNewText(''); setShowAdd(false) }}
            className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">+</button>
          <button onClick={() => { setShowAdd(false); setNewText('') }}
            className="text-xs text-slate-400 px-1">✕</button>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="text-[10px] text-slate-400 hover:text-blue-600 mt-0.5">
          + הוסף תת-סעיף
        </button>
      )}
    </div>
  )
}
