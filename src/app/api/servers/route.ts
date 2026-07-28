import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeServer } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { getHostDiskUsage, bytesToGb } from "@/lib/docker-ops"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const servers = await db.server.findMany({ orderBy: { createdAt: "asc" } })
  // ponytail: bug 2/4 — the Server rows store a stale hardcoded diskGb=200 /
  // diskUsedGb=0 that's never collected, so every disk card shows "0/200 GB".
  // This is a single-node self-hosted deploy, so the local host server's real
  // disk (read via a throwaway `df` container, cached 60s) overrides the stored
  // fiction. Remote/offline servers keep their stored values (no agent to read
  // them). The cluster card sums these, so with one server it matches exactly.
  const host = await getHostDiskUsage()
  const isLocalHost = (s: { ip: string; hostname: string; name: string }) =>
    s.ip === "127.0.0.1" || s.hostname === "localhost" || s.name === "local"
  return servers.map((s) => {
    const out = serializeServer(s)
    if (host && isLocalHost(s)) {
      out.diskGb = bytesToGb(host.totalBytes)
      out.diskUsedGb = bytesToGb(host.usedBytes)
    }
    return out
  })
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