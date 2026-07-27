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
  const buildUri = (h: string) =>
    row.kind === "redis" || row.kind === "valkey"
      ? `redis://${authPart}${h}:${port}`
      : `${row.kind}://${authPart}${h}:${port}${dbSegment}`
  const connectionString = buildUri(host)

  // ponytail: the published port is bound to 0.0.0.0 on the host, so it's
  // reachable from outside via the host's public address — but the connection
  // string above uses `host` (localhost), which only works from the host itself.
  // If the operator set SLIPWAY_PUBLIC_HOST, also surface an external URI and a
  // firewall reminder. Without that env we can't guess the public address.
  const publicHost = process.env.SLIPWAY_PUBLIC_HOST?.trim() || ""
  const externalConnectionString = publicHost && publicHost !== host ? buildUri(publicHost) : undefined

  const externalNote =
    row.status === "external"
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