import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { reachabilityFromProbe } from "@/lib/status"
import { validIp, isPrivateIp } from "@/lib/security"

export const dynamic = "force-dynamic"

/**
 * Server-side reachability probe for a project's published URL. The dashboard
 * chip reads this instead of assuming "Running" means reachable. Honest:
 * reachable / http-error(code) / connection-failed / tls-error, with the real
 * code + latency + checkedAt.
 */
export const GET = route(async (_req, params) => {
  const project = await db.project.findUnique({ where: { id: params.id }, select: { url: true, slug: true } })
  if (!project) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  const url = project.url
  if (!url) {
    return { probe: reachabilityFromProbe({ ok: false, error: "no url" }), url: null }
  }

  const started = Date.now()
  try {
    const u = new URL(url)
    // Never probe a private/loopback host from the server unless it IS the
    // project URL's own host (self-check loopback is fine — the app is local).
    const host = u.hostname
    if (!validIp(host) && !host) {
      return { probe: reachabilityFromProbe({ ok: false, error: "bad url" }), url }
    }
    void isPrivateIp
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    let code: number | undefined
    try {
      const res = await fetch(url, { method: "GET", redirect: "error", signal: controller.signal })
      code = res.status
      const latencyMs = Date.now() - started
      const ok = code >= 200 && code < 400
      return { probe: reachabilityFromProbe({ ok, code, latencyMs, checkedAt: Date.now() }), url }
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    const msg = (e as Error).message || "connection failed"
    return { probe: reachabilityFromProbe({ ok: false, error: msg, checkedAt: Date.now() }), url }
  }
})
