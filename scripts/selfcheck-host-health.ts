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
import { redactSecretValue, normalizeCommitSha, REDACTED } from "../src/lib/sanitize-fields"
import { parseGitSource, isLikelyPublicHost, canonicalGitUrl } from "../src/lib/git-source"
import { detectStack, type DetectionInput } from "../src/lib/stack-detect"

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

// ── git-source: every form people actually paste ───────────────────────────
// Regression: the pipeline took its build context from the request body, which
// the Deploy button never sends, so it fell through to "." and every git deploy
// died with `lstat /app/Dockerfile: no such file or directory`.
check("parseGitSource: the common GitHub forms all resolve to one clone URL", () => {
  const expected = "https://github.com/owner/repo.git"
  for (const input of [
    "https://github.com/owner/repo",
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo/",
    "http://github.com/owner/repo",
    "git@github.com:owner/repo.git",
    "ssh://git@github.com/owner/repo.git",
    "github.com/owner/repo",
    "owner/repo",
    "  https://github.com/owner/repo  ",
  ]) {
    const got = parseGitSource(input)
    assert.ok(got, `should parse: ${input}`)
    assert.equal(got!.cloneUrl, expected, `wrong clone URL for ${input}`)
    assert.equal(got!.slug, "owner/repo")
  }
})

check("parseGitSource: web deep links carry the branch and subdirectory", () => {
  const branch = parseGitSource("https://github.com/owner/repo/tree/develop")
  assert.equal(branch!.ref, "develop")
  assert.equal(branch!.subdir, undefined)

  const sub = parseGitSource("https://github.com/owner/repo/tree/main/apps/web")
  assert.equal(sub!.ref, "main")
  assert.equal(sub!.subdir, "apps/web")

  // Docker's own `#ref` and `#ref:dir` conventions
  assert.equal(parseGitSource("https://github.com/owner/repo#v2")!.ref, "v2")
  const both = parseGitSource("https://github.com/owner/repo#main:services/api")
  assert.equal(both!.ref, "main")
  assert.equal(both!.subdir, "services/api")
})

check("parseGitSource: non-GitHub hosts keep their host", () => {
  assert.equal(parseGitSource("https://gitlab.com/g/p")!.cloneUrl, "https://gitlab.com/g/p.git")
  assert.equal(parseGitSource("git@bitbucket.org:t/r.git")!.host, "bitbucket.org")
  assert.equal(isLikelyPublicHost("github.com"), true)
  assert.equal(isLikelyPublicHost("git.internal.corp"), false)
})

check("parseGitSource: rejects what isn't a repository", () => {
  for (const bad of ["", "   ", "not a url", "https://github.com/owner", "ftp:"]) {
    assert.equal(parseGitSource(bad), null, `should reject: ${JSON.stringify(bad)}`)
  }
})

// ── stack-detect: a repo without a Dockerfile is still deployable ──────────
check("detectStack: a repo's own Dockerfile always wins and is never overwritten", () => {
  const d = detectStack({ files: ["Dockerfile", "package.json", "src"], packageJson: { scripts: { start: "node ." } } })
  assert.equal(d!.stack, "dockerfile")
  assert.equal(d!.dockerfile, null, "must not generate a Dockerfile over the repo's own")
})

check("detectStack: Next.js recognised by dependency or config file", () => {
  const byDep = detectStack({ files: ["package.json"], packageJson: { dependencies: { next: "15" } } })
  assert.equal(byDep!.stack, "nextjs")
  assert.equal(byDep!.port, 3000)
  assert.match(byDep!.dockerfile!, /EXPOSE 3000/)

  const byConfig = detectStack({ files: ["package.json", "next.config.ts"], packageJson: {} })
  assert.equal(byConfig!.stack, "nextjs")
})

check("detectStack: plain Node app uses its own start script", () => {
  const d = detectStack({ files: ["package.json"], packageJson: { scripts: { start: "node server.js" } } })
  assert.equal(d!.stack, "node")
  assert.match(d!.dockerfile!, /CMD \["npm", "run", "start"\]/)

  // falls back to serve, then dev, when there is no start
  const serve = detectStack({ files: ["package.json"], packageJson: { scripts: { serve: "x" } } })
  assert.match(serve!.dockerfile!, /"serve"/)
  const dev = detectStack({ files: ["package.json"], packageJson: { scripts: { dev: "x" } } })
  assert.match(dev!.dockerfile!, /"dev"/)
})

