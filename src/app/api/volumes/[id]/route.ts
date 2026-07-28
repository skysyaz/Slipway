import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeVolume } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { isDockerAvailable } from "@/lib/docker"

export const dynamic = "force-dynamic"

// Editable: projectId (link/unlink to a project), name (Slipway label).
// Not editable as a live Docker op: sizeGb (filesystem-level), mountPath (would
// need to recreate every container using it) — honest, rejected.
export const PATCH = route(async (req, params, auth) => {
  const row = await db.volume.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  const body = await req.json().catch(() => ({}))
  if (
    (body.sizeGb !== undefined && Number(body.sizeGb) !== row.sizeGb) ||
    (body.mountPath !== undefined && String(body.mountPath) !== row.mountPath)
  ) {
    return new Response(
      JSON.stringify({ error: "Size and mount path can't change on an existing volume — they're filesystem-level. Link/unlink or delete instead." }),
      { status: 400 }
    )
  }
  const updated = await db.volume.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId || null } : {}),
    },
  })
  await emit("system", "database", `updated volume "${updated.name}"`, {
    title: "Volume updated", body: updated.name, level: "info", kind: "system",
  }, { projectId: updated.projectId || undefined, actor: auth.username })
  return serializeVolume(updated)
})

// Delete the Slipway row and (best-effort) the real Docker volume. removeData
// defaults to true for volumes since the row only exists because of the volume;
// pass ?removeData=false to keep the Docker volume and just forget it in Slipway.
export const DELETE = route(async (req, params, auth) => {
  const removeData = req.nextUrl.searchParams.get("removeData") !== "false"
  const row = await db.volume.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  if (removeData && row.dockerVolumeName && (await isDockerAvailable())) {
    const { dockerClient } = await import("@/lib/docker")
    const docker = dockerClient()
    if (docker) {
      try {
        await docker.getVolume(row.dockerVolumeName).remove({ force: true })
      } catch (e) {
        // volume may be in use or already gone — surface but still drop the row
        console.error("[api] volume remove failed:", (e as Error).message)
      }
    }
  }
  await db.volume.delete({ where: { id: params.id } })
  await emit("volume.deleted", "database", `removed volume "${row.name}"`, {
    title: "Volume removed", body: removeData ? `${row.name} and its data deleted.` : `${row.name} forgotten (Docker volume kept).`, level: "warning", kind: "system",
  }, { actor: auth.username })
  return { ok: true }
})