import { route } from "@/lib/http"
import { realTestDatabaseConnection } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

// Real connection test: docker exec the engine's ping inside the DB container,
// or — when the container isn't running — classify the failure (init /
// permission / disk-full / corrupt / auth / port) from the logs into friendly
// guidance. Honest: returns ok=false + a hint, never fakes a "connected" state.
export const POST = route(async (_req, params) => {
  const result = await realTestDatabaseConnection(params.id)
  return result
})