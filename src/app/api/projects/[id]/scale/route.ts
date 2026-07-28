import { route } from "@/lib/http"
import { scaleProject } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Scale every service in a project to `replicas`.
export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  // ponytail: `body.replicas || 1` turned a deliberate scale-to-0 (stop) into
  // 1, so the project-level Scale endpoint could never stop containers — only
  // the per-service path worked. `??` keeps 0, and NaN/missing still default.
  const raw = body.replicas
  const replicas = raw === undefined || raw === null || raw === "" ? 1 : Number(raw)
  if (!Number.isFinite(replicas)) {
    return new Response(JSON.stringify({ error: "replicas must be a number" }), { status: 400 })
  }
  await scaleProject(params.id, undefined, replicas, auth.username)
  return { ok: true }
})