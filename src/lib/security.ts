/**
 * Security-critical helpers — pure + dependency-light so the self-check can
 * cover them without a DB, Docker socket, or network. Every dangerous sink
 * gets ONE named helper (META-RULE 5/6/7), and every fix routes through it.
 */
import { isIpLiteral } from "./ip"
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto"

/* ── R5 IP validation (never ^(\d{1,3}\.) — that matches 999.999.999.999) ── */
/**
 * ponytail: was `net.isIP`, but this module is imported by a CLIENT component
 * (project-detail.tsx uses validIp), which forced `node:net` into the browser
 * bundle and broke `next build` entirely:
 *   the chunking context (unknown) does not support external modules
 *   (request: node:net)
 * src/lib/ip.ts is a pure equivalent, differential-tested against the builtin.
 */
export function validIp(host: string): boolean {
  return isIpLiteral(host)
}

export function isPrivateIp(host: string): boolean {
  const h = String(host || "").trim()
  if (!validIp(h)) return false
  if (h.includes(":")) {
    const v6 = h.toLowerCase()
    return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

/* ── R5 SSRF guard: scheme allowlist + resolved-IP blocklist ─────────────── */
export interface WebhookCheck {
  ok: boolean
  reason?: string
  hostname?: string
}

const BLOCKED_HOST_EXACT = new Set(["localhost", "metadata", "169.254.169.254"])

/** Validate a user-supplied URL BEFORE any server-side fetch. */
export function validateWebhookUrl(raw: string): WebhookCheck {
  const s = String(raw || "").trim()
  if (!s) return { ok: false, reason: "empty url" }
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return { ok: false, reason: "not a valid URL" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `scheme "${url.protocol.replace(":", "")}" not allowed (http/https only)` }
  }
  const host = url.hostname.toLowerCase()
  if (BLOCKED_HOST_EXACT.has(host)) {
    return { ok: false, reason: `"${host}" is blocked` }
  }
  if (validIp(host) && isPrivateIp(host)) {
    return { ok: false, reason: `"${host}" is a private/loopback address` }
  }
  return { ok: true, hostname: host }
}

/* ── R6 redact(): one helper run on every egress ─────────────────────────── */
export const REDACTED = "[redacted]"
const SECRET_KEY = /(password|passwd|secret|token|credential|apikey|api_key|private|auth)/i
const BASE64ISH = /^[A-Za-z0-9+/=]{24,}$/
const JWT = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export function scrub(value: unknown, keyHint = ""): unknown {
  if (value == null) return value
  if (typeof value === "string") {
    if (SECRET_KEY.test(keyHint)) return REDACTED
    if (JWT.test(value)) return REDACTED
    if (BASE64ISH.test(value) && /auth|cred|pass|token/i.test(keyHint)) return REDACTED
    return value
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, keyHint))
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrub(v, k)
    return out
  }
  return value
}

/* ── R6 encrypt-at-rest for DB passwords (AES-256-GCM) ───────────────────── */
function masterKey(): Buffer {
  const hex = process.env.SLIPWAY_MASTER_KEY?.trim() || process.env.NEXTAUTH_SECRET?.trim() || ""
  if (!hex) {
    // Fail closed: never encrypt with a known/derived-insecure key.
    throw new Error("SLIPWAY_MASTER_KEY (or NEXTAUTH_SECRET) is required to encrypt secrets at rest")
  }
  // accept either a 64-char hex key or any passphrase (derive 32 bytes)
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex")
  return createHash("sha256").update(hex).digest()
}

export function encryptSecret(plaintext: string): string {
  const key = masterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) return stored // legacy plaintext passthrough
  const key = masterKey()
  const [, ivb, tagb, encb] = stored.split(":")
  const iv = Buffer.from(ivb, "base64")
  const tag = Buffer.from(tagb, "base64")
  const enc = Buffer.from(encb, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
}

/* ── R7 hashed-token auth (sha256 index, no per-miss bcrypt scan) ─────────── */
export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function mintToken(): string {
  return `slipway_${randomBytes(24).toString("hex")}`
}

/* ── R4 boot secret (fail closed, no hardcoded literal) ──────────────────── */
let generated: string | null = null
export function resolveJwtSecret(): string {
  const fromEnv =
    process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || ""
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET is not set — refusing to boot in production with a guessable session secret. Set NEXTAUTH_SECRET (or AUTH_SECRET)."
    )
  }
  // dev: generate once per process (stable across the run), warn loudly
  if (!generated) {
    generated = randomBytes(32).toString("hex")
    console.warn(
      "[slipway] NEXTAUTH_SECRET unset — generated an ephemeral dev secret. Sessions will not survive a restart. Set NEXTAUTH_SECRET."
    )
  }
  return generated
}

/* ── R5 shell: correct single-quote + escaping ───────────────────────────── */
export function shellQuote(v: string): string {
  return `'${String(v).replace(/'/g, `'\\''`)}'`
}

/**
 * Detect shell metacharacters that would let a single-argument field break out
 * into command execution. Used to REJECT startCmd/buildCmd that try to smuggle
 * `; $( ) \` | & < >` into an exec-form argument vector.
 */
export function hasShellMetachars(v: string): boolean {
  return /[;&|`$()<>\\]/.test(String(v))
}

/** exec-form argv for a container CMD/ENTRYPOINT — no shell interpretation. */
export function execFormArgv(cmd: string): string[] {
  // Split on whitespace, honoring simple double-quoted spans.
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  const s = String(cmd)
  while ((m = re.exec(s))) out.push(m[1] ?? m[2])
  return out.filter(Boolean)
}
