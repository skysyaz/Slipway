import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { db } from "./db"
import bcrypt from "bcryptjs"
import { createHash } from "node:crypto"
import type { NextRequest } from "next/server"
import { roleAllows, type AuthAction } from "./authz"

export type { AuthAction }

export interface AuthContext {
  userId?: string
  username: string
  role: string
  via: "session" | "token"
}

/**
 * Verified-token cache. Bearer auth has to bcrypt-compare the presented token
 * against every stored hash (bcrypt salts per row, so there is nothing to look
 * up by). At cost factor 10 that is ~100ms per stored token, on EVERY API
 * request — and the dashboard polls ten endpoints every 5s. Caching the
 * verified digest turns the hot path into a map hit.
 *
 * Keyed by SHA-256 of the presented token so the plaintext never sits in
 * memory. Entries are dropped on revoke (see invalidateTokenCache) and expire
 * on a short TTL so a deleted row can't authenticate for long.
 *
 * Ceiling: an *invalid* token still costs a full scan, so this does not defend
 * against brute force. Real fix is an indexed lookup column, which needs a
 * schema migration and re-minting existing tokens.
 */
const TOKEN_CACHE_TTL = 60_000
const tokenCache = new Map<string, { t: number; id: string }>()

const digest = (s: string) => createHash("sha256").update(s).digest("hex")

export function invalidateTokenCache(): void {
  tokenCache.clear()
}

/**
 * Authenticate an API request. Accepts either:
 *  - a valid NextAuth session cookie, or
 *  - an `Authorization: Bearer slipway_...` API token (hashed in the ApiToken table).
 * Returns null if unauthenticated.
 */
export async function getAuth(req: NextRequest): Promise<AuthContext | null> {
  // 1) Bearer token (CLI)
  const authHeader = req.headers.get("authorization") || ""
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    if (token.startsWith("slipway_")) {
      const key = digest(token)
      const cached = tokenCache.get(key)
      if (cached && Date.now() - cached.t < TOKEN_CACHE_TTL) {
        const t = await db.apiToken.findUnique({ where: { id: cached.id } })
        if (t) {
          await db.apiToken.update({
            where: { id: t.id },
            data: { lastUsedAt: new Date() },
          })
          return {
            userId: t.userId ?? undefined,
            username: t.name,
            role: t.scope, // read | deploy | admin
            via: "token",
          }
        }
        tokenCache.delete(key) // row is gone (revoked) — fall through to a scan
      }

      // tokens are stored hashed; find by comparing hash across active tokens.
      const candidates = await db.apiToken.findMany()
      for (const t of candidates) {
        if (await bcrypt.compare(token, t.tokenHash)) {
          tokenCache.set(key, { t: Date.now(), id: t.id })
          await db.apiToken.update({
            where: { id: t.id },
            data: { lastUsedAt: new Date() },
          })
          return {
            userId: t.userId ?? undefined,
            username: t.name,
            role: t.scope, // read | deploy | admin
            via: "token",
          }
        }
      }
      return null
    }
  }

  // 2) NextAuth session
  const session = await getServerSession(authOptions)
  if (session?.user) {
    return {
      userId: session.user.id,
      username: session.user.username || session.user.name || "user",
      role: session.user.role || "user",
      via: "session",
    }
  }
  return null
}

/** Throws a 401 JSON response if the request is not authenticated. */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const ctx = await getAuth(req)
  if (!ctx) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })
  }
  return ctx
}

/** Coarse role check. `admin` can do anything; `deploy` can deploy; `read` only reads. */
export function can(ctx: AuthContext, action: AuthAction): boolean {
  return roleAllows(ctx.role, action)
}
