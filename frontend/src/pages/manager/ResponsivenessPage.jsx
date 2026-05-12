import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useTranslation } from 'react-i18next'

export default function ResponsivenessPage() {
  const { t } = useTranslation('responsiveness')
  const TYPE_LABELS = {
    hmo: t('type_hmo'), private: t('type_private'),
    sal_habriut: t('type_sal'), bituch_leumi: t('type_leumi'),
  }
  const [scores, setScores] = useState([])
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => {
    const ctrl = new AbortController()
    fetchScores(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  const fetchScores = async (signal) => {
    try {
      const res = await axios.get('/api/responsiveness', { signal })
      setScores(res.data)
    } catch (e) { if (!axios.isCancel(e)) setScores([]) }
  }

  const handleEdit = (score) => {
    setEditing(score.id)
    setEditForm({ response_speed: score.response_speed, bureaucracy_level: score.bureaucracy_level, notes: score.notes || '' })
  }

  const handleSave = async (id) => {
    await axios.put(`/api/responsiveness/${id}`, editForm)
    setEditing(null); fetchScores()
  }

  const grouped = scores.reduce((acc, s) => {
    const type = s.company_type
    if (!acc[type]) acc[type] = []
    acc[type].push(s)
    return acc
  }, {})

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <strong>{t('strategy_impact_title')}:</strong> {t('strategy_impact_desc')}
      </div>

      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{TYPE_LABELS[type] || type}</h2>
          <div className="space-y-3">
            {items.map(score => (
              <div key={score.id} className="p-4 bg-slate-50 rounded-xl">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-slate-800">{score.company_name}</h3>
                      {score.is_default && <span className="badge-gray text-xs">{t('default_score')}</span>}
                      <span className="text-lg font-bold text-blue-600">{score.overall_score}/10</span>
                    </div>

                    {editing === score.id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">{t('speed_label')}: {editForm.response_speed}/10</label>
                          <input type="range" min="1" max="10" step="0.5" value={editForm.response_speed}
                            onChange={e => setEditForm({...editForm, response_speed: parseFloat(e.target.value)})}
                            className="w-full accent-blue-600" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">{t('bureaucracy_min_label')}: {editForm.bureaucracy_level}/10</label>
                          <input type="range" min="1" max="10" step="0.5" value={editForm.bureaucracy_level}
                            onChange={e => setEditForm({...editForm, bureaucracy_level: parseFloat(e.target.value)})}
                            className="w-full accent-green-600" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">{t('notes')}</label>
                          <input className="input text-sm" value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} placeholder={t('score_explanation_placeholder')} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSave(score.id)} className="btn-primary text-sm py-1.5">{t('save')}</button>
                          <button onClick={() => setEditing(null)} className="btn-secondary text-sm py-1.5">{t('common:cancel', { ns: 'common' })}</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex gap-6 text-sm text-slate-600">
                          <span>⚡ {t('speed_label')}: <strong>{score.response_speed}/10</strong></span>
                          <span>📋 {t('bureaucracy_label')}: <strong>{score.bureaucracy_level}/10</strong></span>
                        </div>
                        {score.notes && <p className="text-xs text-slate-500 mt-1">{score.notes}</p>}
                        {/* Visual bar */}
                        <div className="mt-2 flex gap-2 items-center">
                          <div className="flex-1 bg-slate-200 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${score.overall_score * 10}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8">{score.overall_score}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {editing !== score.id && (
                    <button onClick={() => handleEdit(score)} className="text-sm text-blue-600 hover:underline mr-4">{t('edit')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
