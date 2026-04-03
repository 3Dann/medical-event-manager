import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser)
        if (parsed.role === 'admin') parsed.role = 'manager'
        setUser(parsed)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  const login = (tokenData) => {
    localStorage.setItem('token', tokenData.access_token)
    localStorage.setItem('user', JSON.stringify({
      id: tokenData.user_id,
      full_name: tokenData.full_name,
      role: tokenData.role,
      is_admin: tokenData.is_admin || false,
    }))
    axios.defaults.headers.common['Authorization'] = `Bearer ${tokenData.access_token}`
    setUser({ id: tokenData.user_id, full_name: tokenData.full_name, role: tokenData.role, is_admin: tokenData.is_admin || false })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
