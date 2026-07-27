import { route } from "@/lib/http"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

// Disable 2FA. Requires the account password to confirm.
export const POST = route(async (req, _params, auth) => {
  if (!auth.userId) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401 })
  const body = await req.json().catch(() => ({}))
  const password = String(body.password || "")
  const user = await db.user.findUnique({ where: { id: auth.userId } })
  if (!user) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return new Response(JSON.stringify({ error: "Incorrect password" }), { status: 400 })
  }
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } })
  await recordActivity("security", `disabled 2FA for ${user.username}`, { actor: auth.username })
  return { enabled: false }
})