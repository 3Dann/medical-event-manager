import React, { useState } from 'react'
import axios from 'axios'

const FEATURES = [
  {
    category: 'ניהול מטופלים',
    items: [
      { label: 'יצירת תיק מטופל עם אבחנה וקופת חולים', done: true },
      { label: 'ייבוא כיסויי סל הבריאות לפי ת.ז.', done: true },
      { label: 'ניהול מקורות ביטוח (קופ"ח, הר הביטוח, פרטי, ב"ל)', done: true },
      { label: 'מטריצת כיסויים לפי קטגוריה', done: true },
    ],
  },
  {
    category: 'אסטרטגיה פיננסית',
    items: [
      { label: 'אלגוריתם דירוג מקורות ביטוח לפי עדיפות', done: true },
      { label: 'רצף תביעות מומלץ לכל קטגוריה', done: true },
      { label: 'ציון רספונסיביות לכל חברת ביטוח', done: true },
      { label: 'זיהוי פערים בכיסוי', done: true },
    ],
  },
  {
    category: 'מעקב תביעות',
    items: [
      { label: 'הגשה ומעקב סטטוס תביעות', done: true },
      { label: 'חישוב סכומים נתבעים מול מאושרים', done: true },
      { label: 'ניהול עדיפויות ודדליינים', done: true },
    ],
  },
  {
    category: 'מערכת לומדת (AI)',
    items: [
      { label: 'ניתוח שיעורי אישור לפי מקור ביטוח', done: true },
      { label: 'זיהוי פערים נפוצים ממטופלים דומים', done: true },
      { label: 'עדכון ציון היענות לפי תוצאות תביעות', done: true },
      { label: 'badge ביטחון על המלצות אסטרטגיה', done: true },
    ],
  },
  {
    category: 'בפיתוח',
    items: [
      { label: 'אפליקציית מובייל', done: false },
      { label: 'התראות אוטומטיות לפי דדליינים', done: false },
      { label: 'ייצוא דוחות PDF', done: false },
    ],
  },
]

const STARS = [1, 2, 3, 4, 5]

export default function ProgressPage() {
  const [form, setForm] = useState({ name: '', role: '', message: '', rating: 0 })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await axios.post('/api/public/feedback', {
        name: form.name,
        role: form.role || null,
        message: form.message,
        rating: form.rating || null,
      })
      setSubmitted(true)
    } catch {
      setError('שגיאה בשליחה, נסה שוב')
    } finally {
      setSubmitting(false)
    }
  }

  const doneCount = FEATURES.flatMap(f => f.items).filter(i => i.done).length
  const totalCount = FEATURES.flatMap(f => f.items).length

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🏥</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Medical Event Manager</h1>
              <p className="text-sm text-slate-500">עדכון התקדמות פרויקט</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>התקדמות כוללת</span>
              <span className="font-semibold">{doneCount}/{totalCount} פיצ'רים</span>
            </div>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${Math.round(doneCount / totalCount * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{Math.round(doneCount / totalCount * 100)}% הושלם</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Feature list */}
        <div className="space-y-5">
          {FEATURES.map(section => (
            <div key={section.category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
                <h2 className="font-semibold text-slate-700 text-sm">{section.category}</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {section.items.map(item => (
                  <div key={item.label} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${item.done ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                      {item.done ? '✓' : '○'}
                    </span>
                    <span className={`text-sm ${item.done ? 'text-slate-800' : 'text-slate-400'}`}>{item.label}</span>
                    {!item.done && <span className="mr-auto text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">בפיתוח</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Feedback form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">משוב</h2>
          <p className="text-sm text-slate-500 mb-5">כל הערה תעזור לנו לשפר את המוצר</p>

          {submitted ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🙏</div>
              <p className="font-semibold text-slate-800">תודה על המשוב!</p>
              <p className="text-sm text-slate-500 mt-1">הודעתך התקבלה</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם *</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="שמך"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תפקיד</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="למשל: מנהל תיקים, רופא..."
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">הערות והמלצות *</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="מה עבד טוב? מה חסר? מה ניתן לשפר?"
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">דירוג כללי</label>
                <div className="flex gap-1">
                  {STARS.map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setForm({ ...form, rating: star })}
                      className={`text-2xl transition-transform hover:scale-110 ${star <= form.rating ? 'text-yellow-400' : 'text-slate-200'}`}
                    >
                      ★
                    </button>
                  ))}
                  {form.rating > 0 && (
                    <span className="text-sm text-slate-500 mr-2 self-center">{form.rating}/5</span>
                  )}
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {submitting ? 'שולח...' : 'שלח משוב'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">Medical Event Manager © 2026</p>
      </div>
    </div>
  )
}
