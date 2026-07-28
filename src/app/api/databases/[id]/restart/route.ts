import { route } from "@/lib/http"
import { restartDatabase } from "@/lib/ops"

export const dynamic = "force-dynamic"

// Restart a real database container (managed or scanned/imported). Honest 500
// if there's no real container or the engine is down.
export const POST = route(async (_req, params, auth) => {
  try {
    await restartDatabase(params.id, auth.username)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "restart failed"
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
  return { ok: true }
})