import axios from 'axios'

// All calls go to the BFF — never directly to microservices
const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = sessionStorage.getItem('at')
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      cfg.headers['x-user-id'] = payload.sub
    } catch {}
  }
  return cfg
})

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const rt = localStorage.getItem('rt')
      if (rt) {
        try {
          const { data } = await axios.post('/auth/refresh', { refreshToken: rt })
          sessionStorage.setItem('at', data.accessToken)
          localStorage.setItem('rt', data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          sessionStorage.removeItem('at'); localStorage.removeItem('rt')
          window.location.replace('/login')
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
