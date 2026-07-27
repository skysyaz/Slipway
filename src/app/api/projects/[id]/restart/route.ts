import { route } from "@/lib/http"
import { restartService } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Restart every service in a project.
export const POST = route(async (_req, params, auth) => {
  await restartService(params.id, undefined, auth.username)
  return { ok: true }
})