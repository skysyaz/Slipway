import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { stopProject, scaleProject } from "@/lib/ops"
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
    // ponytail: RESUME has to start the container again. Pausing stops it for
    // real, but resuming only flipped the `paused` flag — so the dashboard went
    // back to showing the project as live while its container stayed stopped.
    // Scaling to 1 is exactly "run it", and it reports honestly if it can't.
    await scaleProject(params.id, undefined, 1, auth.username)
    await db.project.update({ where: { id: params.id }, data: { paused: false } })
  }
  await recordActivity("scale", `${paused ? "paused" : "resumed"} ${project.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  return { ok: true, paused }
})