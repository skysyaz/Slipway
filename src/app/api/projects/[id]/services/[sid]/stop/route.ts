import { route } from "@/lib/http"
import { stopService } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Stop a single service's container (not the whole project).
export const POST = route(async (_req, params, auth) => {
  await stopService(params.id, params.sid, auth.username)
  return { ok: true }
})
