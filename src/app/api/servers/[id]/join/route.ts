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
  const result = await new Promise<{ ok: boolean; os?: string; docker?: string; error?: string }>(
    (resolve) => {
      const timer = setTimeout(() => {
        try { conn.end() } catch { /* noop */ }
        resolve({ ok: false, error: "SSH connection timed out" })
      }, 15000)

      conn.on("ready", () => {
        conn.exec("uname -srm; echo '---'; docker --version 2>/dev/null || echo 'docker: not installed'", (err, stream) => {
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
            const [osLine, , dockerLine] = out.split("\n")
            const docker = dockerLine && dockerLine.startsWith("Docker version ")
              ? dockerLine.trim()
              : ""
            try { conn.end() } catch { /* noop */ }
            resolve({ ok: true, os: osLine?.trim() || server.os, docker })
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
        uptimeHours: 0,
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
})