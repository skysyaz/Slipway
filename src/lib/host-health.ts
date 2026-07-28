/**
 * Host health — the single source of truth for the manager host's REAL state.
 *
 * Why this exists (the outage): the dashboard only watched its own in-memory
 * model, never the host. The disk gauge read "0 / 200 GB" while the device was
 * 100% full, because the old measurement ran a throwaway `alpine` container to
 * `df /host` — and creating that container WRITES to the docker data dir, which
 * is on the very filesystem that just filled up. So the measurement failed
 * exactly when it was needed most and fell back to the lying 0/200 defaults.
 * Postgres then crash-looped with ENOSPC, deploys failed, Traefik spewed ACME
 * errors, and the dashboard surfaced none of it.
 *
 * Root-cause fix: measure disk with `fs.statfsSync` on the host root bind-mounted
 * read-only into the manager (`/:/host:ro`). statfs is a syscall — it allocates
 * NOTHING, so it works when the disk is 100% full. We stat the mounts that
 * actually matter (host `/` + the docker data root) and report the WORST one,
 * because that is the one that crashes Postgres and deploys. We also watch
 * inodes (a full inode table produces ENOSPC too), scan container logs for the
 * "No space left on device" canary, and parse Traefik logs into structured
 * routing/TLS issues. One module, read by the overview banner, the disk gauges,
 * the deploy view, and the domains list.
 */
import { statfsSync } from "node:fs"
import type Docker from "dockerode"

const HEALTH_TTL = 30_000
let healthCache: { t: number; h: HostHealth } | null = null

export type DiskStatus = "ok" | "warn" | "critical" | "full"

export interface DiskMount {
  path: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usedPct: number
  inodesTotal: number
  inodesUsed: number
  inodePct: number
  status: DiskStatus
}

export interface EnospcHit {
  service: string
  message: string
}

export interface TraefikIssue {
  severity: "critical" | "error" | "warn"
  kind: "config" | "middleware" | "acme" | "watcher"
  domain?: string
  appSlug?: string
  message: string
  hint?: string
}

export interface HostHealth {
  agent: "up" | "down"
  mounts: DiskMount[]
  /** worst mount (highest usedPct) — what the disk gauges show */
  disk: { totalBytes: number; usedBytes: number; freeBytes: number; usedPct: number; status: DiskStatus }
  status: DiskStatus
  freeBytes: number
  inodesCritical: boolean
  enospc: EnospcHit[]
  traefik: TraefikIssue[]
}

const FREE_FLOOR_BYTES = 512 * 1024 * 1024 // < 512 MB free on any watched mount = FULL

function classify(usedPct: number, freeBytes: number, inodePct: number): DiskStatus {
  if (usedPct >= 100 || freeBytes < FREE_FLOOR_BYTES || inodePct >= 100) return "full"
  if (usedPct >= 90 || inodePct >= 90) return "critical"
  if (usedPct >= 80 || inodePct >= 80) return "warn"
  return "ok"
}

// statfs a host path (resolved under the /host bind). Returns null if the path
// is absent (e.g. the bind not yet mounted, or no separate docker FS).
function statMount(hostPath: string, label: string): DiskMount | null {
  try {
    const s = statfsSync(hostPath)
    const total = s.blocks * s.bsize
    const free = s.bfree * s.bsize
    const used = total - free
    const usedPct = total ? (used / total) * 100 : 0
    const inodesTotal = s.files
    const inodesUsed = s.files - s.ffree
    const inodePct = inodesTotal ? (inodesUsed / inodesTotal) * 100 : 0
    return {
      path: label,
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usedPct,
      inodesTotal,
      inodesUsed,
      inodePct,
      status: classify(usedPct, free, inodePct),
    }
  } catch {
    return null
  }
}

async function dockerRootDir(docker: Docker): Promise<string | null> {
  try {
    const info = await docker.info()
    return info.DockerRootDir || "/var/lib/docker"
  } catch {
    return null
  }
}

// ENOSPC canary: scan recent logs of running containers for the out-of-disk
// signature. This is the canary for the whole outage — Postgres prints it as it
// crash-loops, and a deploy prints it when clone/build can't write.
const ENOSPC_RE = /No space left on device|ENOSPC|disk I\/O error|PANIC:\s+could not write/i
async function scanEnospc(docker: Docker): Promise<EnospcHit[]> {
  const hits: EnospcHit[] = []
  const seen = new Set<string>()
  try {
    const since = Math.floor((Date.now() - 120_000) / 1000) // last 2 min
    const cs = await docker.listContainers({ all: false })
    for (const c of cs) {
      const name = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, "")
      try {
        const logs = await docker.getContainer(c.Id).logs({
          stdout: true,
          stderr: true,
          follow: false,
          tail: 40,
          since,
        })
        const text = demuxToString(logs)
        for (const line of text.split("\n").slice(-40)) {
          const clean = sanitize(line)
          if (ENOSPC_RE.test(clean)) {
            const key = name + clean.slice(0, 60)
            if (seen.has(key)) continue
            seen.add(key)
            hits.push({ service: name, message: clean.slice(0, 200) })
            if (hits.length >= 20) return hits
          }
        }
      } catch {
        /* a container may be mid-restart — skip */
      }
    }
  } catch {
    /* engine hiccup */
  }
  return hits
}

