import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

// Remove a domain from a project. Slipway records domains + checks SSL; it does
// not own the reverse proxy (Traefik is Dokploy's), so this deletes the record
// — honest about scope.
export const DELETE = route(async (_req, params, auth) => {
  const dom = await db.domain.findUnique({ where: { id: params.domainId } })
  if (!dom || dom.projectId !== params.id) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }
  await db.domain.delete({ where: { id: params.domainId } })
  await emit("domain.removed", "domain", `removed domain ${dom.hostname}`, {
    title: "Domain removed", body: dom.hostname, level: "info", kind: "ssl",
  }, { projectId: params.id, actor: auth.username })
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})