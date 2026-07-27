import { route } from "@/lib/http"
import { rollbackDeployment } from "@/lib/ops"

export const dynamic = "force-dynamic"

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const deploymentId = String(body.deploymentId || "")
  if (!deploymentId) return new Response(JSON.stringify({ error: "deploymentId required" }), { status: 400 })
  const id = await rollbackDeployment(deploymentId, auth.username)
  return { ok: true, id }
})