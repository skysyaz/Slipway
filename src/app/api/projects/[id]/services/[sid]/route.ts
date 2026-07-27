import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const DELETE = route(async (_req, params) => {
  await db.service.deleteMany({ where: { projectId: params.id, id: params.sid } })
  const project = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(project!)
})