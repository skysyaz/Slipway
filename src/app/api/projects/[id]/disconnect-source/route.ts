import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const POST = route(async (_req, params, auth) => {
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  await db.project.update({
    where: { id: params.id },
    data: { repoUrl: null, folderPath: null, composePath: null, autoDeploy: false },
  })
  await recordActivity("env", `disconnected source for ${project.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  return { ok: true }
})