import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export function useDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    axios.get('/api/admin/dashboard')
      .then(r => { setData(r.data); setError(null) })
      .catch(() => setError('שגיאה בטעינת הדשבורד'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
