import { createContext, useContext, useState, useEffect } from 'react'

const SimpleContext = createContext({ simple: false, toggle: () => {} })

export function SimpleProvider({ children }) {
  const [simple, setSimple] = useState(() => {
    try { return localStorage.getItem('patient_simple_mode') === '1' } catch { return false }
  })

  const toggle = () => setSimple(v => {
    const next = !v
    try { localStorage.setItem('patient_simple_mode', next ? '1' : '0') } catch {}
    return next
  })

  return (
    <SimpleContext.Provider value={{ simple, toggle }}>
      {children}
    </SimpleContext.Provider>
  )
}

export const useSimple = () => useContext(SimpleContext)
