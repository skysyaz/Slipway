import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/notify"
import { createHash } from "node:crypto"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const keys = await db.sshKey.findMany({ orderBy: { createdAt: "desc" } })
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    publicKey: k.publicKey,
    scope: k.scope,
    fingerprint: k.fingerprint ?? null,
    createdAt: k.createdAt.toISOString(),
  }))
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "")
  const publicKey = String(body.publicKey || "")
  if (!name || !publicKey) return new Response(JSON.stringify({ error: "name and publicKey required" }), { status: 400 })
  const fingerprint = sshFingerprint(publicKey)
  const key = await db.sshKey.create({ data: { name, publicKey, scope: String(body.scope || "cluster"), fingerprint } })
  await recordActivity("server", `added SSH key "${name}"`, { actor: auth.username })
  return {
    id: key.id,
    name: key.name,
    publicKey: key.publicKey,
    scope: key.scope,
    fingerprint: key.fingerprint,
    createdAt: key.createdAt.toISOString(),
  }
})

export const DELETE = route(async (req, _params, auth) => {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 })
  await db.sshKey.deleteMany({ where: { id } })
  await recordActivity("server", `deleted SSH key`, { actor: auth.username })
  return { ok: true }
})

// Best-effort fingerprint (the base64 body's MD5, ssh-keygen style). Not used
// for security — only to give the UI a recognizable identifier.
function sshFingerprint(pubkey: string): string {
  try {
    const parts = pubkey.trim().split(/\s+/)
    if (parts.length < 2) return ""
    const buf = Buffer.from(parts[1], "base64")
    return createHash("md5").update(buf).digest("hex").replace(/(.{2})/g, "$1:").replace(/:$/, "")
  } catch {
    return ""
  }
}