import { route } from "@/lib/http"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const tokens = await db.apiToken.findMany({ orderBy: { createdAt: "desc" } })
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }))
})

// Mint a token server-side. Returns the plaintext token ONCE (never stored).
export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "token")
  const scope = String(body.scope || "read")
  const plaintext = `slipway_${cryptoRandom(40)}`
  const tokenHash = await bcrypt.hash(plaintext, 10)
  const token = await db.apiToken.create({
    data: { name, scope, tokenHash, userId: auth.userId || null },
  })
  await recordActivity("server", `created API token "${name}" (${scope})`, { actor: auth.username })
  return {
    id: token.id,
    name,
    scope,
    token: plaintext, // shown once to the caller
    createdAt: token.createdAt.toISOString(),
  }
})

function cryptoRandom(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len)
}