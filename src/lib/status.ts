/**
 * Derived status model (META-RULE 2) — one honest, timestamped status per
 * entity with an explicit stale/unknown state. Pure so the self-check covers
 * the transitions without Docker or a network.
 */

export type CertState = "active" | "pending" | "stuck" | "failed" | "self-signed" | "http" | "unknown"

export interface CertStatus {
  state: CertState
  /** derived label for badges */
  label: string
  /** color key the UI maps to classes */
  tone: "ok" | "warn" | "error" | "neutral"
  reason?: string
  checkedAt?: string
}

const CERT_STUCK_MS = 10 * 60 * 1000 // pending > 10 min with no progress -> stuck

/**
 * Derive the cert state from the domain row + when it was requested. A bare
 * IP can never be ACME-pending (public CAs don't issue for IPs), so IP rows
 * are self-signed (https) or http — never "pending".
 */
export function deriveCertStatus(opts: {
  hostname: string
  ssl: string
  status: string
  https: boolean
  createdAt?: string | Date | null
  now?: number
  isIp?: boolean
}): CertStatus {
  const now = opts.now ?? Date.now()
  const created = opts.createdAt ? new Date(opts.createdAt).getTime() : null
  const ageMs = created ? now - created : 0

  // IP mode: hard truth — never ACME, never "Cert pending".
  if (opts.isIp) {
    return opts.https
      ? { state: "self-signed", label: "Self-signed", tone: "warn", reason: "Public CAs do not issue certificates for bare IPs.", checkedAt: new Date(now).toISOString() }
      : { state: "http", label: "HTTP", tone: "neutral", reason: "Not encrypted.", checkedAt: new Date(now).toISOString() }
  }

  if (opts.ssl === "disabled" || !opts.https) {
    return { state: "http", label: "HTTP", tone: "neutral", checkedAt: new Date(now).toISOString() }
  }
  // Self-signed / custom cert on a real hostname (not just IP mode): it is a
  // working TLS endpoint with an untrusted cert — show Self-signed, never pending.
  if (opts.ssl === "custom") {
    return { state: "self-signed", label: "Self-signed", tone: "warn", reason: "Using a custom/self-signed certificate — browsers will warn.", checkedAt: new Date(now).toISOString() }
  }
  if (opts.status === "failed") {
    return { state: "failed", label: "Cert failed", tone: "error", checkedAt: new Date(now).toISOString() }
  }
  if (opts.status === "active" && opts.ssl === "managed") {
    return { state: "active", label: "HTTPS", tone: "ok", checkedAt: new Date(now).toISOString() }
  }
  // pending: transition to stuck after the timeout so it can't sit green-ish
  // forever with no certificate actually issued.
  if (ageMs > CERT_STUCK_MS) {
    return {
      state: "stuck",
      label: "Cert stuck",
      tone: "warn",
      reason: "No certificate after 10 min — check DNS resolves to this host and the ACME challenge can reach it.",
      checkedAt: new Date(now).toISOString(),
    }
  }
  return { state: "pending", label: "Cert pending", tone: "warn", checkedAt: new Date(now).toISOString() }
}

export type ReachState = "reachable" | "http-error" | "connection-failed" | "tls-error" | "unknown"

export interface ReachStatus {
  state: ReachState
  label: string
  tone: "ok" | "warn" | "error" | "neutral"
  code?: number
  latencyMs?: number
  hint?: string
  checkedAt: string
}

/** Map a probe result to a chip state + an honest hint. */
export function reachabilityFromProbe(opts: {
  ok: boolean
  code?: number
  latencyMs?: number
  error?: string
  checkedAt?: number
}): ReachStatus {
  const at = new Date(opts.checkedAt ?? Date.now()).toISOString()
  if (opts.ok) {
    return { state: "reachable", label: "Reachable", tone: "ok", code: opts.code, latencyMs: opts.latencyMs, checkedAt: at }
  }
  const err = (opts.error || "").toLowerCase()
  if (err.includes("certificate") || err.includes("tls") || err.includes("ssl") || err.includes("self signed")) {
    return {
      state: "tls-error",
      label: "TLS error",
      tone: "error",
      hint: "TLS handshake failed — the cert isn't issued yet (pending) or is self-signed; browsers will warn.",
      checkedAt: at,
    }
  }
  if (opts.code === 404) {
    return {
      state: "http-error",
      label: "404",
      tone: "warn",
      code: 404,
      hint: "App answered but no route at '/'. Set a health path or add a root route; if this port is the proxy, ensure a router matches this host.",
      checkedAt: at,
    }
  }
  if (opts.code && opts.code >= 500) {
    return {
      state: "http-error",
      label: `${opts.code}`,
      tone: "error",
      code: opts.code,
      hint: "App responded with a server error — check its logs for a crash / port conflict / missing module.",
      checkedAt: at,
    }
  }
  return {
    state: "connection-failed",
    label: "Unreachable",
    tone: "error",
    hint: "Nothing listening — check the process is running (not crash-looping) and the port isn't in use.",
    checkedAt: at,
  }
}
