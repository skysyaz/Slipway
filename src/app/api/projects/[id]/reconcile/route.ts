import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { reconcileProject } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Apply Slipway's config (image, env vars, start command, resource limits) to
// the project's REAL container by recreating it (volumes + networks preserved).
// This is the "edit the app and have it take effect" action — env/cmd can't
// change on a running container, so the container is recreated with brief
// downtime. Honest: 500 + the real error on failure, no fake success.
const INCLUDE = { services: true, domains: true, envVars: true } as const

// ponytail: realReconcile() already records the activity entry ("applied
// config changes to X (container recreated)"), so this route must not record
// a second one — it produced two audit rows for every apply.
export const POST = route(async (_req, params, auth) => {
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  try {
    await reconcileProject(params.id, auth.username)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "reconcile failed"
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})