import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeServer } from "@/lib/serialize"
import { emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const servers = await db.server.findMany({ orderBy: { createdAt: "asc" } })
  return servers.map(serializeServer)
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "new-server")
  const server = await db.server.create({
    data: {
      name,
      hostname: String(body.hostname || `${name}.slipway.run`),
      ip: String(body.ip || ""),
      role: String(body.role || "worker"),
      status: "offline",
      os: String(body.os || "Ubuntu 24.04 LTS"),
      cpuCores: Number(body.cpuCores || 4),
      memoryGb: Number(body.memoryGb || 16),
      diskGb: Number(body.diskGb || 200),
      region: String(body.region || "local"),
      sshUser: body.sshUser || null,
      sshKeyId: body.sshKeyId || null,
    },
  })
  await emit(
    "server.connected",
    "server",
    `added server ${name} (${server.ip}) to cluster`,
    {
      title: "Server added",
      body: `${name} added to the cluster. Run "Join" to connect over SSH.`,
      level: "info",
      kind: "server",
    },
    { actor: auth.username }
  )
  return serializeServer(server)
})