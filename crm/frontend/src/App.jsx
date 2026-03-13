import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout       from './components/layout/Layout'
import Login        from './pages/Login'
import Dashboard    from './pages/Dashboard'
import Contacts     from './pages/Contacts'
import Calendar     from './pages/Calendar'
import Pipeline     from './pages/Pipeline'
import Messages     from './pages/Messages'
import Contracts    from './pages/Contracts'
import Billing      from './pages/Billing'
import Settings     from './pages/Settings'

function Guard({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function AuthCallback() {
  const { login } = useAuth()
  const [params] = useSearchParams()
  const access  = params.get('access')
  const refresh = params.get('refresh')
  if (access) {
    login(access, refresh)
    window.location.replace('/dashboard')
  }
  return <div style={{ color:'#fff', padding:40, fontFamily:'sans-serif' }}>Autenticando…</div>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"          element={<Login />} />
      <Route path="/auth/callback"  element={<AuthCallback />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<Dashboard />} />
        <Route path="contacts"   element={<Contacts />} />
        <Route path="calendar"   element={<Calendar />} />
        <Route path="pipeline"   element={<Pipeline />} />
        <Route path="messages"   element={<Messages />} />
        <Route path="contracts"  element={<Contracts />} />
        <Route path="billing"    element={<Billing />} />
        <Route path="settings"   element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
