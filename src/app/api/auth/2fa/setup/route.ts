import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { generateSecret, generateURI } from "otplib"
import QRCode from "qrcode"
import { recordActivity } from "@/lib/notify"

export const dynamic = "force-dynamic"

// Generate (or reuse) a TOTP secret for the signed-in user and return a QR code
// + otpauth URI. The secret is stored but 2FA is NOT enabled until /verify.
export const POST = route(async (_req, _params, auth) => {
  if (!auth.userId) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401 })
  const user = await db.user.findUnique({ where: { id: auth.userId } })
  if (!user) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  const secret = user.totpSecret || generateSecret()
  if (!user.totpSecret) {
    await db.user.update({ where: { id: user.id }, data: { totpSecret: secret } })
  }

  const issuer = "Slipway"
  const account = user.username
  const otpauth = generateURI({ secret, label: account, issuer })
  const qr = await QRCode.toDataURL(otpauth)

  await recordActivity("security", `began 2FA setup for ${user.username}`, { actor: auth.username })
  return { secret, qr, otpauth }
}, { action: "admin" })