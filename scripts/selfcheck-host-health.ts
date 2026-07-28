/**
 * ponytail: ONE runnable self-check for the host-health logic that's easy to
 * get subtly wrong — deploy-cause mapping, Traefik log parsing, the dockerode
 * multiplexed-stream demux (the □-tofu root cause), and the ANSI sanitizer.
 * No framework: plain node:assert, run via `tsx` (already a devDep for seed).
 *
 *   bunx tsx scripts/selfcheck-host-health.ts
 *
 * The Traefik lines below are the REAL lines from the 2026-07-28 outage dump
 * (sanitized form, as the live scanner sees them), so this guards the parsers
 * against the exact shapes that caused the incident.
 */
import assert from "node:assert/strict"
import {
  diagnoseDeployError,
  parseTraefikLogs,
  demuxStream,
  sanitize,
} from "../src/lib/host-health"

let n = 0
const ok = (name: string) => console.log(`  ✓ ${name}`)
const check = (name: string, fn: () => void) => {
  fn()
  n++
  ok(name)
}

// ── diagnoseDeployError: every signature + the null fallback ────────────────
check("spawn docker ENOENT → no-docker-CLI cause", () => {
  const d = diagnoseDeployError("docker build -t slipway-helix-web:latest . failed: spawn docker ENOENT")
  assert.ok(d, "expected a diagnosis")
  assert.match(d.cause, /no `docker` CLI/)
  assert.match(d.action, /image source|docker CLI in PATH/)
})

check("No space left on device → disk-full cause", () => {
  const d = diagnoseDeployError("PANIC: could not write to file pg_logical/x.tmp: No space left on device")
  assert.ok(d && /Host disk is full/.test(d.cause))
})

check("context canceled → daemon cause", () => {
  const d = diagnoseDeployError('Get "http://docker.sock/containers/json": context canceled')
  assert.ok(d && /daemon was restarting/.test(d.cause))
})

check("401 / Authentication failed → private/stale-token cause", () => {
  const d = diagnoseDeployError("fatal: could not read Username: Authentication failed for repo (401)")
  assert.ok(d && /private or the token is stale/i.test(d.cause))
})

check("missing dynamic yml → routing-config cause", () => {
  const d = diagnoseDeployError("open app-foo-bar-abc.yml: no such file or directory")
  assert.ok(d && /Routing config/.test(d.cause))
})

check("unrelated error → null (no false mapping)", () => {
  assert.equal(diagnoseDeployError("something else entirely"), null)
})

// ── parseTraefikLogs: the four real issue classes from the dump ─────────────
check("config: field not found, node (JSON-wrapped) → key trimmed", () => {
  const line = `{"level":"error","error":"command traefik error: field not found, node: excludedRequestPaths","time":"2026-07-16T11:24:03Z","message":"Command error"}`
  const iss = parseTraefikLogs(line)
  assert.equal(iss.length, 1)
  assert.equal(iss[0].kind, "config")
  assert.match(iss[0].message, /"excludedRequestPaths"/) // no trailing quote/JSON garbage
})

check("middleware: referenced-but-undefined → name captured", () => {
  const line = `2026-07-19T10:58:12Z ERR error="middleware \"redirect-to-https@file\" does not exist" entryPointName=web routerName=syazwan-timesheet-85qrzs-5-web@docker`
  const iss = parseTraefikLogs(line)
  assert.equal(iss.length, 1)
  assert.equal(iss[0].kind, "middleware")
  assert.match(iss[0].message, /redirect-to-https@file/)
})

check("acme: Unable to obtain → domain from domains=[\"x\"], HTTP 403, Cloudflare hint", () => {
  const line = `2026-07-26T15:43:50Z ERR Unable to obtain ACME certificate for domains error="unable to generate a certificate for the domains [slipway.skysyaz.my]: error: one or more domains had a problem:\\n[slipway.skysyaz.my] invalid authorization: acme: error: 403 :: 2606:4700:3032::ac43:bc6f: Invalid response ... 404\\n" domains=["slipway.skysyaz.my"] providerName=letsencrypt.acme routerName=slipway@file rule=Host(\`slipway.skysyaz.my\`)`
  const iss = parseTraefikLogs(line)
  assert.equal(iss.length, 1)
  assert.equal(iss[0].kind, "acme")
  assert.equal(iss[0].domain, "slipway.skysyaz.my")
  assert.match(iss[0].message, /HTTP 403/)
  assert.match(iss[0].hint ?? "", /Cloudflare|DNS-01/)
})

check("acme: 'Cannot retrieve the ACME challenge for X' → domain captured", () => {
  const line = `2026-07-16T11:20:09Z ERR Cannot retrieve the ACME challenge for router2.skysyaz.my (token "test") providerName=acme`
  const iss = parseTraefikLogs(line)
  assert.equal(iss.length, 1)
  assert.equal(iss[0].kind, "acme")
  assert.equal(iss[0].domain, "router2.skysyaz.my")
})

check("watcher: missing app-<slug>-<id>.yml → slug + id parsed", () => {
  const line = `2026-07-28T07:27:25Z ERR Error occurred during watcher callback error="/etc/dokploy/traefik/dynamic/app-transmit-neural-application-kwh9vu.yml: error reading configuration file: ... - open /etc/dokploy/traefik/dynamic/app-transmit-neural-application-kwh9vu.yml: no such file or directory" providerName=file`
  const iss = parseTraefikLogs(line)
  assert.equal(iss.length, 1)
  assert.equal(iss[0].kind, "watcher")
  assert.equal(iss[0].appSlug, "transmit-neural-application")
  assert.match(iss[0].message, /app-transmit-neural-application-kwh9vu\.yml/)
})

check("parseTraefikLogs dedups repeated identical issues", () => {
  const line = `2026-07-16T11:24:03Z {"error":"command traefik error: field not found, node: excludedRequestPaths"}`
  const iss = parseTraefikLogs([line, line, line].join("\n"))
  // same key → one issue even though the line repeats
  assert.equal(iss.filter((i) => i.kind === "config").length, 1)
})

// ── demuxStream: the □-tofu root cause ──────────────────────────────────────
check("demux: multiplexed frame → payload only (no 8-byte header bytes)", () => {
  // docker multiplexed header = 8 bytes: [streamType:1][pad:3][len:4 BE], then payload
  const frame = Buffer.concat([Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05]), Buffer.from("hello")])
  const out = demuxStream(frame)
  assert.equal(out, "hello", "demux must return only the payload, not the header")
})

check("demux: two frames concatenated → both payloads", () => {
  const f1 = Buffer.concat([Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]), Buffer.from("foo")])
  const f2 = Buffer.concat([Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]), Buffer.from("bar")])
  assert.equal(demuxStream(Buffer.concat([f1, f2])), "foobar")
})

check("demux: plain TTY buffer (no framing) → whole buffer is payload", () => {
  // a buffer shorter than 8 bytes can't be a frame → treated as plain text
  assert.equal(demuxStream(Buffer.from("hi")), "hi")
})

// ── sanitize: ANSI + control stripping, keep \t ─────────────────────────────
check("sanitize: strips CSI color + control, keeps text + \\t", () => {
  assert.equal(sanitize("\x1b[31mred\x1b[0m text\x00\x07"), "red text")
  assert.equal(sanitize("col1\tcol2\n"), "col1\tcol2\n")
  assert.equal(sanitize("\x1b]0;title\x07clean"), "clean") // OSC title stripped
})

console.log(`\n  ${n} checks passed ✓`)