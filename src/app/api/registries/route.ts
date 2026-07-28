import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const regs = await db.registry.findMany({ orderBy: { createdAt: "desc" } })
  return regs.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    auth: r.auth,
    username: r.username ?? null,
    // never return the secret
    hasSecret: Boolean(r.token || r.password),
    createdAt: r.createdAt.toISOString(),
  }))
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "")
  const url = String(body.url || "")
  if (!name || !url) return new Response(JSON.stringify({ error: "name and url required" }), { status: 400 })
  const authMode = String(body.auth || "anonymous")
  const reg = await db.registry.create({
    data: {
      name,
      url,
      auth: authMode,
      token: body.token || null,
      username: body.username || null,
      password: body.password || null,
    },
  })
  await recordActivity("server", `added registry "${name}" (${url})`, { actor: auth.username })
  return { id: reg.id, name, url, auth: authMode, hasSecret: Boolean(reg.token || reg.password), createdAt: reg.createdAt.toISOString() }
}, { action: "admin" })

export const DELETE = route(async (req, _params, _auth) => {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 })
  await db.registry.deleteMany({ where: { id } })
  return { ok: true }
}, { action: "admin" })