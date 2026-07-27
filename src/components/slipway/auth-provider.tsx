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
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'slipway.session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

// Default credentials — override via env vars in production.
const ADMIN_USER = process.env.NEXT_PUBLIC_SLIPWAY_ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_SLIPWAY_ADMIN_PASSWORD || 'admin'

// Safe localStorage helpers — never throw, even in sandboxed iframes.
function safeGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  } catch {
    // ignore — session just won't persist across reloads
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start with null user. On the client, after mount, check localStorage
  // for an existing session. This avoids any loading-gate that could get
  // stuck in restricted iframe environments.
  const [user, setUser] = React.useState<SlipwayUser | null>(null)

  // On mount, restore session from localStorage (if any).
  React.useEffect(() => {
    const raw = safeGet(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as SlipwayUser
      if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
        setUser(parsed)
      } else {
        safeRemove(STORAGE_KEY)
      }
    } catch {
      safeRemove(STORAGE_KEY)
    }
  }, [])

  const login = React.useCallback((username: string, password: string) => {
    if (username.trim() === ADMIN_USER && password === ADMIN_PASSWORD) {
      const now = Date.now()
      const u: SlipwayUser = {
        username: ADMIN_USER,
        loginAt: now,
        expiresAt: now + SESSION_TTL_MS,
      }
      safeSet(STORAGE_KEY, JSON.stringify(u))
      setUser(u)
      return { ok: true }
    }
    return { ok: false, error: 'Invalid username or password' }
  }, [])

  const logout = React.useCallback(() => {
    safeRemove(STORAGE_KEY)
    setUser(null)
  }, [])

  const value = React.useMemo(
    () => ({ user, login, logout }),
    [user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    // Fallback — should never happen since AuthProvider wraps everything,
    // but keeps the app from crashing if it does.
    return {
      user: null,
      login: () => ({ ok: false, error: 'Auth not ready' }),
      logout: () => {},
    } as AuthContextValue
  }
  return ctx
}
