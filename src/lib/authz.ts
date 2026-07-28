/**
 * Authorization policy — pure, dependency-free, and therefore testable.
 *
 * ponytail: this lives apart from server-auth.ts on purpose. The scope check
 * used to sit next to the next-auth/Prisma imports, which made it impossible to
 * exercise from the self-check without booting a database and a session layer —
 * so it was never exercised at all, and nobody noticed that `can()` had no
 * callers and every API token behaved like an admin. Keep this module free of
 * imports so scripts/selfcheck-host-health.ts can keep covering it.
 */

export type AuthAction = "read" | "deploy" | "admin"

/** Privilege ranking. A principal may perform any action at or below its role. */
const RANK: Record<string, number> = {
  read: 0,
  deploy: 1,
  admin: 2,
}

/**
 * Can a principal with `role` perform `action`?
 *
 * Unknown roles are treated as read-only rather than denied outright, so a
 * legacy or hand-edited scope string degrades to the safest useful level
 * instead of locking the caller out of everything.
 */
export function roleAllows(role: string, action: AuthAction): boolean {
  const have = RANK[role] ?? RANK.read
  const need = RANK[action] ?? RANK.admin
  return have >= need
}

/**
 * The privilege an HTTP method implies when a route doesn't declare one:
 * reads are `read`, anything that mutates is at least `deploy`.
 */
export function defaultActionFor(method: string): AuthAction {
  const m = (method || "").toUpperCase()
  return m === "GET" || m === "HEAD" || m === "OPTIONS" ? "read" : "deploy"
}