// ── Traefik log parsing (Bug 4) ──────────────────────────────────────────────
// Turn Traefik's log soup into structured, actionable issues. Regexes written
// against the real error classes from the outage.
const RE_CONFIG_FIELD = /field not found,?\s*node:\s*(\S+)/i
const RE_MISSING_MW = /middleware "([^"]+)" does not exist/i
// "Unable to obtain ACME certificate for domains ... : ... 403 unauthorized"
const RE_ACME = /unable to obtain .*?certificate.*?(?:for\s+(?:domains?\s+)?["'\[]?([^\s"'\]]+)["'\]]?)/i
const RE_HTTP_STATUS = /\b(40[0-9])\b/
const RE_CLOUDFLARE = /2606:4700/i
// watcher: `open /etc/dokploy/traefik/dynamic/app-<slug>-<id>.yml: no such file`
const RE_WATCHER = /open\s+"?([^"]*?\b(app-[^"\/\s]+\.yml))"?\s*:\s*no such file/i

function parseTraefikLogs(text: string): TraefikIssue[] {
  const out: TraefikIssue[] = []
  const seen = new Set<string>()
  const push = (iss: TraefikIssue) => {
    const key = iss.kind + "|" + (iss.domain || iss.appSlug || "") + "|" + iss.message.slice(0, 50)
    if (seen.has(key)) return
    seen.add(key)
    out.push(iss)
  }
  for (const raw of text.split("\n")) {
    const line = sanitize(raw)
    if (!line) continue

    let m = line.match(RE_CONFIG_FIELD)
    if (m) {
      push({
        severity: "error",
        kind: "config",
        message: `Unknown config key "${m[1]}" — Traefik version mismatch.`,
        hint: "Remove or correct it in the static config (the running Traefik doesn't recognise this field).",
      })
      continue
    }
    m = line.match(RE_MISSING_MW)
    if (m) {
      push({
        severity: "error",
        kind: "middleware",
        message: `Middleware "${m[1]}" is referenced by a router but not defined.`,
        hint: "Add the middleware definition, or remove the reference from the router.",
      })
      continue
    }
    if (/unable to obtain.*?certificate/i.test(line)) {
      const dm = line.match(RE_ACME)
      const domain = dm ? dm[1] : undefined
      const sm = line.match(RE_HTTP_STATUS)
      const cloudflare = RE_CLOUDFLARE.test(line)
      push({
        severity: "critical",
        kind: "acme",
        domain,
        message: `ACME certificate failed${domain ? ` for ${domain}` : ""}${sm ? ` (HTTP ${sm[1]})` : ""}.`,
        hint: cloudflare
          ? "Domain is proxied by Cloudflare — HTTP-01 won't work. Use DNS-01 or set the record to DNS-only (grey cloud)."
          : "Check the DNS A record + that port :80 reaches Traefik, then retry.",
      })
      continue
    }
    m = line.match(RE_WATCHER)
    if (m) {
      const file = m[2]
      const sm2 = file.match(/^app-(.+)-([^-]+)\.yml$/)
      push({
        severity: "warn",
        kind: "watcher",
        appSlug: sm2 ? sm2[1] : file,
        message: `Routing config ${file} is missing — the dynamic-config watcher can't open it.`,
        hint: "Often disk-full or a rolled-back deploy. Re-deploy the app after freeing space.",
      })
      continue
    }
  }
  return out
}

async function scanTraefik(docker: Docker): Promise<TraefikIssue[]> {
  try {
    const cs = await docker.listContainers({ all: false })
    const traefik = cs.find((c) => (c.Names?.[0] || "").toLowerCase().includes("traefik"))
    if (!traefik) return []
    const since = Math.floor((Date.now() - 600_000) / 1000) // last 10 min
    const logs = await docker.getContainer(traefik.Id).logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail: 400,
      since,
    })
    return parseTraefikLogs(demuxToString(logs))
  } catch {
    return []
  }
}

// ── dockerode multiplexed-stream demux ───────────────────────────────────────
// dockerode .logs() with stdout+stderr returns a multiplexed stream: an 8-byte
// header per frame [type:1][len:4 BE][payload]. Decoding that header as UTF-8 is
// exactly the □□□□ tofu in the log viewer. Shared here so both the health scan
// and the live log stream demux the same way.
export function demuxStream(input: Buffer): string {
  const parts: string[] = []
  let off = 0
  while (off + 8 <= input.length) {
    const len = input.readUInt32BE(off + 4)
    if (off + 8 + len > input.length) break // incomplete frame
    parts.push(input.subarray(off + 8, off + 8 + len).toString("utf8"))
    off += 8 + len
  }
  // leftover bytes that aren't a full frame: best-effort append (TTY streams have
  // no framing — the whole buffer is payload)
  if (off === 0 && input.length) return input.toString("utf8")
  return parts.join("")
}

