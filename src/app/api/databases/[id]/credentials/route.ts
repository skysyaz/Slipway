import { route } from "@/lib/http"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Reveal the stored credentials so the user can always recover the password.
// Auth-gated via route(). The password is only ever returned here, never in the
// list/detail serializer.
export const GET = route(async (_req, params) => {
  const row = await db.databaseInstance.findUnique({ where: { id: params.id } })
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 })

  const user = row.username ?? ""
  const pass = row.password ?? ""
  const host = row.host || "localhost"
  const port = row.port
  const dbName = row.dbName ?? ""
  const authPart = user || pass ? `${user}:${pass}@` : ""
  const dbSegment = ["postgres", "mysql", "mariadb", "mongodb"].includes(row.kind) ? `/${dbName}` : ""
  const connectionString =
    row.kind === "redis" || row.kind === "valkey"
      ? `redis://${authPart}${host}:${port}`
      : `${row.kind}://${authPart}${host}:${port}${dbSegment}`

  return {
    username: user || undefined,
    password: pass || undefined,
    dbName: dbName || undefined,
    host,
    port,
    connectionString,
    note:
      row.status === "external"
        ? "This database was imported from an existing container — Slipway does not know its password. Use the credentials you set when you created it."
        : undefined,
  }
})