check("detectStack: package manager follows the committed lockfile", () => {
  const bun = detectStack({ files: ["package.json", "bun.lockb"], packageJson: { scripts: { start: "x" } } })
  assert.equal(bun!.stack, "bun")
  assert.match(bun!.dockerfile!, /oven\/bun/)

  const pnpm = detectStack({ files: ["package.json", "pnpm-lock.yaml"], packageJson: { scripts: { start: "x" } } })
  assert.match(pnpm!.dockerfile!, /pnpm install --frozen-lockfile/)

  const yarn = detectStack({ files: ["package.json", "yarn.lock"], packageJson: { scripts: { start: "x" } } })
  assert.match(yarn!.dockerfile!, /yarn install --frozen-lockfile/)

  // npm ci needs a lockfile; without one it must not be used
  const noLock = detectStack({ files: ["package.json"], packageJson: { scripts: { start: "x" } } })
  assert.match(noLock!.dockerfile!, /npm install/)
  assert.ok(!/npm ci/.test(noLock!.dockerfile!))
  const withLock = detectStack({ files: ["package.json", "package-lock.json"], packageJson: { scripts: { start: "x" } } })
  assert.match(withLock!.dockerfile!, /npm ci/)
})

check("detectStack: build-but-no-start is served as a static bundle", () => {
  const d = detectStack({ files: ["package.json"], packageJson: { scripts: { build: "vite build" } } })
  assert.equal(d!.stack, "static")
  assert.match(d!.dockerfile!, /nginx/)
})

check("detectStack: non-Node ecosystems by marker file", () => {
  const cases: Array<[string[], string, number]> = [
    [["requirements.txt", "main.py"], "python", 8000],
    [["pyproject.toml"], "python", 8000],
    [["go.mod", "main.go"], "go", 8080],
    [["Cargo.toml", "src"], "rust", 8080],
    [["Gemfile"], "ruby", 3000],
    [["composer.json"], "php", 80],
    [["index.html", "style.css"], "static", 80],
  ]
  for (const [files, stack, port] of cases) {
    const d = detectStack({ files })
    assert.ok(d, `should detect ${stack} from ${files.join(",")}`)
    assert.equal(d!.stack, stack)
    assert.equal(d!.port, port)
    assert.match(d!.dockerfile!, new RegExp(`EXPOSE ${port}`), `${stack} must EXPOSE ${port}`)
  }
})

check("detectStack: every generated Dockerfile exposes a port so it can be published", () => {
  const inputs: DetectionInput[] = [
    { files: ["package.json"], packageJson: { dependencies: { next: "15" } } },
    { files: ["package.json"], packageJson: { scripts: { start: "x" } } },
    { files: ["requirements.txt"] },
    { files: ["go.mod"] },
    { files: ["Gemfile"] },
    { files: ["index.html"] },
  ]
  for (const i of inputs) {
    const d = detectStack(i)
    assert.ok(d?.dockerfile, "expected a generated Dockerfile")
    assert.match(d!.dockerfile!, /^EXPOSE \d+$/m, `no EXPOSE in ${d!.stack} Dockerfile`)
  }
})

check("detectStack: unrecognised repo returns null rather than guessing", () => {
  assert.equal(detectStack({ files: ["README.md", "LICENSE"] }), null)
  assert.equal(detectStack({ files: [] }), null)
})

check("canonicalGitUrl: round-trips the ref and subdirectory a deep link carried", () => {
  // plain repo -> plain clone URL
  const plain = parseGitSource("https://github.com/owner/repo")!
  assert.equal(canonicalGitUrl(plain), "https://github.com/owner/repo.git")

  // a /tree/ deep link must not silently lose the branch or the subdirectory:
  // storing only the clone URL would build the default branch at the repo root
  const deep = parseGitSource("https://github.com/owner/repo/tree/dev/apps/api")!
  const canonical = canonicalGitUrl(deep)
  const reparsed = parseGitSource(canonical)!
  assert.equal(reparsed.cloneUrl, deep.cloneUrl)
  assert.equal(reparsed.ref, "dev")
  assert.equal(reparsed.subdir, "apps/api")

  // branch only
  const branchOnly = parseGitSource("https://github.com/owner/repo/tree/release")!
  assert.equal(parseGitSource(canonicalGitUrl(branchOnly))!.ref, "release")
})

console.log(`\n  ${n} checks passed ✓`)
