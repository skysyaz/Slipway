import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { db } from "./db"
import bcrypt from "bcryptjs"
import type { NextRequest } from "next/server"

export interface AuthContext {
  userId?: string
  username: string
  role: string
  via: "session" | "token"
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
      // tokens are stored hashed; find by comparing hash across active tokens.
      const candidates = await db.apiToken.findMany()
      for (const t of candidates) {
        if (await bcrypt.compare(token, t.tokenHash)) {
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
export function can(ctx: AuthContext, action: "read" | "deploy" | "admin"): boolean {
  if (ctx.role === "admin") return true
  if (action === "read") return true
  if (action === "deploy" && (ctx.role === "deploy" || ctx.role === "admin")) return true
  return false
}