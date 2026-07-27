import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const hostname = String(body.hostname || "")
  if (!hostname) return new Response(JSON.stringify({ error: "hostname required" }), { status: 400 })
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  const ssl = Boolean(body.ssl)
  const domain = await db.domain.create({
    data: {
      projectId: params.id,
      hostname,
      type: String(body.type || "primary"),
      ssl: ssl ? "managed" : "disabled",
      sslExpiry: ssl ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 90) : null,
      https: ssl,
      status: ssl ? "pending" : "active",
    },
  })
  await emit(
    "domain.added",
    "domain",
    `added domain ${hostname} to project`,
    {
      title: "Domain added",
      body: ssl
        ? `${hostname} added. SSL certificate provisioning started.`
        : `${hostname} added without SSL. Enable SSL in Domains to secure it.`,
      level: ssl ? "success" : "info",
      kind: "ssl",
    },
    { projectId: params.id, actor: auth.username }
  )
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})