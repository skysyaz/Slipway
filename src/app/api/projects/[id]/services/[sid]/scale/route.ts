import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { scaleProject } from "@/lib/ops"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const replicas = Number(body.replicas)
  if (!Number.isFinite(replicas) || replicas < 0) {
    return new Response(JSON.stringify({ error: "replicas required" }), { status: 400 })
  }
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  await scaleProject(params.id, params.sid || undefined, replicas, auth.username)
  // ponytail: "system", not "deploy.success" — this fans out to Slack/PagerDuty
  // and a scale is not a deployment; reporting one as a successful deploy makes
  // the external feed lie about what happened.
  await emit(
    "system",
    "scale",
    `scaled ${project.name} to ${replicas} replica${replicas === 1 ? "" : "s"}`,
    {
      title: "Scaling complete",
      body: `${project.name} now running ${replicas} replica${replicas === 1 ? "" : "s"}.`,
      level: "success",
      kind: "deploy",
    },
    { projectId: params.id, actor: auth.username }
  )
  return { ok: true }
})