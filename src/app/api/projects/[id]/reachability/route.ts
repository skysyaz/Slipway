import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { reachabilityFromProbe } from "@/lib/status"
import { validIp } from "@/lib/security"
import net from "node:net"

export const dynamic = "force-dynamic"

/**
 * Server-side reachability probe for a project's published URL. The dashboard
 * chip reads this instead of assuming "Running" means reachable. Honest:
 * reachable / http-error(code) / connection-failed / tls-error, with the real
 * code + latency + checkedAt.
 *
 * A bare-IP URL over HTTPS uses a self-signed cert (public CAs don't issue for
 * IPs), which Node's TLS rejects by default. For an IP we probe TCP
 * reachability instead — that distinguishes "nothing listening" (conn-failed)
 * from "listening with a self-signed cert" (reachable, browser will warn).
 */
export const GET = route(async (_req, params) => {
  const project = await db.project.findUnique({ where: { id: params.id }, select: { url: true, slug: true } })
  if (!project) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  const url = project.url
  if (!url) {
    return { probe: reachabilityFromProbe({ ok: false, error: "no url" }), url: null }
  }

  const started = Date.now()
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { probe: reachabilityFromProbe({ ok: false, error: "bad url" }), url }
  }
  const host = u.hostname
  const hostIsIp = validIp(host)
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80

  // IP over HTTPS → TCP probe (self-signed cert would fail Node's TLS verify).
  if (hostIsIp && u.protocol === "https:") {
    const tcp = await probeTcp(host, port, 4000)
    const latencyMs = Date.now() - started
    return {
      probe: tcp
        ? reachabilityFromProbe({ ok: true, code: 200, latencyMs, checkedAt: Date.now() })
        : reachabilityFromProbe({ ok: false, error: "connection refused", checkedAt: Date.now() }),
      url,
      selfSigned: true,
    }
  }

  try {
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

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: timeoutMs })
    const done = (ok: boolean) => {
      sock.destroy()
      resolve(ok)
    }
    sock.once("connect", () => done(true))
    sock.once("timeout", () => done(false))
    sock.once("error", () => done(false))
  })
}
