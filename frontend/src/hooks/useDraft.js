import { useState, useEffect, useRef } from 'react'

/**
 * שומר טיוטה ב-sessionStorage ומשחזר בפתיחה הבאה.
 *
 * @param {string} key         — מפתח ייחודי לטיוטה (כולל patient_id)
 * @param {object} initialState — ערכי ברירת מחדל לטופס
 * @param {object} [opts]
 * @param {number} [opts.debounce=600] — ms להמתנה לפני שמירה
 * @returns [state, setState, { clearDraft, hasDraft }]
 */
export function useDraft(key, initialState, { debounce = 600 } = {}) {
  // key=null → plain useState, no draft persistence (used for edit-mode forms)
  const [state, _setState] = useState(() => {
    if (!key) return initialState
    try {
      const saved = sessionStorage.getItem(key)
      if (!saved) return initialState
      return { ...initialState, ...JSON.parse(saved) }
    } catch {
      return initialState
    }
  })

  const [hasDraft, setHasDraft] = useState(() => {
    if (!key) return false
    try { return !!sessionStorage.getItem(key) } catch { return false }
  })

  const timer = useRef(null)
  const isFirst = useRef(true)

  useEffect(() => {
    if (!key) return
    if (isFirst.current) { isFirst.current = false; return }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(state))
        setHasDraft(true)
      } catch {}
    }, debounce)
    return () => clearTimeout(timer.current)
  }, [state, key, debounce])

  const setState = (update) => _setState(prev =>
    typeof update === 'function' ? update(prev) : update
  )

  const clearDraft = (resetToInitial = false) => {
    try { sessionStorage.removeItem(key) } catch {}
    setHasDraft(false)
    if (resetToInitial) _setState(initialState)
  }

  return [state, setState, { clearDraft, hasDraft }]
}
