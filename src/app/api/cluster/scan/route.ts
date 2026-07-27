import { route } from "@/lib/http"
import { isDockerAvailable } from "@/lib/docker"
import { realScanHost } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

// Discover existing Docker containers/volumes on the host and import them as
// Slipway resources. Honest: returns 503 if the engine is down; domains/SSL are
// not detected (they live in the reverse proxy).
export const POST = route(async (_req, _params, auth) => {
  if (!(await isDockerAvailable())) {
    return new Response(
      JSON.stringify({ error: "Docker engine unavailable — nothing to scan." }),
      { status: 503 }
    )
  }
  const result = await realScanHost(auth.username)
  return result
})