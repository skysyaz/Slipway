import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const key = String(body.key || "")
  const value = String(body.value ?? "")
  if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400 })
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  // upsert by (projectId, key, scope)
  await db.envVar.upsert({
    where: { projectId_key_scope: { projectId: params.id, key, scope: String(body.scope || "all") } },
    create: {
      projectId: params.id,
      key,
      value,
      scope: String(body.scope || "all"),
      masked: Boolean(body.masked),
    },
    update: { value, masked: Boolean(body.masked) },
  })
  await recordActivity("env", `updated ${key} on ${project.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})