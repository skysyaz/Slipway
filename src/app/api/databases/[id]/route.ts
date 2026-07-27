import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeDatabase } from "@/lib/serialize"
import { realRemoveDatabase } from "@/lib/docker-ops"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async (_req, params) => {
  const row = await db.databaseInstance.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  return serializeDatabase(row)
})

// Editable: name, projectId (link/unlink), backupsEnabled, region.
// Not editable without recreating the container: kind, version, storageGb, port.
export const PATCH = route(async (req, params, auth) => {
  const row = await db.databaseInstance.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  const body = await req.json().catch(() => ({}))

  if (
    (body.kind !== undefined && body.kind !== row.kind) ||
    (body.version !== undefined && body.version !== row.version) ||
    (body.storageGb !== undefined && Number(body.storageGb) !== row.storageGb) ||
    (body.port !== undefined && Number(body.port) !== row.port)
  ) {
    return new Response(
      JSON.stringify({ error: "Engine, version, storage, and port can't change on a running database — back it up, delete, and recreate with the new settings." }),
      { status: 400 }
    )
  }

  const updated = await db.databaseInstance.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId || null } : {}),
      ...(body.backupsEnabled !== undefined ? { backupsEnabled: !!body.backupsEnabled } : {}),
      ...(body.region !== undefined ? { region: String(body.region) } : {}),
    },
  })
  await emit(
    "system",
    "database",
    `updated database "${updated.name}"`,
    { title: "Database updated", body: updated.name, level: "info", kind: "database" },
    { actor: auth.username }
  )
  return serializeDatabase(updated)
})

export const DELETE = route(async (req, params, auth) => {
  const removeData = req.nextUrl.searchParams.get("removeData") === "true"
  const row = await db.databaseInstance.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })

  // best-effort container + volume removal (no-op if Docker is down)
  await realRemoveDatabase(params.id, removeData, auth.username).catch((e) =>
    console.error("[api] database remove failed:", (e as Error).message)
  )
  await db.databaseInstance.delete({ where: { id: params.id } })
  return { ok: true }
})