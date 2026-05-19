import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ count: 0, items: [] })
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    let ctrl = new AbortController()
    let timeoutId = null
    let backoffMs = 120000   // base: 2 minutes
    let emptyStreak = 0

    const load = () => {
      clearTimeout(timeoutId)  // always cancel pending timeout before scheduling a new one
      if (document.visibilityState === 'hidden') {
        // Skip while tab is in background; reschedule for when it becomes visible
        timeoutId = setTimeout(load, backoffMs)
        return
      }
      ctrl.abort()
      ctrl = new AbortController()
      axios.get('/api/notifications', { signal: ctrl.signal })
        .then(r => {
          setData(r.data)
          if ((r.data?.count ?? 0) === 0) {
            emptyStreak = Math.min(emptyStreak + 1, 5)
            // After 5 empty responses back off up to 5 minutes
            backoffMs = Math.min(120000 * Math.pow(1.5, emptyStreak - 1), 300000)
          } else {
            emptyStreak = 0
            backoffMs = 120000  // reset on new notifications
          }
          timeoutId = setTimeout(load, backoffMs)
        })
        .catch(e => {
          if (!axios.isCancel(e)) {
            backoffMs = Math.min(backoffMs * 2, 300000)  // backoff on error
            timeoutId = setTimeout(load, backoffMs)
          }
        })
    }

    load()
    document.addEventListener('visibilitychange', load)
    return () => {
      clearTimeout(timeoutId)
      ctrl.abort()
      document.removeEventListener('visibilitychange', load)
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const TYPE_ICONS = {
    overdue_task:          '⏰',
    sla_breach:            '🚨',
    patient_request:       '📩',
    patient_document:      '📎',
    pending_registration:  '📝',
  }

  return (
    <div ref={ref} className="relative" dir="rtl">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="התראות"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {data.count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {data.count > 9 ? '9+' : data.count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-sm">התראות</span>
            {data.count > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{data.count}</span>
            )}
          </div>
          {data.items.length === 0 ? (
            <div role="status" aria-live="polite" className="py-8 text-center text-slate-500 text-sm">אין התראות חדשות</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {data.items.map(n => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      if (n.type === 'pending_registration') {
                        navigate('/manager/admin')
                      } else if (n.patient_id) {
                        const path = n.type === 'patient_document'
                          ? `/manager/patients/${n.patient_id}/documents`
                          : n.type === 'patient_request'
                          ? `/manager/patients/${n.patient_id}/requests`
                          : `/manager/patients/${n.patient_id}`
                        navigate(path)
                      }
                      setOpen(false)
                    }}
                    className="w-full text-right px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${
                        n.severity === 'critical' ? 'text-red-700' :
                        n.severity === 'info'     ? 'text-blue-700' :
                        'text-slate-800'
                      }`}>
                        {n.title}
                      </p>
                      {n.created_at && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(n.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-2 border-t border-slate-100">
            <button
              onClick={() => { navigate('/manager/my-day'); setOpen(false) }}
              className="text-xs text-blue-600 hover:underline w-full text-right"
            >
              ראה את כל המשימות
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
