'use client'

import * as React from 'react'

export type SlipwayUser = {
  username: string
  loginAt: number
  expiresAt: number
}

type AuthContextValue = {
  user: SlipwayUser | null
  login: (username: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  loading: boolean
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'slipway.session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

// Default credentials — override via env vars in production.
// NOTE: this is a client-side auth gate intended for self-hosted single-user
// deployments behind a reverse proxy. For multi-user or hardened deployments,
// replace with server-side sessions (NextAuth + Prisma).
const ADMIN_USER = process.env.NEXT_PUBLIC_SLIPWAY_ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_SLIPWAY_ADMIN_PASSWORD || 'admin'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SlipwayUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as SlipwayUser
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          setUser(parsed)
        } else {
          window.localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch {
      // ignore malformed session
    }
    setLoading(false)
  }, [])

  const login = React.useCallback((username: string, password: string) => {
    if (username.trim() === ADMIN_USER && password === ADMIN_PASSWORD) {
      const now = Date.now()
      const u: SlipwayUser = {
        username: ADMIN_USER,
        loginAt: now,
        expiresAt: now + SESSION_TTL_MS,
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
      } catch {
        // storage unavailable — session will not persist
      }
      setUser(u)
      return { ok: true }
    }
    return { ok: false, error: 'Invalid username or password' }
  }, [])

  const logout = React.useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  const value = React.useMemo(
    () => ({ user, login, logout, loading }),
    [user, login, logout, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    return {
      user: null,
      login: () => ({ ok: false, error: 'Auth not ready' }),
      logout: () => {},
      loading: true,
    } as AuthContextValue
  }
  return ctx
}
