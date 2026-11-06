/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { api, type AuthUser } from '../api/client'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const clearSession = useCallback(() => {
    setUser(null)
    queryClient.clear()
    if (location.pathname !== '/login') {
      navigate('/login', { replace: true, state: { from: location } })
    }
  }, [location, navigate, queryClient])

  useEffect(() => {
    let active = true
    api.me()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => api.onUnauthorized(clearSession), [clearSession])

  const login = useCallback(async (username: string, password: string) => {
    const csrfToken = await api.getCsrfToken()
    const authenticatedUser = await api.login(username, password, csrfToken)
    queryClient.clear()
    setUser(authenticatedUser)
  }, [queryClient])

  const logout = useCallback(async () => {
    try {
      const csrfToken = await api.getCsrfToken()
      await api.logout(csrfToken)
    } catch {
      // Local access is cleared even if the network cannot confirm cookie removal.
    } finally {
      setUser(null)
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }, [navigate, queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAdmin: Boolean(user?.roles.includes('ADMIN')),
    login,
    logout,
  }), [user, loading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
