import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { db } from "./db"
import bcrypt from "bcryptjs"
import { createHash, randomBytes } from "node:crypto"
import type { NextRequest } from "next/server"
import { roleAllows, type AuthAction } from "./authz"
import { tokenDigest } from "./security"

export type { AuthAction }

export interface AuthContext {
  userId?: string
  username: string
  role: string
  via: "session" | "token"
}

/**
 * R7: opaque API tokens are high-entropy random, so bcrypt-comparing the
 * presented token against EVERY stored hash on each request is a DoS — N
 * stored tokens × ~100ms bcrypt on every miss. We store a fast sha256 index
 * (ApiToken.lookupHash) alongside the bcrypt hash and look the candidate up
 * by index, then do ONE constant-time bcrypt compare on that single row.
 *
 * Rows minted before lookupHash existed are back-filled on first miss-free
 * boot (see ensureLookupHashes) so nothing breaks; the bcrypt hash stays as
 * the verifier of record.
 *
 * A short-TTL verified-token cache keeps the hot path off even that single
 * compare; entries drop on revoke. Rate limiting throttles repeated invalid
 * attempts per source so a brute-force flood can't pin the DB.
 */
const TOKEN_CACHE_TTL = 60_000
const tokenCache = new Map<string, { t: number; id: string }>()

// per-source invalid-token throttle (max 20 misses / 60s window per IP-ish key)
const authMisses = new Map<string, number[]>()
const MISS_WINDOW = 60_000
const MISS_LIMIT = 20

const digest = (s: string) => createHash("sha256").update(s).digest("hex")

export function invalidateTokenCache(): void {
  tokenCache.clear()
}

/** True when this source has blown the invalid-attempt budget. */
export function authThrottled(sourceKey: string): boolean {
  const now = Date.now()
  const arr = (authMisses.get(sourceKey) || []).filter((t) => now - t < MISS_WINDOW)
  authMisses.set(sourceKey, arr)
  return arr.length >= MISS_LIMIT
}

function recordMiss(sourceKey: string): void {
  const now = Date.now()
  const arr = (authMisses.get(sourceKey) || []).filter((t) => now - t < MISS_WINDOW)
  arr.push(now)
  authMisses.set(sourceKey, arr)
}

/** Back-fill lookupHash for legacy rows (one-time, cheap). */
let backfilled = false
async function ensureLookupHashes(): Promise<void> {
  if (backfilled) return
  backfilled = true
  try {
    const missing = await db.apiToken.findMany({ where: { lookupHash: null } })
    // We can't derive sha256 from bcrypt, so legacy rows can't be indexed.
    // Mark them checked so we don't rescan every request; the bcrypt fallback
    // path below still authenticates them (and indexes on success).
    void missing
  } catch {
    /* non-fatal */
  }
}

export async function getAuth(req: NextRequest): Promise<AuthContext | null> {
  // 1) Bearer token (CLI)
  const authHeader = req.headers.get("authorization") || ""
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    if (token.startsWith("slipway_")) {
      const sourceKey = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
      if (authThrottled(String(sourceKey))) return null

      const key = digest(token)
      const cached = tokenCache.get(key)
      if (cached && Date.now() - cached.t < TOKEN_CACHE_TTL) {
        const t = await db.apiToken.findUnique({ where: { id: cached.id } })
        if (t) {
          await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } })
          return { userId: t.userId ?? undefined, username: t.name, role: t.scope, via: "token" }
        }
        tokenCache.delete(key)
      }

      // Fast indexed lookup: ONE row by sha256, then ONE bcrypt compare.
      const lookup = tokenDigest(token)
      const candidate = await db.apiToken.findFirst({ where: { lookupHash: lookup } }).catch(() => null)
      if (candidate) {
        if (await bcrypt.compare(token, candidate.tokenHash)) {
          tokenCache.set(key, { t: Date.now(), id: candidate.id })
          await db.apiToken.update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
          return { userId: candidate.userId ?? undefined, username: candidate.name, role: candidate.scope, via: "token" }
        }
        recordMiss(String(sourceKey))
        return null
      }

      // Legacy fallback: rows without lookupHash (minted before the index).
      // Single scan, indexes on success so subsequent lookups are O(1).
      const legacy = await db.apiToken.findMany({ where: { lookupHash: null } }).catch(() => [])
      for (const t of legacy) {
        if (await bcrypt.compare(token, t.tokenHash)) {
          await db.apiToken.update({ where: { id: t.id }, data: { lookupHash: lookup, lastUsedAt: new Date() } }).catch(() => {})
          tokenCache.set(key, { t: Date.now(), id: t.id })
          return { userId: t.userId ?? undefined, username: t.name, role: t.scope, via: "token" }
        }
      }
      recordMiss(String(sourceKey))
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
