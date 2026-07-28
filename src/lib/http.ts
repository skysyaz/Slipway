import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireAuth, can, type AuthContext } from "./server-auth"
import { defaultActionFor, type AuthAction } from "./authz"

export type { AuthAction }

/**
 * Wrap a route handler with auth + scope enforcement + error handling. Passes
 * dynamic params.
 *
 * `opts.action` declares the privilege the route requires. Omit it for the
 * method-based default (GET/HEAD → read, mutations → deploy); pass
 * `{ action: "admin" }` on operator surfaces (tokens, settings, servers, SSH
 * keys, registries, webhooks, integrations, 2FA).
 */
export function route(
  fn: (
    req: NextRequest,
    params: Record<string, string>,
    auth: AuthContext
  ) => Promise<unknown | Response>,
  opts: { action?: AuthAction } = {}
) {
  return async (
    req: NextRequest,
    ctx?: { params: Promise<Record<string, string>> } | Record<string, string>
  ) => {
    try {
      const auth = await requireAuth(req)
      const action = opts.action ?? defaultActionFor(req.method)
      // Scope enforcement applies to API tokens, whose scope the operator chose
      // explicitly at mint time (read | deploy | admin). Before this check the
      // scope was decorative: a `read` token could delete projects, drop
      // databases, or mint an `admin` token.
      //
      // Interactive sessions are deliberately NOT gated here. Slipway has no
      // user-management UI, so a signed-in user whose role blocked deploys
      // would have no way to be granted one — an unactionable lockout. Gating
      // sessions belongs with a role-management feature, not with this fix.
      if (auth.via === "token" && !can(auth, action)) {
        return NextResponse.json(
          {
            error: `Forbidden — this API token has scope "${auth.role}" and cannot perform a "${action}" operation.`,
          },
          { status: 403 }
        )
      }
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
