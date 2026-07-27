import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeNotification } from "@/lib/serialize"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const notifs = await db.notification.findMany({ orderBy: { ts: "desc" }, take: 50 })
  return notifs.map(serializeNotification)
})