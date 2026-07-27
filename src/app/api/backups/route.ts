import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeBackup } from "@/lib/serialize"
import { runBackup } from "@/lib/ops"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const backups = await db.backupRecord.findMany({ orderBy: { startedAt: "desc" } })
  return backups.map(serializeBackup)
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const target = String(body.target || "")
  const targetKind = String(body.targetKind || "database")
  if (!target) return new Response(JSON.stringify({ error: "target required" }), { status: 400 })
  const id = await runBackup(target, targetKind, undefined, auth.username)
  return { ok: true, id }
})