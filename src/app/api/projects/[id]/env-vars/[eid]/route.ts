import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const PUT = route(async (req, params) => {
  const body = await req.json().catch(() => ({}))
  await db.envVar.update({
    where: { id: params.eid },
    data: {
      ...(body.key !== undefined ? { key: String(body.key) } : {}),
      ...(body.value !== undefined ? { value: String(body.value) } : {}),
      ...(body.scope !== undefined ? { scope: String(body.scope) } : {}),
      ...(body.masked !== undefined ? { masked: Boolean(body.masked) } : {}),
    },
  })
  const project = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(project!)
})

export const DELETE = route(async (_req, params) => {
  await db.envVar.deleteMany({ where: { id: params.eid, projectId: params.id } })
  const project = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(project!)
})