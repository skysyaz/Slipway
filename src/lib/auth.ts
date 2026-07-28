import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GitHubProvider from "next-auth/providers/github"
import GitLabProvider from "next-auth/providers/gitlab"
import bcrypt from "bcryptjs"
import { verify as verifyTotp } from "otplib"
import { db } from "./db"

/**
 * Clock-skew allowance for TOTP verification, in seconds. One 30s period each
 * way. Shared by the sign-in gate here and the 2FA enrolment confirmation in
 * /api/auth/2fa/verify so both accept the same codes.
 */
export const TOTP_TOLERANCE_SECONDS = 30

/**
 * Slipway auth — NextAuth v4.
 * - Credentials provider: username + bcrypt-hashed password (admin seeded).
 * - GitHub / GitLab OAuth: enabled only when client id/secret are set in env.
 * - JWT sessions (httpOnly cookie). API tokens (Bearer) handled separately
 *   in src/lib/server-auth.ts for CLI access.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7 days
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "slipway-secret-change-in-production-abc123",
  pages: { signIn: "/" }, // custom login view at "/"
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA code", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim()
        const password = credentials?.password ?? ""
        if (!username || !password) return null
        const user = await db.user.findUnique({ where: { username } })
        if (!user || !user.passwordHash) return null
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null
        // 2FA gate: if enabled, a valid TOTP code is required to sign in.
        if (user.totpEnabled && user.totpSecret) {
          const totp = (credentials?.totp ?? "").trim().replace(/\s+/g, "")
          if (!totp) return null
          let totpOk = false
          try {
            const res = await verifyTotp({
              token: totp,
              secret: user.totpSecret,
              // otplib defaults epochTolerance to 0 — the code is only valid
              // inside its exact 30s window. Any clock drift between the server
              // and the authenticator app (or a code typed as the window rolls)
              // then rejects a correct code. One period of tolerance is the
              // RFC 6238 recommendation.
              epochTolerance: TOTP_TOLERANCE_SECONDS,
            })
            totpOk = res.valid === true
          } catch {
            totpOk = false
          }
          if (!totpOk) return null
        }
        return {
          id: user.id,
          name: user.displayName || user.username,
          email: user.email ?? undefined,
          role: user.role,
          username: user.username,
        }
      },
    }),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.GITLAB_CLIENT_ID &&
    process.env.GITLAB_CLIENT_SECRET &&
    process.env.GITLAB_ISSUER
      ? [
          GitLabProvider({
            clientId: process.env.GITLAB_CLIENT_ID,
            clientSecret: process.env.GITLAB_CLIENT_SECRET,
            issuer: process.env.GITLAB_ISSUER,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // carry identity into the token
        token.uid = (user as { id?: string }).id
        token.username = (user as { username?: string }).username
        token.role = (user as { role?: string }).role || "user"
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as { id?: string }).id = token.uid as string | undefined
        ;(session.user as { username?: string }).username = token.username as
          | string
          | undefined
        ;(session.user as { role?: string }).role = token.role as string | undefined
      }
      return session
    },
  },
}