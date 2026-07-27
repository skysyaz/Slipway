import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const integrations = await db.integration.findMany({ orderBy: { kind: "asc" } })
  return integrations.map((i) => ({
    id: i.id,
    kind: i.kind,
    active: i.active,
    // mask secrets in config before returning to the client
    config: maskConfig(i.kind, JSON.parse(i.config || "{}")),
  }))
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind || "")
  if (!kind) return new Response(JSON.stringify({ error: "kind required" }), { status: 400 })
  const config = JSON.stringify(body.config || {})
  // upsert by kind — one integration per kind
  const existing = await db.integration.findFirst({ where: { kind } })
  let integration
  if (existing) {
    integration = await db.integration.update({ where: { id: existing.id }, data: { config, active: body.active !== false } })
  } else {
    integration = await db.integration.create({ data: { kind, config, active: body.active !== false } })
  }
  await recordActivity("server", `configured ${kind} integration`, { actor: auth.username })
  return { id: integration.id, kind, active: integration.active, config: maskConfig(kind, JSON.parse(config)) }
})

export const PATCH = route(async (req, _params, _auth) => {
  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind || "")
  const integration = await db.integration.findFirst({ where: { kind } })
  if (!integration) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  const updated = await db.integration.update({
    where: { id: integration.id },
    data: { active: body.active !== undefined ? body.active : integration.active },
  })
  return { id: updated.id, kind: updated.kind, active: updated.active }
})

export const DELETE = route(async (req, _params, _auth) => {
  const kind = req.nextUrl.searchParams.get("kind")
  if (!kind) return new Response(JSON.stringify({ error: "kind required" }), { status: 400 })
  await db.integration.deleteMany({ where: { kind } })
  return { ok: true }
})

function maskConfig(kind: string, config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const k of Object.keys(config)) {
    const v = config[k]
    if (/(token|secret|password|webhook|url|key)/i.test(k) && typeof v === "string" && v) {
      masked[k] = v.slice(0, 4) + "••••••"
    } else {
      masked[k] = v
    }
  }
  void kind
  return masked
}