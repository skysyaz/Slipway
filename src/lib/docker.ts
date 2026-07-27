/**
 * Slipway Docker engine layer.
 *
 * Phase 0 stub: only engine availability detection is implemented here. The
 * full orchestration (deploy/restart/scale/stop/remove/backup/streams) is
 * added in Phase 2, with src/lib/simulate.ts as the fallback when the engine
 * is unavailable.
 */
import Docker from "dockerode"

let client: Docker | null = null
let availability: boolean | null = null
let checkedAt = 0

function getClient(): Docker {
  if (!client) {
    // Dockerode auto-detects the socket/pipe on Linux/macOS/Windows.
    client = new Docker()
  }
  return client
}

/**
 * Is the Docker engine reachable? Cached for 5s to avoid hammering the socket
 * on every request. Returns false (not throw) on failure.
 */
export async function isDockerAvailable(): Promise<boolean> {
  const now = Date.now()
  if (availability !== null && now - checkedAt < 5000) return availability
  try {
    await getClient().ping()
    availability = true
  } catch {
    availability = false
  }
  checkedAt = now
  return availability
}

export function dockerClient(): Docker | null {
  return client
}

/** Reset the cached availability (used by tests / after engine start). */
export function resetDockerCache(): void {
  availability = null
  checkedAt = 0
}