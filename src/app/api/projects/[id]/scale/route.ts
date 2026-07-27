import { route } from "@/lib/http"
import { scaleProject } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Scale every service in a project to `replicas`.
export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const replicas = Number(body.replicas || 1)
  await scaleProject(params.id, undefined, replicas, auth.username)
  return { ok: true }
})