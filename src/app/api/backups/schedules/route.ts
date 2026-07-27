import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity, emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  return db.backupSchedule.findMany({ orderBy: { createdAt: "desc" } })
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const target = String(body.target || "")
  const schedule = String(body.schedule || "")
  if (!target || !schedule) return new Response(JSON.stringify({ error: "target and schedule required" }), { status: 400 })
  const sched = await db.backupSchedule.create({
    data: {
      target,
      targetKind: String(body.targetKind || "database"),
      schedule,
      retentionDays: Number(body.retentionDays || 14),
    },
  })
  await recordActivity("backup", `scheduled backup of ${target}: ${schedule} (keep ${sched.retentionDays} days)`, {
    actor: auth.username,
  })
  await emit(
    "backup.completed",
    "backup",
    `scheduled backup of ${target}: ${schedule}`,
    {
      title: "Backup schedule created",
      body: `${target} will be backed up on schedule: ${schedule}. Retention: ${sched.retentionDays} days.`,
      level: "success",
      kind: "backup",
    },
    { actor: auth.username }
  )
  return sched
})

export const DELETE = route(async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 })
  await db.backupSchedule.update({ where: { id }, data: { active: false } })
  return { ok: true }
})