import { route } from "@/lib/http"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { recordActivity } from "@/lib/notify"
import { mintToken, tokenDigest } from "@/lib/security"

export const dynamic = "force-dynamic"

// R7: a read-scoped token must NOT enumerate every token's name/scope/last-
// used — that maps the attack surface. Listing tokens is an admin operation.
export const GET = route(async () => {
  const tokens = await db.apiToken.findMany({ orderBy: { createdAt: "desc" } })
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }))
}, { action: "admin" })

// Mint a token server-side. Returns the plaintext token ONCE (never stored).
export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "token")
  const scope = String(body.scope || "read")
  const plaintext = mintToken()
  const tokenHash = await bcrypt.hash(plaintext, 10)
  const lookupHash = tokenDigest(plaintext)
  const token = await db.apiToken.create({
    data: { name, scope, tokenHash, lookupHash, userId: auth.userId || null },
  })
  await recordActivity("server", `created API token "${name}" (${scope})`, { actor: auth.username })
  return {
    id: token.id,
    name,
    scope,
    token: plaintext, // shown once to the caller
    createdAt: token.createdAt.toISOString(),
  }
}, { action: "admin" })