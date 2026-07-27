import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeDatabase } from "@/lib/serialize"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

const MAX_CONN: Record<string, number> = {
  redis: 1000,
  valkey: 1000,
  postgres: 200,
  mysql: 150,
  mariadb: 150,
  mongodb: 200,
  mssql: 200,
  sqlite: 1,
}
const PORT: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
  valkey: 6379,
  sqlite: 0,
  mssql: 1433,
}

export const GET = route(async () => {
  const dbs = await db.databaseInstance.findMany({ orderBy: { createdAt: "desc" } })
  return dbs.map(serializeDatabase)
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind || "postgres")
  const name = String(body.name || `db-${kind}`)
  const created = await db.databaseInstance.create({
    data: {
      name,
      kind,
      version: String(body.version || "latest"),
      status: "running",
      projectId: body.projectId || null,
      host: name, // overwritten below with an id-based host
      port: Number(body.port || PORT[kind] || 5432),
      storageGb: Number(body.storageGb || 20),
      usedGb: 0,
      connections: 0,
      maxConnections: body.maxConnections || MAX_CONN[kind] || 200,
      backupsEnabled: body.backupsEnabled ?? true,
      region: String(body.region || "local"),
    },
  })
  // host uses the generated id so it's unique
  const host = `${created.id}.internal.slipway.run`
  await db.databaseInstance.update({ where: { id: created.id }, data: { host } })
  await emit(
    "database.created",
    "database",
    `created ${kind} database "${name}"`,
    {
      title: "Database created",
      body: `${name} (${kind} ${created.version}) is running and ready for connections.`,
      level: "success",
      kind: "database",
    },
    { projectId: body.projectId || undefined, actor: auth.username }
  )
  return serializeDatabase({ ...created, host })
})