import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { realSetDatabaseCredentials } from "@/lib/docker-ops"

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
  const published = port && port > 0
  const dbName = row.dbName ?? ""
  const authPart = user || pass ? `${user}:${pass}@` : ""
  const dbSegment = ["postgres", "mysql", "mariadb", "mongodb"].includes(row.kind) ? `/${dbName}` : ""
  const buildUri = (h: string) =>
    row.kind === "redis" || row.kind === "valkey"
      ? `redis://${authPart}${h}:${port}`
      : `${row.kind}://${authPart}${h}:${port}${dbSegment}`
  // Only emit a connection string when the DB is actually published on a host
  // port. A scanned DB that publishes nothing has port=0; showing
  // `postgres://…:5432/` for it would be a lie (nothing listens there on the
  // host). Fall back to the internal container port for an internal hint only
  // when the row carries one.
  const connectionString = published
    ? buildUri(host)
    : row.internalPort
      ? `${row.kind}://${authPart}<container>:${row.internalPort}${dbSegment} (not published on a host port)`
      : undefined

  // ponytail: the published port is bound to 0.0.0.0 on the host, so it's
  // reachable from outside via the host's public address — but the connection
  // string above uses `host` (localhost), which only works from the host itself.
  // If the operator set SLIPWAY_PUBLIC_HOST, also surface an external URI and a
  // firewall reminder. Without that env we can't guess the public address.
  const publicHost = process.env.SLIPWAY_PUBLIC_HOST?.trim() || ""
  const externalConnectionString =
    published && publicHost && publicHost !== host ? buildUri(publicHost) : undefined

  const externalNote = !published
    ? row.status === "external"
      ? "This database was imported from an existing container that publishes no host port, and Slipway does not know its password. Reach it from a container on the same Docker network, or publish a host port to connect from outside."
      : "This database is not published on a host port. Reach it from a container on the same Docker network."
    : row.status === "external"
      ? "This database was imported from an existing container — Slipway does not know its password. Use the credentials you set when you created it."
      : externalConnectionString
        ? `Internal (host): use the connection string above. From outside the server: use the external string and open TCP port ${port} in your firewall (e.g. Azure NSG / ufw).`
        : `The port is published on the host. From outside the server, replace "${host}" with the server's public IP and open TCP port ${port} in your firewall.`

  return {
    username: user || undefined,
    password: pass || undefined,
    dbName: dbName || undefined,
    host,
    port,
    connectionString,
    externalConnectionString,
    note: externalNote,
  }
})

// Set / rotate the credentials on a Slipway-managed database. `docker exec`s
// the engine CLI (see realSetDatabaseCredentials). External/imported DBs and
// DBs without a container are refused honestly. On success the new password
// is stored so /credentials reveals it; it is NOT returned here — call GET to
// reveal (keeps the rotate-then-confirm flow consistent with provision).
export const POST = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const result = await realSetDatabaseCredentials(
    params.id,
    { password: body.password, username: body.username },
    auth.username
  )
  return { ok: true, username: result.username, hasPassword: !!result.password }
})