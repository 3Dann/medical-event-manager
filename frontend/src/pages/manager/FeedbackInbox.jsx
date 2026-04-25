import React, { useState, useEffect } from 'react'
import axios from 'axios'

const TYPE_META = {
  bug:     { label: 'באג',         cls: 'bg-red-100 text-red-700' },
  feature: { label: 'תכונה חדשה', cls: 'bg-blue-100 text-blue-700' },
  general: { label: 'כללי',        cls: 'bg-slate-100 text-slate-600' },
}

function FeedbackCard({ item, onToggle }) {
  const type = TYPE_META[item.feedback_type] || TYPE_META.general
  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-3 transition-opacity ${item.is_handled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-slate-600 font-semibold text-sm">{item.name?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
            <p className="text-xs text-slate-400">{date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.cls}`}>{type.label}</span>
          <button
            onClick={() => onToggle(item.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              item.is_handled
                ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {item.is_handled ? 'החזר לממתינים' : 'סמן כטופל'}
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-4 py-3 leading-relaxed">{item.message}</p>
    </div>
  )
}

function Section({ title, items, emptyText, onToggle, accent }) {
  return (
    <div>
      <div className={`flex items-center gap-2 mb-3`}>
        <span className={`w-2.5 h-2.5 rounded-full ${accent}`} />
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.map(f => <FeedbackCard key={f.id} item={f} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  )
}

export default function FeedbackInbox() {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    axios.get('/api/public/feedback')
      .then(r => {
        setFeedback(r.data)
        axios.put('/api/public/feedback/mark-read').catch(() => {})
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const toggleHandled = async (id) => {
    try {
      const r = await axios.put(`/api/public/feedback/${id}/handle`)
      setFeedback(prev => prev.map(f => f.id === id ? r.data : f))
    } catch (_) {}
  }

  const filtered = filter === 'all' ? feedback : feedback.filter(f => f.feedback_type === filter)

  const sorted = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const pending  = sorted.filter(f => !f.is_handled)
  const handled  = sorted.filter(f => f.is_handled)

  const bugs     = feedback.filter(f => f.feedback_type === 'bug').length
  const features = feedback.filter(f => f.feedback_type === 'feature').length

  return (
    <div className="p-4 md:p-8 space-y-6" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-800">תיבת משוב</h2>
        <p className="text-slate-500 text-sm mt-0.5">כל המשובים שנשלחו — ממתינים לטיפול ושטופלו</p>
      </div>

      {/* Stats */}
      {feedback.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{feedback.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">סה"כ</p>
          </div>
          <div className="bg-white border border-orange-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">{pending.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">ממתינים</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center cursor-pointer hover:border-red-300 transition-colors" onClick={() => setFilter(f => f === 'bug' ? 'all' : 'bug')}>
            <p className="text-2xl font-bold text-red-500">{bugs}</p>
            <p className="text-xs text-slate-500 mt-0.5">באגים</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setFilter(f => f === 'feature' ? 'all' : 'feature')}>
            <p className="text-2xl font-bold text-blue-500">{features}</p>
            <p className="text-xs text-slate-500 mt-0.5">רעיונות</p>
          </div>
        </div>
      )}

      {/* Filter */}
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

      {loading ? (
        <div className="text-center py-16 text-slate-400">טוען...</div>
      ) : feedback.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl text-center py-16">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium text-slate-600">אין משובים עדיין</p>
          <p className="text-sm text-slate-400 mt-1">משובים יישלחו דרך כפתור "שלח משוב" בסיידבר</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            title="ממתינים לטיפול"
            items={pending}
            emptyText="אין פריטים הממתינים לטיפול"
            onToggle={toggleHandled}
            accent="bg-orange-400"
          />
          <Section
            title="טופלו"
            items={handled}
            emptyText="אין פריטים שטופלו עדיין"
            onToggle={toggleHandled}
            accent="bg-green-400"
          />
        </div>
      )}
    </div>
  )
}
