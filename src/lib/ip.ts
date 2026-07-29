/**
 * IP address validation — pure, with no Node builtins.
 *
 * ponytail: this exists because `validIp` lived in security.ts, which imports
 * `node:net`, and project-detail.tsx (a CLIENT component) imports validIp to
 * decide whether a domain is an IP. Turbopack then had to put `node:net` in a
 * browser chunk and `next build` failed outright with
 *   the chunking context (unknown) does not support external modules
 *   (request: node:net)
 * so trunk did not build at all. Keeping the check pure fixes the bundle and
 * costs nothing: `net.isIP` is itself just a parser.
 *
 * `ipKind` is a drop-in for `net.isIP` (returns 4, 6 or 0) and is verified
 * against the builtin in scripts/selfcheck-host-health.ts.
 */

/** IPv4 in strict dotted-quad form: four decimal octets, no leading zeros. */
function isIPv4(s: string): boolean {
  const parts = s.split(".")
  if (parts.length !== 4) return false
  for (const p of parts) {
    // node's parser rejects empty parts, non-digits, >3 digits and leading zeros
    if (!/^\d{1,3}$/.test(p)) return false
    if (p.length > 1 && p[0] === "0") return false
    if (Number(p) > 255) return false
  }
  return true
}

/**
 * IPv6, including compressed (`::`) forms and IPv4-mapped tails
 * (`::ffff:192.0.2.1`).
 *
 * A single zone identifier is accepted (`fe80::1%eth0`) because `net.isIP`
 * accepts one — but the zone must be non-empty, and only one `%` is allowed.
 * (Verified against the builtin: `fe80::1%` and `::%a%b` are both rejected by
 * node, and IPv4 with a zone is rejected outright.)
 */
function isIPv6(input: string): boolean {
  let s = input
  const pct = s.indexOf("%")
  if (pct !== -1) {
    const zone = s.slice(pct + 1)
    if (!zone || zone.includes("%")) return false
    s = s.slice(0, pct)
  }
  if (!s.includes(":")) return false

  // At most one "::", and ":::" is never valid.
  const doubleColons = s.match(/::/g)
  if (doubleColons && doubleColons.length > 1) return false
  if (s.includes(":::")) return false

  const compressed = s.includes("::")
  // A single leading/trailing colon is only legal as part of "::".
  if (!compressed && (s.startsWith(":") || s.endsWith(":"))) return false
  if (compressed) {
    if (s.startsWith(":") && !s.startsWith("::")) return false
    if (s.endsWith(":") && !s.endsWith("::")) return false
  }

  const [head, tail = ""] = compressed ? s.split("::") : [s, undefined as unknown as string]
  const headGroups = head === "" ? [] : head.split(":")
  const tailGroups = tail === "" || tail === undefined ? [] : tail.split(":")
  const groups = compressed ? [...headGroups, ...tailGroups] : s.split(":")

  // A trailing IPv4 literal counts as the final two 16-bit groups.
  let hextetCount = groups.length
  const last = groups[groups.length - 1]
  if (last !== undefined && last.includes(".")) {
    if (!isIPv4(last)) return false
    hextetCount = groups.length - 1 + 2
  }

  const hextets = last !== undefined && last.includes(".") ? groups.slice(0, -1) : groups
  for (const g of hextets) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false
  }

  // Uncompressed addresses need exactly 8 groups; compressed ones fewer, since
  // "::" stands in for at least one group of zeros.
  if (compressed) return hextetCount <= 7
  return hextetCount === 8
}

/** Drop-in replacement for `net.isIP`: 4, 6, or 0 when the string is neither. */
export function ipKind(host: string): 0 | 4 | 6 {
  const h = String(host || "")
  if (isIPv4(h)) return 4
  if (isIPv6(h)) return 6
  return 0
}

/** True when `host` is a valid IPv4 or IPv6 literal. */
export function isIpLiteral(host: string): boolean {
  return ipKind(String(host || "").trim()) !== 0
}
