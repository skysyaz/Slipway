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

  // Basic hostname sanity — this value ends up in reverse-proxy routing rules,
  // so silently storing "not a hostname" just moves the failure downstream.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)) {
    return new Response(
      JSON.stringify({ error: `"${hostname}" is not a valid hostname (expected something like app.example.com).` }),
      { status: 400 }
    )
  }
  if (await db.domain.findFirst({ where: { hostname } })) {
    return new Response(
      JSON.stringify({ error: `${hostname} is already attached to a project.` }),
      { status: 409 }
    )
  }

  const ssl = Boolean(body.ssl)
  const domain = await db.domain.create({
    data: {
      projectId: params.id,
      hostname,
      type: String(body.type || "primary"),
      ssl: ssl ? "managed" : "disabled",
      // ponytail: NO invented expiry. This used to store `now + 90 days` as the
      // certificate expiry for a certificate that did not exist and that
      // Slipway does not issue (Caddy/Traefik does). The Domains view showed
      // that fiction as a real expiry date, and the scheduler's SSL scan
      // reported "expiring soon" against it. Stays null until something
      // actually observes a certificate.
      sslExpiry: null,
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
        ? `${hostname} added and marked for SSL. Slipway stores the record — the certificate is issued by your reverse proxy (Caddy/Traefik) once the domain resolves to this host.`
        : `${hostname} added without SSL. Enable SSL in Domains to secure it.`,
      level: ssl ? "success" : "info",
      kind: "ssl",
    },
    { projectId: params.id, actor: auth.username }
  )
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})