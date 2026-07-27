import { route } from "@/lib/http"
import { restartService } from "@/lib/ops"

export const dynamic = "force-dynamic"

export const POST = route(async (_req, params, auth) => {
  await restartService(params.id, params.sid, auth.username)
  return { ok: true }
})