import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeServer } from "@/lib/serialize"
import { emit } from "@/lib/notify"
import { getHostDiskUsage, bytesToGb } from "@/lib/docker-ops"
import os from "node:os"

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
    if (isLocalHost(s)) {
      if (host) {
        out.diskGb = bytesToGb(host.totalBytes)
        out.diskUsedGb = bytesToGb(host.usedBytes)
      }
      // ponytail: CPU cores and RAM are just as knowable as the disk, and were
      // just as fake — the seed writes cpuCores: 4 / memoryGb: 16 for every
      // install, and Settings rendered "4 cores · 16 GB" as fact on machines
      // that had neither. node:os reports the real numbers for the host this
      // process runs on, so the local row now matches the machine.
      out.cpuCores = os.cpus().length || out.cpuCores
      out.memoryGb = Math.round((os.totalmem() / 1e9) * 10) / 10 || out.memoryGb
      // uptime is real too; the stored 0 was never updated.
      out.uptimeHours = Math.floor(os.uptime() / 3600)
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
      // ponytail: no invented identity. The hostname defaulted to
      // `<name>.slipway.run` — a domain that does not exist and that nothing
      // resolves — and the OS to "Ubuntu 24.04 LTS" for a machine nobody had
      // contacted. Fall back to the address the operator actually gave us, and
      // leave the OS blank until the SSH join probe reads it.
      hostname: String(body.hostname || body.ip || name),
      ip: String(body.ip || ""),
      role: String(body.role || "worker"),
      status: "offline",
      os: String(body.os || ""),
      // ponytail: 0 means "not measured yet", not "a 4-core/16 GB/200 GB box".
      // The join probe fills these in over SSH; the UI renders 0 as "—".
      cpuCores: Number(body.cpuCores || 0),
      memoryGb: Number(body.memoryGb || 0),
      diskGb: Number(body.diskGb || 0),
      region: String(body.region || "local"),
      sshUser: body.sshUser || null,
      sshKeyId: body.sshKeyId || null,
    },
  })
  // ponytail: "system", not "server.connected" — nothing has connected yet;
  // the row was recorded and Join has still to run. Firing a connected event
  // here told every external integration the opposite.
  await emit(
    "system",
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
}, { action: "admin" })