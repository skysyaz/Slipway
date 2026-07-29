import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { writeDomainRoute, isPrivateIp } from "@/lib/routing"
import { validIp } from "@/lib/security"

import { domainStatusAfterRoute } from "@/lib/route-after-deploy"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

function isIpAddress(h: string): boolean {
  // R5: octet-range-checked — never trust ^(\d{1,3}\.){3}\d{1,3}$.
  return validIp(h)
}

export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const hostname = String(body.hostname || "").trim()
  if (!hostname) return new Response(JSON.stringify({ error: "hostname required" }), { status: 400 })
  const project = await db.project.findUnique({ where: { id: params.id } })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  const hostnameIsIp = isIpAddress(hostname)
  // Basic hostname sanity — this value ends up in reverse-proxy routing rules,
  // so silently storing "not a hostname" just moves the failure downstream.
  if (!hostnameIsIp && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)) {
    return new Response(
      JSON.stringify({ error: `"${hostname}" is not a valid hostname (expected something like app.example.com).` }),
      { status: 400 }
    )
  }
  if (isPrivateIp(hostname)) {
    return new Response(
      JSON.stringify({ error: "Loopback/private IPs can't be routed publicly. Set the server's public IP in Settings." }),
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
  const ipMode = hostnameIsIp
  // public CAs never issue for bare IPs — refuse ACME in IP mode
  const tlsMode: "letsencrypt" | "selfsigned" | "http" = ipMode
    ? ssl
      ? "selfsigned"
      : "http"
    : ssl
      ? "letsencrypt"
      : "http"

  // Resolve the app's target port from its running service container.
  const appService = await db.service.findFirst({ where: { projectId: params.id, kind: "app" } })
  const targetPort = appService?.port || 3000

  // Persist the record first (the row is the audit trail); then attempt the
  // real Traefik route and reflect whether it landed in `status`.
  // Bug B: an IP/self-signed/HTTP domain is NEVER "pending" — there is no ACME
  // order to wait on, so it is active as soon as the route lands. Only a real
  // Let's Encrypt order (custom domain) starts pending.
  const domain = await db.domain.create({
    data: {
      projectId: params.id,
      hostname,
      type: String(body.type || "primary"),
      // IP mode: mark selfsigned (not "managed"), so no surface reads it as a
      // pending/ACME cert. http → disabled.
      ssl: tlsMode === "http" ? "disabled" : tlsMode === "selfsigned" ? "custom" : "managed",
      sslExpiry: null,
      https: tlsMode !== "http",
      status: tlsMode === "letsencrypt" ? "pending" : "active",
    },
  })

  let routed = false
  let routeError = ""
  try {
    await writeDomainRoute({
      projectSlug: project.slug,
      projectId: project.id,
      hostname,
      targetPort,
      tls: tlsMode,
    })
    routed = true
  } catch (e) {
    routeError = (e as Error).message
    console.error("[domains] failed to write Traefik route:", routeError)
  }

  await db.domain.update({
    where: { id: domain.id },
    // P1: route failure → action-required (app may already be up); never pretend
    // the cert is pending when Traefik never got the router. selfsigned/http
    // land as active when routed (no ACME to wait on).
    data: {
      status: domainStatusAfterRoute({ routed, tlsMode }),
    },
  })

  await emit(
    "domain.added",
    "domain",
    `added domain ${hostname} to project`,
    {
      title: "Domain added",
      body: routed
        ? tlsMode === "letsencrypt"
          ? `${hostname} routed via Traefik; Let's Encrypt will issue the cert once DNS resolves.`
          : tlsMode === "selfsigned"
            ? `${hostname} routed via Traefik with a self-signed cert (browsers will warn).`
            : `${hostname} routed via Traefik over plain HTTP (not encrypted).`
        : `${hostname} recorded, but the Traefik route could not be written (${routeError || "routing dir unavailable"}). Action required — fix the proxy mount and retry; the app is not taken down.`,
      level: routed ? "success" : "error",
      kind: "ssl",
    },
    { projectId: params.id, actor: auth.username }
  )
  const refreshed = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(refreshed!)
})