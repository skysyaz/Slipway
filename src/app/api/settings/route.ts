import { route } from "@/lib/http"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { APP_VERSION } from "@/config/app"
import { redactSecretValue } from "@/lib/sanitize-fields"
import { roleAllows } from "@/lib/authz"

export const dynamic = "force-dynamic"

export const GET = route(async (_req, _params, auth) => {
  const rows = await db.setting.findMany()
  const settings: Record<string, string> = {}
  // ponytail: Settings stores per-server SSH passwords (`server:<id>:password`).
  // A read-scoped API token used to receive every Setting value verbatim via
  // this GET. Redact credential-ish keys unless the principal is admin
  // (sessions carry role "user"/"admin" from the User row — treat interactive
  // sessions as full operators per the deliberate session bypass, so only
  // redact for non-admin tokens).
  const redact =
    auth.via === "token" && !roleAllows(auth.role, "admin")
  for (const r of rows) {
    settings[r.key] = redact ? redactSecretValue(r.key, r.value) : r.value
  }
  const user = auth.userId ? await db.user.findUnique({ where: { id: auth.userId } }) : null

  // ponytail: bug 2 — read the displayed version from the single source of
  // truth (src/config/app), not package.json (whose version is the npm package
  // version, decoupled from the app version shown in the UI). Keeps the
  // Settings "Slipway server" card in sync with the sidebar/login label.
  const version = APP_VERSION

  return {
    settings,
    profile: user
      ? {
          username: user.username,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
          role: user.role,
          totpEnabled: user.totpEnabled,
        }
      : null,
    version,
    // Auth provider availability is env-gated — reflect the real state.
    providers: {
      credentials: true,
      github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      gitlab: Boolean(
        process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET && process.env.GITLAB_ISSUER
      ),
      oidc: false,
      saml: false,
    },
  }
})

// PATCH updates profile fields (displayName/email) and arbitrary Setting rows.
export const PATCH = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))

  if (body.profile && auth.userId) {
    const p = body.profile as { displayName?: string; email?: string }
    await db.user.update({
      where: { id: auth.userId },
      data: {
        ...(p.displayName !== undefined ? { displayName: p.displayName } : {}),
        ...(p.email !== undefined ? { email: p.email } : {}),
      },
    })
  }

  if (body.settings && typeof body.settings === "object") {
    for (const [key, value] of Object.entries(body.settings as Record<string, string>)) {
      await db.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    }
  }
  return { ok: true }
}, { action: "admin" })

// helper exported for the auth layer to verify a bcrypt password
export async function verifyPassword(plaintext: string, hash: string | null): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plaintext, hash)
}