/**
 * Value guards applied at trust boundaries — pure and dependency-free so
 * scripts/selfcheck-host-health.ts can cover them without a database.
 *
 * Both exist because of a real defect:
 *  - redactSecretValue: the config export dumped every Setting row verbatim,
 *    and Settings is where per-server SSH passwords live.
 *  - normalizeCommitSha: deployments were stamped with a random hex string that
 *    the dashboard then displayed as the git commit.
 */

/**
 * Setting keys whose value must never leave the server in an export.
 * Deliberately broad — a false positive costs one redacted line in a config
 * dump, a false negative leaks a credential.
 */
export const SECRET_KEY_PATTERN =
  /(password|passwd|secret|token|credential|apikey|api_key|private|(^|[._:-])pass$)/i

export const REDACTED = "[redacted]"

/**
 * Redact a Setting value when its key looks like a credential. The key itself
 * is preserved by the caller so the export still documents that it is set.
 */
export function redactSecretValue(key: string, value: string): string {
  return SECRET_KEY_PATTERN.test(key) ? REDACTED : value
}

/**
 * Redact credential material that may sit inside a URL (userinfo, token query
 * params). Used by the config export so webhook destinations don't leak
 * Discord/Slack/PagerDuty secrets that live in the path or query string.
 */
export function redactSecretUrl(url: string): string {
  const raw = String(url || "")
  if (!raw) return raw
  try {
    const u = new URL(raw)
    if (u.username || u.password) {
      u.username = u.username ? "redacted" : ""
      u.password = u.password ? "redacted" : ""
    }
    for (const key of ["token", "access_token", "key", "api_key", "apikey", "secret", "password", "auth"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, REDACTED)
    }
    // Discord/Slack-style webhook paths embed a secret after /webhooks/ or /hooks/
    u.pathname = u.pathname.replace(
      /(\/hooks\/|\/webhooks\/)[^/]+(\/[^/]+)?/gi,
      (_m, prefix: string, rest?: string) => `${prefix}${REDACTED}${rest ? `/${REDACTED}` : ""}`
    )
    return u.toString()
  } catch {
    return REDACTED
  }
}

/**
 * Accept a git object id, reject anything else.
 *
 * Returns "" when the caller doesn't actually know the commit, so the column
 * stays empty and the UI renders "—" instead of showing a fabricated SHA.
 */
export function normalizeCommitSha(input: unknown): string {
  const raw = String(input ?? "").trim()
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw.toLowerCase() : ""
}
