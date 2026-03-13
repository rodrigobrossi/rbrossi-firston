import { useState, useCallback, createContext, useContext } from 'react'
import api from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('at') || null)
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(atob(sessionStorage.getItem('at')?.split('.')[1] || '')) } catch { return null }
  })

  const login = useCallback((accessToken, refreshToken) => {
    sessionStorage.setItem('at', accessToken)
    if (refreshToken) localStorage.setItem('rt', refreshToken)
    try { setUser(JSON.parse(atob(accessToken.split('.')[1]))) } catch {}
    setToken(accessToken)
  }, [])

  const logout = useCallback(async () => {
    const rt = localStorage.getItem('rt')
    if (rt) { try { await api.post('/auth/logout', { refreshToken: rt }) } catch {} }
    sessionStorage.removeItem('at')
    localStorage.removeItem('rt')
    setToken(null); setUser(null)
    window.location.replace('/login')
  }, [])

  return <AuthCtx.Provider value={{ token, user, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
