import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeActivity } from "@/lib/serialize"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const events = await db.activityEvent.findMany({ orderBy: { ts: "desc" }, take: 100 })
  return events.map(serializeActivity)
})

// Generic activity record (used by log-only dialogs: SSH keys, registries,
// webhooks, tokens). Phase 3 promotes those to real entities.
export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const event = await db.activityEvent.create({
    data: {
      kind: String(body.kind || "system"),
      message: String(body.message || ""),
      projectId: body.projectId || null,
      actor: body.actor || auth.username,
    },
  })
  return serializeActivity(event)
})