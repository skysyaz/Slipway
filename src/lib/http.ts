import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireAuth, type AuthContext } from "./server-auth"

/** Wrap a route handler with auth + error handling. Passes dynamic params. */
export function route(
  fn: (
    req: NextRequest,
    params: Record<string, string>,
    auth: AuthContext
  ) => Promise<unknown | Response>
) {
  return async (
    req: NextRequest,
    ctx?: { params: Promise<Record<string, string>> } | Record<string, string>
  ) => {
    try {
      const auth = await requireAuth(req)
      let params: Record<string, string> = {}
      if (ctx && typeof ctx === "object" && "params" in ctx) {
        const p = (ctx as { params: Promise<Record<string, string>> | Record<string, string> }).params
        params = (await Promise.resolve(p)) || {}
      }
      const result = await fn(req, params, auth)
      if (result instanceof Response) return result
      return NextResponse.json(result)
    } catch (e) {
      if (e instanceof Response) return e // 401 from requireAuth
      const msg = e instanceof Error ? e.message : "Internal server error"
      console.error("[api] error:", msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}