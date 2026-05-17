import { useEffect } from 'react'
import { useDev } from '../context/DevContext'

export default function DevGate({ children }) {
  const { setDevUnlocked } = useDev()
  useEffect(() => { setDevUnlocked(true) }, [])
  return children
}
