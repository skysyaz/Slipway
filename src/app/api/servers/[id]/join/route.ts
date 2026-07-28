import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { Client } from "ssh2"
import { recordActivity, emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

// Attempt a real SSH connection to a server. On success, probe the host
// (uname, docker presence) and mark it online with the discovered details.
// On failure, mark it offline with an honest error. Best-effort: relies on
// the host being reachable and credentials being correct.
export const POST = route(async (_req, params, auth) => {
  const server = await db.server.findUnique({ where: { id: params.id } })
  if (!server) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  const sshUser = server.sshUser || "root"
  const port = 22
  let key: Buffer | null = null
  if (server.sshKeyId) {
    const k = await db.sshKey.findUnique({ where: { id: server.sshKeyId } })
    // SshKey stores a *public* key; for a private key we'd need a separate
    // secret. Ponytail: support password auth via Setting, else report that
    // a private key is required for a real join.
    if (k) {
      // a public key alone cannot authenticate; we need the private half.
      key = null
    }
  }

  // Allow a per-server password via Setting `server:<id>:password` for local
  // testing. Never returned to the client.
  const pwRow = await db.setting.findUnique({ where: { key: `server:${server.id}:password` } })
  const password = pwRow?.value || undefined

  if (!password && !key) {
    await db.server.update({
      where: { id: server.id },
      data: { status: "offline", dockerVersion: "" },
    })
    return new Response(
      JSON.stringify({
        error:
          "No usable SSH credential. Set a password via the `server:<id>:password` Setting, or store a private key. A stored public key alone cannot authenticate.",
      }),
      { status: 400 }
    )
  }

  const conn = new Client()
  const result = await new Promise<{
      ok: boolean
      os?: string
      docker?: string
      error?: string
      cpuCores?: number
      memoryGb?: number
      diskGb?: number
      diskUsedGb?: number
      uptimeHours?: number
    }>(
    (resolve) => {
      const timer = setTimeout(() => {
        try { conn.end() } catch { /* noop */ }
        resolve({ ok: false, error: "SSH connection timed out" })
      }, 15000)

      conn.on("ready", () => {
        // ponytail: probe the real hardware while we're connected. The Server
        // row previously carried whatever the add-server dialog invented
        // (4 cores / 16 GB / 200 GB), and nothing ever corrected it — so the
        // Servers list reported fictional specs for every remote machine. These
        // are all cheap, POSIX-ish reads; anything unavailable stays 0 and the
        // UI shows "—" rather than a guess.
        conn.exec(
          [
            "uname -srm",
            "echo '---'",
            "docker --version 2>/dev/null || echo 'docker: not installed'",
            "echo '---'",
            "nproc 2>/dev/null || echo 0",
            "echo '---'",
            "awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0",
            "echo '---'",
            "df -kP / 2>/dev/null | awk 'NR==2 {print $2, $3}' || echo '0 0'",
            "echo '---'",
            "awk '{print $1}' /proc/uptime 2>/dev/null || echo 0",
          ].join("; "),
          (err, stream) => {
          if (err) {
            clearTimeout(timer)
            resolve({ ok: false, error: err.message })
            return
          }
          let out = ""
          stream.on("data", (d: Buffer) => { out += d.toString() })
          stream.stderr?.on("data", () => { /* ignore */ })
          stream.on("close", () => {
            clearTimeout(timer)
            const parts = out.split("---").map((p) => p.trim())
            const [osLine, dockerLine, nprocLine, memKbLine, dfLine, uptimeLine] = parts
            const docker = dockerLine?.startsWith("Docker version ") ? dockerLine.trim() : ""
            const num = (v: string | undefined) => {
              const n = Number((v || "").trim())
              return Number.isFinite(n) && n > 0 ? n : 0
            }
            const [dfTotalKb, dfUsedKb] = (dfLine || "").split(/\s+/)
            try { conn.end() } catch { /* noop */ }
            resolve({
              ok: true,
              os: osLine?.trim() || server.os,
              docker,
              cpuCores: Math.round(num(nprocLine)),
              // /proc/meminfo reports kB
              memoryGb: Math.round((num(memKbLine) * 1024) / 1e9 * 10) / 10,
              // df -kP reports 1K blocks
              diskGb: Math.round((num(dfTotalKb) * 1024) / 1e9 * 10) / 10,
              diskUsedGb: Math.round((num(dfUsedKb) * 1024) / 1e9 * 10) / 10,
              uptimeHours: Math.floor(num(uptimeLine) / 3600),
            })
          })
        })
      })
      conn.on("error", (e: Error) => {
        clearTimeout(timer)
        resolve({ ok: false, error: e.message })
      })

      conn.connect({
        host: server.ip || server.hostname,
        port,
        username: sshUser,
        ...(password ? { password } : {}),
        ...(key ? { privateKey: key } : {}),
        readyTimeout: 15000,
      })
    }
  )

  if (result.ok) {
    await db.server.update({
      where: { id: server.id },
      data: {
        status: "online",
        os: result.os || server.os,
        dockerVersion: result.docker || "",
        joinedAt: new Date(),
        // keep the previous value when a probe came back empty rather than
        // zeroing a figure we simply failed to read this time
        ...(result.cpuCores ? { cpuCores: result.cpuCores } : {}),
        ...(result.memoryGb ? { memoryGb: Math.round(result.memoryGb) } : {}),
        ...(result.diskGb ? { diskGb: Math.round(result.diskGb) } : {}),
        ...(result.diskUsedGb ? { diskUsedGb: Math.round(result.diskUsedGb) } : {}),
        uptimeHours: result.uptimeHours ?? 0,
      },
    })
    await emit("server.connected", "server", `joined server ${server.name}`, {
      title: "Server joined",
      body: `${server.name} (${server.ip}) is online${result.docker ? ` · ${result.docker}` : " · Docker not installed"}.`,
      level: "success",
      kind: "server",
    }, { actor: auth.username })
    return { ok: true, status: "online", os: result.os, docker: result.docker }
  }

  await db.server.update({ where: { id: server.id }, data: { status: "offline" } })
  await recordActivity("server", `failed to join ${server.name}: ${result.error}`, { actor: auth.username })
  return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502 })
}, { action: "admin" })