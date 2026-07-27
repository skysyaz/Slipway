"use client"

import * as React from "react"
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react"

export type SlipwayUser = {
  username: string
  loginAt: number
  expiresAt: number
}

type AuthContextValue = {
  user: SlipwayUser | null
  login: (username: string, password: string, totp?: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

/**
 * Real auth via NextAuth (server-side credentials, JWT httpOnly cookie).
 * Replaces the old client-side password check.
 */
function AuthInner({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession()

  const user = React.useMemo<SlipwayUser | null>(() => {
    if (!session?.user) return null
    const u = session.user as { username?: string; name?: string | null; role?: string }
    return {
      username: u.username || u.name || "user",
      loginAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    }
  }, [session])

  const login = React.useCallback(
    async (username: string, password: string, totp?: string) => {
      const res = await signIn("credentials", {
        username,
        password,
        ...(totp ? { totp } : {}),
        redirect: false,
      })
      if (res?.ok) {
        await update()
        return { ok: true }
      }
      return { ok: false, error: "Invalid username, password, or 2FA code" }
    },
    [update]
  )

  const logout = React.useCallback(async () => {
    await signOut({ redirect: false })
  }, [])

  const value = React.useMemo(
    () => ({ user, login, logout }),
    [user, login, logout]
  )

  // While the session is loading on first mount, render children gated by user=null.
  // status === "loading" is intentionally not a hard gate to avoid flashing in iframes;
  // user will be null until the session resolves, showing LoginView, then flips to the app.
  void status
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <AuthInner>{children}</AuthInner>
    </SessionProvider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    return {
      user: null,
      login: async () => ({ ok: false as const, error: "Auth not ready" }),
      logout: async () => {},
    } as AuthContextValue
  }
  return ctx
}