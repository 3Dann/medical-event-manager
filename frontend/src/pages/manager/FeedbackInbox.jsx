import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useToast } from '../../hooks/useToast'
import AppToast from '../../components/AppToast'
import { useTranslation } from 'react-i18next'

function FeedbackCard({ item, onToggle, toggling }) {
  const { t } = useTranslation('feedback')
  const TYPE_META = {
    bug:     { label: t('type_bug'),     cls: 'bg-red-100 text-red-700' },
    feature: { label: t('type_feature'), cls: 'bg-blue-100 text-blue-700' },
    general: { label: t('type_general'), cls: 'bg-slate-100 text-slate-600' },
  }
  const type = TYPE_META[item.feedback_type] || TYPE_META.general
  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-all duration-300 ${
      item.is_handled
        ? 'bg-green-50/40 border-green-100'
        : 'bg-white border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            item.is_handled ? 'bg-green-100' : 'bg-slate-100'
          }`}>
            {item.is_handled
              ? <span className="text-green-600 font-bold text-base">✓</span>
              : <span className="text-slate-600 font-semibold text-sm">{item.name?.[0]?.toUpperCase() || '?'}</span>
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-semibold text-sm truncate ${item.is_handled ? 'text-slate-500' : 'text-slate-800'}`}>
                {item.name}
              </p>
              {item.is_handled && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">טופל</span>
              )}
            </div>
            <p className="text-xs text-slate-400">{date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.cls}`}>{type.label}</span>
          <button
            onClick={() => onToggle(item.id)}
            disabled={toggling}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              item.is_handled
                ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {toggling ? '...' : item.is_handled ? t('mark_pending') : t('mark_handled')}
          </button>
        </div>
      </div>
      <p className={`text-sm rounded-lg px-4 py-3 leading-relaxed ${
        item.is_handled ? 'bg-green-50/60 text-slate-500' : 'bg-slate-50 text-slate-700'
      }`}>{item.message}</p>
    </div>
  )
}

export default function FeedbackInbox() {
  const { t } = useTranslation('feedback')
  const [feedback, setFeedback]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all')
  const [togglingId, setTogglingId] = useState(null)
  const [showHandled, setShowHandled] = useState(false)
  const { toast, showToast, dismissToast } = useToast()

  useEffect(() => {
    const ctrl = new AbortController()
    axios.get('/api/public/feedback', { signal: ctrl.signal })
      .then(r => {
        setFeedback(r.data)
        axios.put('/api/public/feedback/mark-read').catch(() => {})
      })
      .catch(e => { if (!axios.isCancel(e)) showToast(t('load_error')) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const toggleHandled = async (id) => {
    setTogglingId(id)
    try {
      const r = await axios.put(`/api/public/feedback/${id}/handle`)
      setFeedback(prev => prev.map(f => f.id === id ? r.data : f))
      if (r.data.is_handled) {
        showToast('הרשומה סומנה כטופלה ועברה לארכיון', 'success')
        setShowHandled(true)
      }
    } catch {
      showToast('שגיאה בעדכון הסטטוס — נסה שוב', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const allPending = feedback.filter(f => !f.is_handled)
  const allHandled = feedback.filter(f => f.is_handled)

  const filtered = filter === 'all' ? feedback : feedback.filter(f => f.feedback_type === filter)
  const sorted   = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const pending  = sorted.filter(f => !f.is_handled)
  const handled  = sorted.filter(f => f.is_handled)

  const bugs     = feedback.filter(f => f.feedback_type === 'bug').length
  const features = feedback.filter(f => f.feedback_type === 'feature').length

  return (
    <div className="p-4 md:p-8 space-y-6" dir="rtl">
      {toast && <AppToast msg={toast?.msg} type={toast?.type} onDismiss={dismissToast} />}

      <div>
        <h2 className="text-xl font-bold text-slate-800">{t('title')}</h2>
        <p className="text-slate-500 text-sm mt-0.5">{t('subtitle')}</p>
      </div>

      {/* Stats */}
      {feedback.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{feedback.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('stat_total')}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">{allPending.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('stat_pending')}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{allHandled.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('stat_handled')}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center cursor-pointer hover:border-red-300 transition-colors" onClick={() => setFilter(f => f === 'bug' ? 'all' : 'bug')}>
            <p className="text-2xl font-bold text-red-500">{bugs}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('stat_bugs')}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'all',     label: t('filter_all') },
          { key: 'bug',     label: `🐛 ${t('stat_bugs')}` },
          { key: 'feature', label: `💡 ${t('stat_ideas')}` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              filter === f.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">{t('common:loading', { ns: 'common' })}</div>
      ) : feedback.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl text-center py-16">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium text-slate-600">{t('no_feedback')}</p>
          <p className="text-sm text-slate-400 mt-1">{t('no_feedback_hint')}</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Pending section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <h3 className="font-semibold text-slate-700 text-sm">{t('section_pending')}</h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">{t('section_pending_empty')}</p>
            ) : (
              <div className="space-y-3">
                {pending.map(f => (
                  <FeedbackCard key={f.id} item={f} onToggle={toggleHandled} toggling={togglingId === f.id} />
                ))}
              </div>
            )}
          </div>

          {/* Handled archive — collapsible */}
          <div>
            <button
              onClick={() => setShowHandled(v => !v)}
              className="flex items-center gap-2 mb-3 w-full text-right hover:opacity-80 transition-opacity"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
              <h3 className="font-semibold text-slate-700 text-sm">ארכיון — טופלו</h3>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{allHandled.length}</span>
              <span className="mr-auto text-xs text-slate-400">{showHandled ? '▲ הסתר' : '▼ הצג'}</span>
            </button>
            {showHandled && (
              handled.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">{t('section_handled_empty')}</p>
              ) : (
                <div className="space-y-3">
                  {handled.map(f => (
                    <FeedbackCard key={f.id} item={f} onToggle={toggleHandled} toggling={togglingId === f.id} />
                  ))}
                </div>
              )
            )}
          </div>

        </div>
      )}
    </div>
  )
}
