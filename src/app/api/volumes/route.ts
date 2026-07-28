import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeVolume } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { getStorageSnapshot } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const vols = await db.volume.findMany({ orderBy: { name: "asc" } })
  // ponytail: overlay REAL per-volume usage (docker system df) + the real
  // in-container mount path + the host disk total, live on every fetch. The
  // stored sizeGb=20/usedGb=0 were a fiction; volumes have no cap by default so
  // sizeGb becomes the host disk total (the bar = this volume's share of the
  // disk). Falls back to the stored row when Docker is down.
  const snap = await getStorageSnapshot()
  const totalGb = snap.host ? snap.host.totalBytes / 1e9 : null
  const enriched = vols.map((v) => {
    const dv = v.dockerVolumeName ? snap.volumes.get(v.dockerVolumeName) : undefined
    const usedBytes = dv?.usedBytes ?? null
    const dests = v.dockerVolumeName ? snap.mounts.get(v.dockerVolumeName) : undefined
    const mountPath = dests?.length ? dests.join(", ") : dv?.mountpoint || v.mountPath
    const usedGb = usedBytes !== null ? usedBytes / 1e9 : v.usedGb
    return {
      ...v,
      mountPath,
      usedGb,
      ...(totalGb !== null ? { sizeGb: Math.round(totalGb) } : {}),
    }
  })
  return enriched.map(serializeVolume)
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "new-volume")
  const vol = await db.volume.create({
    data: {
      name,
      projectId: body.projectId || null,
      mountPath: String(body.mountPath || "/data"),
      sizeGb: Number(body.sizeGb || 20),
      type: String(body.type || "ssd"),
      server: String(body.server || "local"),
      encrypted: body.encrypted ?? true,
    },
  })
  await emit(
    "volume.created",
    "database",
    `created volume "${name}" (${vol.sizeGb} GB ${vol.type.toUpperCase()})`,
    {
      title: "Volume created",
      body: `${name} mounted at ${vol.mountPath} on ${vol.server}.`,
      level: "success",
      kind: "system",
    },
    { projectId: body.projectId || undefined, actor: auth.username }
  )
  return serializeVolume(vol)
})