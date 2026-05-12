/**
 * Central API service — all axios calls go through here.
 * Benefits: single place for auth headers, base URL, and error handling.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Attach token on every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auth & error handling
api.interceptors.response.use(
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

// ── Patient ────────────────────────────────────────────────────────────────
export const patients = {
  list:   (params) => api.get('/patients', { params }),
  get:    (id)     => api.get(`/patients/${id}`),
  create: (data)   => api.post('/patients', data),
  update: (id, data) => api.put(`/patients/${id}`, data),
  delete: (id)     => api.delete(`/patients/${id}`),
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export const tasks = {
  list:     (params) => api.get('/tasks/my', { params }),
  sync:     ()       => api.post('/tasks/sync'),
  complete: (id)     => api.post(`/tasks/${id}/complete`),
  delete:   (id)     => api.delete(`/tasks/${id}`),
  create:   (data)   => api.post('/tasks', data),
}

// ── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
  login:   (data) => api.post('/auth/login', data),
  logout:  ()     => api.post('/auth/logout'),
  me:      ()     => api.get('/auth/me'),
  register: (data) => api.post('/auth/register', data),
}

// ── Documents ─────────────────────────────────────────────────────────────
export const documents = {
  list:      (patientId) => api.get(`/patients/${patientId}/documents`),
  upload:    (patientId, form) => api.post(`/patients/${patientId}/documents`, form),
  download:  (patientId, docId) => api.get(`/patients/${patientId}/documents/${docId}/download`, { responseType: 'blob' }),
  viewToken: (patientId, docId) => api.post(`/patients/${patientId}/documents/${docId}/view-token`),
  delete:    (patientId, docId) => api.delete(`/patients/${patientId}/documents/${docId}`),
}

// ── Medications ───────────────────────────────────────────────────────────
export const medications = {
  search: (q) => api.get('/medications/search', { params: { q } }),
  list:   (patientId) => api.get(`/patients/${patientId}/medications`),
  create: (patientId, data) => api.post(`/patients/${patientId}/medications`, data),
  update: (patientId, id, data) => api.put(`/patients/${patientId}/medications/${id}`, data),
  delete: (patientId, id) => api.delete(`/patients/${patientId}/medications/${id}`),
}

export default api
