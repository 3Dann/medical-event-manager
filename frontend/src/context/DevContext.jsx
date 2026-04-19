import { createContext, useContext, useState } from 'react'

const DevContext = createContext({
  isDevUnlocked: false,
  setDevUnlocked: () => {},
  isEditMode: false,
  setEditMode: () => {},
})

export function DevProvider({ children }) {
  const [isDevUnlocked, setDevUnlocked] = useState(false)
  const [isEditMode, setEditMode]       = useState(false)
  return (
    <DevContext.Provider value={{ isDevUnlocked, setDevUnlocked, isEditMode, setEditMode }}>
      {children}
    </DevContext.Provider>
  )
}

export const useDev = () => useContext(DevContext)
