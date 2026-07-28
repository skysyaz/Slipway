import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeVolume } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { getStorageSnapshot } from "@/lib/docker-ops"
import { isDockerAvailable } from "@/lib/docker"

export const dynamic = "force-dynamic"

/** Docker volume names allow [a-zA-Z0-9][a-zA-Z0-9_.-]; normalise the label. */
function slugifyVolume(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "volume"
}

export const GET = route(async () => {
  const vols = await db.volume.findMany({ orderBy: { name: "asc" } })
  // ponytail: overlay REAL per-volume usage (docker system df) + the real
  // in-container mount path + the host disk total, live on every fetch. The
  // stored sizeGb=20/usedGb=0 were a fiction; volumes have no cap by default so
  // sizeGb becomes the host disk total (the bar = this volume's share of the
  // disk). Falls back to the stored row when Docker is down.
  // ponytail: only size the volumes the dashboard tracks — avoids `du`-walking
  // every unrelated docker volume (e.g. a 5 GB open-webui) each poll tick.
  const tracked = vols
    .map((v) => v.dockerVolumeName)
    .filter(Boolean) as string[]
  const snap = await getStorageSnapshot({ volumeNames: tracked })
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

  // ponytail: create the REAL Docker volume, not just a row. This route used to
  // insert a Volume record and stop there, leaving dockerVolumeName null — so
  // the volume existed only in SQLite. Nothing could mount it, the Storage view
  // could never report usage for it (getStorageSnapshot keys off
  // dockerVolumeName), and DELETE's `removeData` branch was dead code because
  // it is guarded on that same null field. Honest failure if the engine is
  // down, matching every other provisioning path.
  if (!(await isDockerAvailable())) {
    return new Response(
      JSON.stringify({ error: "Docker engine unavailable — cannot create a real volume. Start Docker and retry." }),
      { status: 503 }
    )
  }
  const dockerVolumeName = `slipway-vol-${slugifyVolume(name)}-${Date.now().toString(36)}`
  const { dockerClient } = await import("@/lib/docker")
  const docker = dockerClient()
  if (!docker) {
    return new Response(JSON.stringify({ error: "Docker client not initialized." }), { status: 503 })
  }
  try {
    await docker.createVolume({
      Name: dockerVolumeName,
      Labels: { "io.slipway.managed": "true", "io.slipway.name": name },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Failed to create Docker volume: ${(e as Error).message}` }),
      { status: 500 }
    )
  }

  const vol = await db.volume.create({
    data: {
      name,
      projectId: body.projectId || null,
      mountPath: String(body.mountPath || "/data"),
      sizeGb: Number(body.sizeGb || 20),
      type: String(body.type || "ssd"),
      server: String(body.server || "local"),
      encrypted: body.encrypted ?? true,
      dockerVolumeName,
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