import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeDatabase } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { isDockerAvailable } from "@/lib/docker"
import { realProvisionDatabase } from "@/lib/docker-ops"

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
  const port = Number(body.port || PORT[kind] || 5432)

  // Real Docker only — no fake "running" without an engine.
  if (!(await isDockerAvailable())) {
    return new Response(
      JSON.stringify({ error: "Docker engine unavailable — cannot provision a real database. Start Docker and retry." }),
      { status: 503 }
    )
  }

  const created = await db.databaseInstance.create({
    data: {
      name,
      kind,
      version: String(body.version || "latest"),
      status: "restarting", // provisioning in progress
      projectId: body.projectId || null,
      host: "localhost",
      port,
      storageGb: Number(body.storageGb || 20),
      usedGb: 0,
      connections: 0,
      maxConnections: body.maxConnections || MAX_CONN[kind] || 200,
      backupsEnabled: body.backupsEnabled ?? true,
      region: String(body.region || "local"),
    },
  })

  try {
    await realProvisionDatabase(created.id, auth.username)
  } catch (e) {
    // realProvisionDatabase already marked status=failed + emitted a notify;
    // surface the honest error. The failed row is kept so the user can see it.
    const msg = e instanceof Error ? e.message : "provisioning failed"
    const failed = await db.databaseInstance.findUnique({ where: { id: created.id } })
    return new Response(
      JSON.stringify({ error: msg, database: failed ? serializeDatabase(failed) : undefined }),
      { status: 500 }
    )
  }

  const provisioned = await db.databaseInstance.findUnique({ where: { id: created.id } })
  await emit(
    "database.created",
    "database",
    `created ${kind} database "${name}"`,
    {
      title: "Database created",
      body: `${name} (${kind} ${provisioned?.version}) is running on localhost:${port}.`,
      level: "success",
      kind: "database",
    },
    { projectId: body.projectId || undefined, actor: auth.username }
  )
  // One-time credentials reveal: include the plaintext password here only.
  return {
    ...serializeDatabase(provisioned!),
    username: provisioned?.username ?? undefined,
    password: provisioned?.password ?? undefined,
    dbName: provisioned?.dbName ?? undefined,
  }
})