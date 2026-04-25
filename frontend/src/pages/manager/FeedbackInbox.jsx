import React, { useState, useEffect } from 'react'
import axios from 'axios'

const STARS = [1, 2, 3, 4, 5]

const TYPE_META = {
  bug:     { label: 'באג',          className: 'bg-red-100 text-red-700' },
  feature: { label: 'תכונה חדשה',  className: 'bg-blue-100 text-blue-700' },
  general: { label: 'כללי',         className: 'bg-slate-100 text-slate-600' },
}

export default function FeedbackInbox() {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    axios.get('/api/public/feedback')
      .then(r => { setFeedback(r.data); return axios.put('/api/public/feedback/mark-read') })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const avgRating = feedback.filter(f => f.rating).length > 0
    ? (feedback.filter(f => f.rating).reduce((s, f) => s + f.rating, 0) / feedback.filter(f => f.rating).length).toFixed(1)
    : null

  const progressUrl = `${window.location.origin}/progress`

  const bugs     = feedback.filter(f => f.feedback_type === 'bug').length
  const features = feedback.filter(f => f.feedback_type === 'feature').length

  const visible = filter === 'all' ? feedback : feedback.filter(f => f.feedback_type === filter)

  return (
    <div className="p-4 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">תיבת משוב</h2>
          <p className="text-slate-500 text-sm mt-0.5">משובים מהמשתמשים — באגים ורעיונות</p>
        </div>
      </div>

      {/* Share card */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-700 mb-2">🔗 שלח לקולגה</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={progressUrl}
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono"
          />
          <button
            onClick={() => navigator.clipboard.writeText(progressUrl)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            העתק
          </button>
        </div>
      </div>

      {/* Summary */}
      {feedback.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">סה"כ</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{feedback.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">ממוצע דירוג</p>
            <p className="text-3xl font-bold text-yellow-500 mt-1">{avgRating ? `${avgRating}★` : '—'}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 cursor-pointer hover:border-red-300 transition-colors" onClick={() => setFilter(f => f === 'bug' ? 'all' : 'bug')}>
            <p className="text-xs text-red-500">באגים</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{bugs}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setFilter(f => f === 'feature' ? 'all' : 'feature')}>
            <p className="text-xs text-blue-500">רעיונות</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{features}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {feedback.length > 0 && (
        <div className="flex gap-2">
          {[
            { key: 'all',     label: 'הכל' },
            { key: 'bug',     label: '🐛 באגים' },
            { key: 'feature', label: '💡 רעיונות' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                filter === f.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">טוען...</div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl text-center py-16">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium text-slate-600">{feedback.length === 0 ? 'אין משובים עדיין' : 'אין פריטים בקטגוריה זו'}</p>
          {feedback.length === 0 && <p className="text-sm text-slate-400 mt-1">המשתמשים יכולים לשלוח משוב דרך הכפתור הצף בממשק</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(f => {
            const typeMeta = TYPE_META[f.feedback_type] || TYPE_META.general
            return (
              <div key={f.id} className={`bg-white border rounded-xl p-4 space-y-2 ${!f.is_read ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold text-sm">{f.name?.[0] || '?'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{f.name}</p>
                      {f.role && <p className="text-xs text-slate-400">{f.role}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeMeta.className}`}>
                      {typeMeta.label}
                    </span>
                    {f.rating && (
                      <div className="flex">
                        {STARS.map(s => (
                          <span key={s} className={`text-sm ${s <= f.rating ? 'text-yellow-400' : 'text-slate-200'}`}>★</span>
                        ))}
                      </div>
                    )}
                    <span className="text-xs text-slate-400">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString('he-IL') : ''}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{f.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
