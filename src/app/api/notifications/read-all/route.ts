import { route } from "@/lib/http"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export const PATCH = route(async () => {
  await db.notification.updateMany({ where: { read: false }, data: { read: true } })
  return { ok: true }
})