import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import './index.css'

// Global axios interceptor — shows Hebrew error for unexpected server failures
axios.interceptors.response.use(
  res => res,
  err => {
    const status = err?.response?.status
    // Only alert for unexpected server errors (5xx), not auth/permission/validation
    if (status >= 500) {
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
