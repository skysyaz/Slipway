import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { validIp } from "@/lib/security"

export const dynamic = "force-dynamic"

/**
 * One-time repair for domain rows created before the IP-mode fix: a bare-IP
 * domain stored as ssl:"managed"/status:"pending" is an impossible ACME order
 * (public CAs don't issue for IPs) and showed "Cert pending" forever. Mark
 * them self-signed (ssl=custom, status=active) so the badge is honest.
 */
export const POST = route(async (_req, _params, auth) => {
  const rows = await db.domain.findMany({ where: { ssl: "managed" } })
  let fixed = 0
  for (const d of rows) {
    if (validIp(d.hostname)) {
      await db.domain.update({
        where: { id: d.id },
        data: { ssl: "custom", status: "active" },
      })
      fixed++
    }
  }
  return { ok: true, fixed, actor: auth.username }
}, { action: "admin" })
