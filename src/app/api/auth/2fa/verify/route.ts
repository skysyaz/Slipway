import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { verify as verifyTotp } from "otplib"
import { TOTP_TOLERANCE_SECONDS } from "@/lib/auth"
import { recordActivity, emit } from "@/lib/notify"

export const dynamic = "force-dynamic"

// Confirm a TOTP code against the stored secret and enable 2FA.
export const POST = route(async (req, _params, auth) => {
  if (!auth.userId) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401 })
  const body = await req.json().catch(() => ({}))
  const token = String(body.token || "").trim()
  const user = await db.user.findUnique({ where: { id: auth.userId } })
  if (!user || !user.totpSecret) {
    return new Response(JSON.stringify({ error: "Run setup first" }), { status: 400 })
  }
  let ok = false
  try {
    const res = await verifyTotp({
      token,
      secret: user.totpSecret,
      // Same clock-skew allowance the sign-in gate uses — enrolling must not
      // accept a code that sign-in would then reject (or vice versa).
      epochTolerance: TOTP_TOLERANCE_SECONDS,
    })
    ok = res.valid === true
  } catch {
    ok = false
  }
  if (!ok) return new Response(JSON.stringify({ error: "Invalid code" }), { status: 400 })

  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } })
  await emit("system", "security", `enabled 2FA for ${user.username}`, {
    title: "Two-factor authentication enabled",
    body: `${user.username} now requires a TOTP code at sign-in.`,
    level: "success",
    kind: "security",
  }, { actor: auth.username })
  return { enabled: true }
}, { action: "admin" })