// TTY=true logs are a plain Buffer; non-TTY logs are multiplexed. Try demux; if
// it produced nothing but the buffer has data, treat as plain.
export function demuxToString(buf: Buffer): string {
  const demuxed = demuxStream(buf)
  if (demuxed) return demuxed
  return buf.toString("utf8")
}

// ANSI + non-printable sanitizer (shared with the live log stream).
const ANSI = [
  /\x1b\[[0-9;?]*[a-zA-Z]/g,
  /\x1b\][^\x07]*(\x07|\x1b\\)/g,
  /\x1b[=>]/g,
  /\x1b[NOPDEHM78]/g,
]
const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
export function sanitize(s: string): string {
  let out = s
  for (const re of ANSI) out = out.replace(re, "")
  return out.replace(CTRL, "")
}

// ── public API ───────────────────────────────────────────────────────────────
export async function getHostHealth(): Promise<HostHealth> {
  if (healthCache && Date.now() - healthCache.t < HEALTH_TTL) return healthCache.h

  let docker: Docker | null = null
  try {
    const { dockerClient, isDockerAvailable } = await import("./docker")
    if (await isDockerAvailable()) docker = dockerClient() ?? null
  } catch {
    docker = null
  }

  const mounts: DiskMount[] = []
  // Host root — always watched. Under the /host bind; falls back to container /.
  const root = statMount("/host", "/") ?? statMount("/", "/")
  if (root) mounts.push(root)
  // Docker data dir — the FS that fills up and crashes Postgres/deploys.
  if (docker) {
    const drd = await dockerRootDir(docker)
    if (drd) {
      const dm = statMount(`/host${drd}`, drd) ?? statMount(drd, drd)
      if (dm) {
        // dedup: docker root often on the same FS as / → skip if identical
        const dup = mounts.find((m) => m.totalBytes === dm.totalBytes && m.freeBytes === dm.freeBytes)
        if (!dup) mounts.push(dm)
      }
    }
  }

  // worst mount = the fullest one; that's what the gauge + banner reflect.
  const worst = mounts.reduce<DiskMount | null>(
    (acc, m) => (acc === null || m.usedPct > acc.usedPct ? m : acc),
    null,
  )

  const enospc = docker ? await scanEnospc(docker) : []
  const traefik = docker ? await scanTraefik(docker) : []

  let status: DiskStatus = worst?.status ?? "ok"
  const inodesCritical = mounts.some((m) => m.inodePct >= 90)
  // ENOSPC canary overrides to full regardless of the statfs reading (the FS
  // can be 99% with a process already hitting ENOSPC on a specific write).
  if (enospc.length && status !== "full") status = "critical"
  const freeBytes = mounts.reduce((min, m) => Math.min(min, m.freeBytes), Infinity)

  const h: HostHealth = {
    agent: docker ? "up" : "down",
    mounts,
    disk: worst
      ? { totalBytes: worst.totalBytes, usedBytes: worst.usedBytes, freeBytes: worst.freeBytes, usedPct: worst.usedPct, status }
      : { totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPct: 0, status: "ok" },
    status,
    freeBytes: Number.isFinite(freeBytes) ? freeBytes : 0,
    inodesCritical,
    enospc,
    traefik,
  }
  healthCache = { t: Date.now(), h }
  return h
}

// ponytail: ONE bytes→GB helper (decimal) shared by storage page, per-server
// disk, cluster card, and the health banner — so all four agree.
export function bytesToGb(bytes: number): number {
  return bytes / 1e9
}

// Convenience for the existing /api/servers + /api/storage/host callers: the
// worst mount's bytes, so the per-server / cluster gauges reflect the FS that
// actually crashes things. Replaces the old alpine-df getHostDisk.
export async function getHostDiskUsage(): Promise<{ totalBytes: number; usedBytes: number } | null> {
  try {
    const h = await getHostHealth()
    if (!h.mounts.length) return null
    return { totalBytes: h.disk.totalBytes, usedBytes: h.disk.usedBytes }
  } catch {
    return null
  }
}

// Map a failing deploy's stderr/error to a human cause + action. Used by the
// deploy pipeline (docker-ops) and surfaced in the deploy view (Bug 3).
export interface DeployCause {
  cause: string
  action: string
}
export function diagnoseDeployError(text: string): DeployCause | null {
  const t = text || ""
  if (/No space left on device|ENOSPC/i.test(t))
    return {
      cause: "Host disk is full — clone/build could not write.",
      action: "Free space on the host (see the Disk panel), then retry the deploy.",
    }
  if (/context canceled|EOF/i.test(t))
    return {
      cause: "The Docker daemon was restarting or starved mid-op.",
      action: "Retry; if it persists, check agent/engine health in the Routing panel.",
    }
  if (/\b401\b|\b403\b|Authentication failed|could not read Username/i.test(t))
    return {
      cause: "Clone failed — the repo is private or the token is stale/mismatched.",
      action: "Confirm the repo is public as marked, or add a valid access token.",
    }
  if (/no such file or directory.*?\.ya?ml|dynamic.*?config/i.test(t))
    return {
      cause: "Routing config for this app was not written (often disk-full or a rolled-back deploy).",
      action: "Re-deploy after freeing space; the Traefik dynamic file will be regenerated.",
    }
  return null
}