import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"
import { invalidateTokenCache } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export const DELETE = route(async (req, params, auth) => {
  const t = await db.apiToken.findUnique({ where: { id: params.id } })
  if (!t) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  await db.apiToken.delete({ where: { id: params.id } })
  // Drop the verified-token cache so the revoked token stops authenticating
  // immediately instead of lingering for the cache TTL.
  invalidateTokenCache()
  await recordActivity("server", `revoked API token "${t.name}"`, { actor: auth.username })
  return { ok: true }
}, { action: "admin" })