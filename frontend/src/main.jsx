import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import './index.css'

// Global axios interceptor — handles auth expiry and server errors
axios.interceptors.response.use(
  res => res,
  err => {
    const status = err?.response?.status
    if (status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.clear()
      window.location.href = '/login'
    } else if (status >= 500) {
      window.dispatchEvent(new CustomEvent('api-server-error', {
        detail: 'אירעה שגיאת שרת. נסה שנית בעוד מספר שניות.'
      }))
    }
    return Promise.reject(err)
  }
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
