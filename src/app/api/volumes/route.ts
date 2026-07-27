import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeVolume } from "@/lib/serialize"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const vols = await db.volume.findMany({ orderBy: { name: "asc" } })
  return vols.map(serializeVolume)
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