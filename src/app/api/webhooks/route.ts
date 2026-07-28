import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const hooks = await db.webhook.findMany({ orderBy: { createdAt: "desc" } })
  return hooks.map((h) => ({
    id: h.id,
    url: h.url,
    events: JSON.parse(h.events || "[]") as string[],
    active: h.active,
    createdAt: h.createdAt.toISOString(),
  }))
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const url = String(body.url || "")
  if (!url) return new Response(JSON.stringify({ error: "url required" }), { status: 400 })
  const events = Array.isArray(body.events) ? body.events : ["deploy.success"]
  const hook = await db.webhook.create({
    data: { url, events: JSON.stringify(events), active: body.active !== false },
  })
  await recordActivity("server", `added webhook ${url} (${events.length} events)`, { actor: auth.username })
  return { id: hook.id, url, events, active: hook.active, createdAt: hook.createdAt.toISOString() }
}, { action: "admin" })

export const DELETE = route(async (req, _params, _auth) => {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 })
  await db.webhook.deleteMany({ where: { id } })
  return { ok: true }
}, { action: "admin" })