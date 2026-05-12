import { useEffect, useRef } from 'react'

const IDLE_MS = 30 * 60 * 1000 // 30 minutes

export function useIdleTimeout(onTimeout) {
  const timer = useRef(null)

  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(onTimeout, IDLE_MS)
    }

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [onTimeout])
}
