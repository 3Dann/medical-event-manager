import { useState, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState(null)
  const showToast = useCallback((msg, type = 'error') => setToast({ msg, type }), [])
  const dismissToast = useCallback(() => setToast(null), [])
  return { toast, showToast, dismissToast }
}
