import { route } from "@/lib/http"
import { getStorageSnapshot } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

// Real host-disk capacity + used (via a throwaway `df` container), cached 60s.
// The Storage header shows this instead of summing the per-volume sizeGb (which
// was a 12×20 GB fiction). Returns nulls when the engine is down.
export const GET = route(async () => {
  const snap = await getStorageSnapshot()
  if (!snap.host) return { totalGb: null, usedGb: null }
  return {
    totalGb: snap.host.totalBytes / 1e9,
    usedGb: snap.host.usedBytes / 1e9,
  }
})