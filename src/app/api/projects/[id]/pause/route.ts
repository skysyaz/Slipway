import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { stopProject } from "@/lib/ops"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const paused = Boolean(body.paused ?? true)
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  if (paused) {
    await stopProject(params.id, auth.username)
    await db.project.update({ where: { id: params.id }, data: { paused: true } })
  } else {
    await db.project.update({ where: { id: params.id }, data: { paused: false } })
  }
  await recordActivity("scale", `${paused ? "paused" : "resumed"} ${project.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  return { ok: true, paused }
})