import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'

const DemoModeContext = createContext({ isDemoMode: false, toggleDemoMode: () => {} })

// Only block endpoints that persist data — allow read/lookup operations
const BLOCKED_PATHS = [
  '/api/patients',
  '/api/claims',
  '/api/insurance',
  '/api/workflows',
  '/api/responsiveness',
  '/api/doctors',
  '/api/admin',
  '/api/settings',
  '/api/learning',
  '/api/public/feedback',
]

const ALLOWED_PATHS = [
  '/api/specialties/suggest',
  '/api/workflows/condition-tags',
]

function isBlockedInDemo(url, method) {
  if (!['post', 'put', 'patch', 'delete'].includes(method)) return false
  const path = (url || '').split('?')[0]
  if (ALLOWED_PATHS.some(p => path.includes(p))) return false
  return BLOCKED_PATHS.some(p => path.includes(p))
}

export function DemoModeProvider({ children }) {
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('demo_mode') === 'true')
  const interceptorRef = useRef(null)

  useEffect(() => {
    if (isDemoMode) {
      interceptorRef.current = axios.interceptors.request.use(config => {
        const method = (config.method || '').toLowerCase()
        if (isBlockedInDemo(config.url, method)) {
          config.adapter = () => Promise.resolve({
            data: { id: 9999, success: true, demo: true },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
          })
        }
        return config
      })
    } else {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current)
        interceptorRef.current = null
      }
    }
    return () => {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current)
        interceptorRef.current = null
      }
    }
  }, [isDemoMode])

  const toggleDemoMode = () => {
    setIsDemoMode(prev => {
      const next = !prev
      localStorage.setItem('demo_mode', String(next))
      return next
    })
  }

  return (
    <DemoModeContext.Provider value={{ isDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  )
}

export const useDemoMode = () => useContext(DemoModeContext)
