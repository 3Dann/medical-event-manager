import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export function useDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback((signal) => {
    setLoading(true)
    axios.get('/api/admin/dashboard', { signal })
      .then(r => { setData(r.data); setError(null) })
      .catch(e => { if (!axios.isCancel(e)) setError('שגיאה בטעינת הדשבורד') })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    refresh(ctrl.signal)
    return () => ctrl.abort()
  }, [refresh])

  return { data, loading, error, refresh }
}
