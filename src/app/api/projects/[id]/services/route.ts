import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "")
  const image = String(body.image || "")
  if (!name || !image) return new Response(JSON.stringify({ error: "name and image required" }), { status: 400 })
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  await db.service.create({
    data: {
      projectId: params.id,
      name,
      kind: String(body.kind || "worker"),
      // ponytail: a service row created here has NO container behind it —
      // dockerContainerId is null until a deploy runs. Recording it as
      // "running" put a green dot on the dashboard for something that did not
      // exist. "stopped" is the truth until something starts it.
      status: "stopped",
      image,
      port: body.port ? Number(body.port) : null,
      replicas: Number(body.replicas || 1),
      memoryMb: Number(body.memoryMb || 256),
      cpuMilli: Number(body.cpuMilli || 200),
    },
  })
  await recordActivity("scale", `added service "${name}" to ${project.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})