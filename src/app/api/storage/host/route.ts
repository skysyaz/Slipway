import { route } from "@/lib/http"
import { getStorageSnapshot, bytesToGb } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

// Real host-disk capacity + used (via a throwaway `df` container), cached 60s.
// The Storage header shows this instead of summing the per-volume sizeGb (which
// was a 12×20 GB fiction). Returns nulls when the engine is down. Uses the
// shared bytesToGb so the storage page, per-server disk, and cluster disk all
// agree on the same conversion. (bug 2/4)
export const GET = route(async () => {
  const snap = await getStorageSnapshot()
  if (!snap.host) return { totalGb: null, usedGb: null }
  return {
    totalGb: bytesToGb(snap.host.totalBytes),
    usedGb: bytesToGb(snap.host.usedBytes),
  }
})