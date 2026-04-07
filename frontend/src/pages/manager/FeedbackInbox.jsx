import React, { useState, useEffect } from 'react'
import axios from 'axios'

const STARS = [1, 2, 3, 4, 5]

export default function FeedbackInbox() {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/public/feedback')
      .then(r => setFeedback(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const avgRating = feedback.filter(f => f.rating).length > 0
    ? (feedback.filter(f => f.rating).reduce((s, f) => s + f.rating, 0) / feedback.filter(f => f.rating).length).toFixed(1)
    : null

  const progressUrl = `${window.location.origin}/progress`

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">משובים</h2>
          <p className="text-slate-500 text-sm mt-0.5">משובים שהתקבלו דרך עמוד ההתקדמות</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="text-xs text-slate-500">סה"כ משובים</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{feedback.length}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs text-slate-500">ממוצע דירוג</p>
            <p className="text-3xl font-bold text-yellow-500 mt-1">{avgRating ? `${avgRating}★` : '—'}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs text-slate-500">אחרון התקבל</p>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              {feedback[0]?.created_at ? new Date(feedback[0].created_at).toLocaleDateString('he-IL') : '—'}
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">טוען...</div>
      ) : feedback.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium text-slate-600">אין משובים עדיין</p>
          <p className="text-sm text-slate-400 mt-1">שתף את הקישור עם קולגה כדי לקבל משוב</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map(f => (
            <div key={f.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold text-sm">{f.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{f.name}</p>
                    {f.role && <p className="text-xs text-slate-400">{f.role}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
          ))}
        </div>
      )}
    </div>
  )
}
