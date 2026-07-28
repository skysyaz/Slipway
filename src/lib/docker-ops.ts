/**
 * Real Docker orchestration (dockerode).
 *
 * Active when `isDockerAvailable()` is true. Creates the same DB records the
 * simulation does (Deployment + DeploymentStep, notifications, project status),
 * so the dashboard is identical whether the engine is up or down. The ops
 * layer (src/lib/ops.ts) falls back to src/lib/simulate.ts when the engine is
 * unavailable or a real op throws.
 *
 * Scope (honest):
 *  - image source: pull + run (the common case, incl. the seeded whoami demo).
 *  - git source: shallow-clone the public repo into SLIPWAY_DATA_DIR/builds,
 *    detect/generate a Dockerfile, then `tar | docker build -` so a
 *    containerized Slipway can feed context to the host daemon over the
 *    socket (a plain `docker build /container/path` would look for that path
 *    on the HOST and fail with "lstat …/Dockerfile: no such file").
 *  - folder source: same build path against a readable folderPath.
 *  - compose source: `docker compose up -d` via CLI (compose file must be a
 *    path the host docker daemon can read).
 *  - restart/stop/remove/scale: real container lifecycle.
 *  - backup: volume → tar via a helper container; DB → dump via helper.
 *
 * Single-node only (the manager host's Docker socket). Multi-node SSH join is
 * Phase 3 (src/lib/cluster.ts).
 */
import type Docker from "dockerode"
import { randomBytes } from "node:crypto"
import { db } from "./db"
import { emit, recordActivity } from "./notify"
import { diagnoseDeployError, demuxToString } from "./host-health"
import { normalizeCommitSha } from "./sanitize-fields"
import {
  backupSlug,
  shq,
  parseSizeMarker,
  dumpCommandFor,
  backupExtension,
} from "./backup-format"
import {
  normalizeGitSource,
  detectStackFromFiles,
  refineNodeStack,
  findDockerfile,
  generateDockerfile,
  parseExposePort,
  defaultPortFor,
  type DetectedStack,
} from "./git-deploy"
import { encryptSecret, decryptSecret } from "./security"
import type { DeployOptions } from "./simulate"

const STAGES = [
  "queued",
  "checkout",
  "detect",
  "install",
  "build",
  "test",
  "image",
  "push",
  "release",
  "verify",
  "live",
] as const

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  checkout: "Checkout",
  detect: "Detect stack",
  install: "Install deps",
  build: "Build",
  test: "Tests",
  image: "Build image",
  push: "Push image",
  release: "Release",
  verify: "Health check",
  live: "Live",
}

// ponytail: NO invented commit SHAs. Every deployment used to be stamped with
// `Math.random().toString(16)` — a seven-character hex string the dashboard
// displayed as the git commit and the rollback dialog quoted back as "This will
// redeploy commit a3f9c21". For an image deploy there is no commit at all, and
// for a git build (`docker build <url>`) Slipway never learns the resolved SHA.
// normalizeCommitSha() keeps a real object id and discards anything else, so
// the column stays empty and the UI renders "—". See src/lib/sanitize-fields.ts.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getDocker(): Promise<Docker> {
  const { dockerClient, isDockerAvailable } = await import("./docker")
  if (!(await isDockerAvailable())) throw new Error("Docker engine unavailable")
  const c = dockerClient()
  if (!c) throw new Error("Docker client not initialized")
  return c
}

// ─────────────────────────────────────────────────────────────────────────────
// Host disk measurement now lives in src/lib/host-health.ts (fs.statfsSync on
// the /host bind). The old code here ran a throwaway `alpine` container to
// `df /host` — and CREATING that container writes to the docker data dir, which
// is on the very FS that fills up, so the measurement failed exactly when the
// disk was full and fell back to the lying 0/200 defaults (the outage). statfs
// is a syscall that allocates nothing, so it works at 100% full. Re-exported
// here so existing callers (servers/storage routes) keep working through ONE
// source of truth.
// ─────────────────────────────────────────────────────────────────────────────
import { bytesToGb, getHostDiskUsage } from "./host-health"
export { bytesToGb, getHostDiskUsage }

// ponytail: per-volume used bytes via `du`. `docker.df()` returns Volumes[].Size
// as `undefined` on most Docker installs (the CLI `docker system df -v` shows
// sizes, but the API does not) — so the storage dashboard showed "0 MB used" for
// every volume. Fallback: spawn ONE throwaway alpine with the requested volumes
// bind-mounted read-only at /vol/<name> and `du -sb` each. Per-volume cache
// (60s) so the dashboard poll doesn't fork a container each tick; only the
// stale subset is re-measured. Ceiling: du walks the whole volume each TTL tick
// — fine for self-host scale; if a volume holds millions of inodes, raise
// VOL_SIZE_TTL or switch to a daemon sidecar.
// R8: bounded LRU cache — the dashboard polls this on a timer and volume names
// are unbounded (scanned hosts can have hundreds). Cap entries and evict the
// least-recently-used on insert so memory stays flat.
const VOL_SIZE_CAP = 512
const volSizeCache = new Map<string, { t: number; bytes: number }>()
const VOL_SIZE_TTL = 60_000

function volSizeSet(name: string, bytes: number, t: number): void {
  // LRU: refresh recency on hit, evict oldest when over cap.
  if (volSizeCache.has(name)) volSizeCache.delete(name)
  volSizeCache.set(name, { t, bytes })
  if (volSizeCache.size > VOL_SIZE_CAP) {
    const oldest = volSizeCache.keys().next().value
    if (oldest !== undefined) volSizeCache.delete(oldest)
  }
}

async function getVolumeSizes(docker: Docker, names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (names.length === 0) return out
  const now = Date.now()
  // only re-measure volumes whose cached size is stale; serve the rest from cache
  const stale = names.filter((n) => {
    const c = volSizeCache.get(n)
    return !c || now - c.t > VOL_SIZE_TTL
  })
  if (stale.length) {
    try {
      const binds = stale.map((n) => `${n}:/vol/${n}:ro`)
      const make = () =>
        docker.createContainer({
          Image: "alpine:latest",
          // busybox du -sb prints "<bytes>\t<path>"; mount each volume at /vol/<name>
          Cmd: ["sh", "-c", "for d in /vol/*; do [ -d \"$d\" ] && du -sb \"$d\" 2>/dev/null; done"],
          Tty: true,
          // NOT AutoRemove — we must read logs AFTER exit, then remove ourselves
          HostConfig: { Binds: binds },
        })
      let c: Docker.Container
      try {
        c = await make()
      } catch {
        await pullImage(docker, "alpine:latest")
        c = await make()
      }
      // R8: release the helper container in a finally — a throw between start()
      // and the old bottom-of-block remove() (or a kill mid-wait) left the
      // labeled helper running. The label lets the reaper sweep any orphan too.
      try {
        await c.start()
        // ponytail: MUST wait for du to finish before reading logs. A 5 GB volume
        // takes seconds to walk; without wait, logs({follow:false}) returns the
        // (still empty) buffer and every volume reads 0 — the real bug behind
        // "storage shows 0 MB".
        await c.wait()
        const logs = await c.logs({ stdout: true, stderr: false, follow: false })
        const text = logs.toString("utf8")
        for (const line of text.split("\n")) {
          const m = line.match(/^(\d+)\s+\/vol\/(.+)/)
          if (m) {
            volSizeSet(m[2], Number(m[1]), now)
            out.set(m[2], Number(m[1]))
          }
        }
      } finally {
        await c.remove({ force: true }).catch((e) => {
          console.warn("[docker-ops] volume-size helper remove failed:", (e as Error).message)
        })
      }
    } catch {
      /* du not supported / unavailable — leave df values */
    }
  }
  for (const n of names) {
    const c = volSizeCache.get(n)
    if (c) out.set(n, c.bytes)
  }
  return out
}

// ponytail: volumeNames limits the (expensive) per-volume sizing to the volumes
// the caller actually tracks. The Storage view passes the tracked docker volume
// names; /api/storage/host passes none and skips sizing entirely (it only needs
// the host disk). This avoids `du`-walking a 5 GB unrelated volume every TTL.
export async function getStorageSnapshot(opts?: {
  volumeNames?: string[]
}): Promise<{
  volumes: Map<string, { usedBytes: number; mountpoint: string }>
  mounts: Map<string, string[]>
  host: { totalBytes: number; usedBytes: number } | null
}> {
  const { isDockerAvailable } = await import("./docker")
  if (!(await isDockerAvailable())) {
    return { volumes: new Map(), mounts: new Map(), host: null }
  }
  const docker = await getDocker().catch(() => null)
  if (!docker) return { volumes: new Map(), mounts: new Map(), host: null }

  const names = (opts?.volumeNames ?? []).filter(Boolean)
  const nameSet = new Set(names)
  const volumes = new Map<string, { usedBytes: number; mountpoint: string }>()

  if (names.length) {
    // df is cheap — try it first, keep Size where the API actually populates it
    try {
      const df = (await docker.df()) as { Volumes?: { Name?: string; Size?: number; Mountpoint?: string }[] }
      for (const n of names) {
        const v = (df.Volumes || []).find((x) => x.Name === n)
        volumes.set(n, { usedBytes: Number(v?.Size) || 0, mountpoint: v?.Mountpoint || "" })
      }
    } catch {
      for (const n of names) volumes.set(n, { usedBytes: 0, mountpoint: "" })
    }
    // ponytail: df returns Size=undefined on most installs — fill the zeros with
    // a real `du`. Only the tracked, unsized volumes are walked.
    const unsized = names.filter((n) => !volumes.get(n)!.usedBytes)
    if (unsized.length) {
      const du = await getVolumeSizes(docker, unsized)
      for (const n of unsized) {
        const bytes = du.get(n)
        if (bytes) volumes.set(n, { usedBytes: bytes, mountpoint: volumes.get(n)!.mountpoint })
      }
    }
  }

  // in-container mount destinations per tracked volume (from container Mounts)
  const mounts = new Map<string, string[]>()
  if (names.length) {
    try {
      const list = await docker.listContainers({ all: true })
      for (const c of list) {
        for (const m of c.Mounts || []) {
          if (m.Name && nameSet.has(m.Name)) {
            const arr = mounts.get(m.Name) || []
            if (m.Destination && !arr.includes(m.Destination)) arr.push(m.Destination)
            mounts.set(m.Name, arr)
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const host = await getHostDiskUsage()
  return { volumes, mounts, host }
}

/** Pull an image, resolving on completion. */
async function pullImage(docker: Docker, image: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err)
      docker.modem.followProgress(
        stream,
        (e: Error | null) => (e ? reject(e) : resolve()),
        // onProgress — intentionally a no-op; progress surfaces via steps
        () => {}
      )
    })
  })
}

function containerName(projectSlug: string, suffix: string): string {
  return `slipway-${projectSlug}-${suffix}`.replace(/[^a-z0-9-]/g, "")
}

/**
 * The container configuration Slipway derives from a Project row: environment
 * variables scoped to the project's environment, the start command, and the
 * resource limits.
 *
 * ONE source of truth shared by the deploy pipeline (which creates the
 * container) and realReconcile (which recreates it). They disagreed before:
 * reconcile applied env/limits/cmd, deploy applied none of them, so a project's
 * configuration silently depended on which action you had run last.
 */
async function containerConfigFor(projectId: string): Promise<{
  Env: string[]
  Cmd?: string[]
  Memory?: number
  NanoCpus?: number
}> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { envVars: true },
  })
  if (!project) return { Env: [] }
  const Env = project.envVars
    .filter((e) => e.scope === "all" || e.scope === project.environment)
    .map((e) => `${e.key}=${e.value}`)
  const Cmd = project.startCmd ? project.startCmd.split(/\s+/).filter(Boolean) : undefined
  return {
    Env,
    ...(Cmd && Cmd.length ? { Cmd } : {}),
    ...(project.memoryMb ? { Memory: project.memoryMb * 1024 * 1024 } : {}),
    ...(project.cpuMilli ? { NanoCpus: Math.round((project.cpuMilli / 1000) * 1e9) } : {}),
  }
}

async function setStep(deploymentId: string, order: number, status: string) {
  await db.deploymentStep.updateMany({
    where: { deploymentId, order },
    data: {
      status,
      ...(status === "building" ? { startedAt: new Date() } : {}),
      ...(status === "healthy" || status === "failed"
        ? { finishedAt: new Date() }
        : {}),
    },
  })
}

export async function realDeploy(
  projectId: string,
  opts: DeployOptions,
  actor = "you"
): Promise<string> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error("Project not found")

  const source = opts.source || project.source
  const isImageSource = source === "image" || (source === "git" && !project.repoUrl && !!project.dockerImage)
  const image = project.dockerImage || opts.repoUrl || ""
  if (isImageSource && !image) throw new Error("No image to deploy")

  // Resolve branch before creating the deployment row so the UI shows the real
  // ref being built (redeploy used to always stamp "main").
  let branch = opts.branch
  if (!branch && source === "git") {
    const last = await db.deployment.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { branch: true },
    })
    branch = last?.branch || "main"
  }
  branch = branch || "main"

  // Always record the deploy attempt — a failed deploy still shows in the list.
  const steps = STAGES.map((stage, i) => ({
    stage,
    label: STAGE_LABEL[stage],
    status: i === 0 ? "healthy" : "queued",
    order: i,
    logLines: 0,
    durationMs: null,
    startedAt: i === 0 ? new Date() : null,
    finishedAt: i === 0 ? new Date() : null,
  }))
  const deployment = await db.deployment.create({
    data: {
      projectId,
      commitSha: normalizeCommitSha((opts as { commitSha?: string }).commitSha),
      commitMessage: opts.commitMessage || "Manual deploy from dashboard",
      branch,
      author: actor,
      environment: opts.environment || project.environment,
      status: "building",
      steps: { create: steps },
    },
  })
  await db.project.update({ where: { id: projectId }, data: { status: "restarting" } })
  await recordActivity("deploy", `triggered deployment of ${project.name}`, { projectId, actor })

  // Drive the real pipeline in the background; acquires Docker inside.
  // ponytail: the Deploy button only POSTs `{ projectId }`. Request opts used
  // to be the sole source of folderPath/repoUrl/composePath, so a re-deploy
  // of a git/folder project built "." and a compose project used /dev/null.
  // Prefer request overrides, fall back to the persisted project row.
  const effectiveOpts: DeployOptions = {
    ...opts,
    source: opts.source || project.source,
    repoUrl: opts.repoUrl || project.repoUrl || undefined,
    folderPath: opts.folderPath || project.folderPath || undefined,
    composePath: opts.composePath || project.composePath || undefined,
    environment: opts.environment || project.environment,
    buildCmd: opts.buildCmd || project.buildCmd || undefined,
    startCmd: opts.startCmd || project.startCmd || undefined,
    branch,
  }
  runPipeline(deployment.id, projectId, project.slug, project.name, {
    isImageSource,
    image,
    source,
    opts: effectiveOpts,
    actor,
  }).catch((e) => console.error("[docker-ops] deploy pipeline failed:", e))

  return deployment.id
}

async function runPipeline(
  deploymentId: string,
  projectId: string,
  projectSlug: string,
  projectName: string,
  ctx: {
    isImageSource: boolean
    image: string
    source?: string
    opts: DeployOptions
    actor: string
  }
) {
  // ponytail: REAL step durations. `finish()` used to write
  // `1000 + Math.random() * 3000` — a fabricated number the UI then presented
  // as the step's measured time, which is exactly the invented data this
  // codebase refuses to ship elsewhere. We now time each step from the moment
  // it flips to "building".
  const startedAt = new Map<number, number>()
  const begin = async (order: number) => {
    startedAt.set(order, Date.now())
    await setStep(deploymentId, order, "building")
  }
  const finish = async (order: number) => {
    const t0 = startedAt.get(order)
    await setStep(deploymentId, order, "healthy")
    await db.deploymentStep.updateMany({
      where: { deploymentId, order },
      data: { durationMs: t0 !== undefined ? Date.now() - t0 : null },
    })
  }
  const pipelineStart = Date.now()

  try {
    const docker = await getDocker()
    let failingOrder = 0 // ponytail: track which step threw so its log tail is persisted (Bug 3)
    const failStep = async (order: number, log: string) => {
      failingOrder = order
      await db.deploymentStep.updateMany({
        where: { deploymentId, order },
        data: { status: "failed", finishedAt: new Date(), log: log.slice(-1200) || null },
      })
    }
    /** Mark a stage done without claiming real work ran. */
    const skip = async (order: number, reason: string) => {
      startedAt.set(order, Date.now())
      await setStep(deploymentId, order, "building")
      await db.deploymentStep.updateMany({
        where: { deploymentId, order },
        data: {
          status: "healthy",
          finishedAt: new Date(),
          durationMs: 0,
          log: reason.slice(0, 500),
        },
      })
    }

    let image = ctx.image
    let appPort: number | null = null
    let buildDir: string | null = null

    try {
      if (ctx.isImageSource) {
        await skip(1, "skipped — image source has no repository to check out")
        await skip(2, "skipped — image source")
        await skip(3, "skipped — image already built upstream")
        await skip(4, "skipped — image source")
        await skip(5, "skipped — no test stage for image deploys")
        await begin(6)
        await pullImage(docker, image)
        await finish(6)
        await skip(7, "skipped — local Docker engine, no registry push")
      } else if (ctx.source === "compose") {
        const composeFile = String(ctx.opts.composePath || "")
        if (!composeFile || composeFile === "/dev/null") {
          await failStep(1, "No compose file path on this project.")
          throw new Error(
            "Compose deploy needs a composePath on the project (e.g. /path/to/docker-compose.yml on the host)."
          )
        }
        await begin(1)
        await runCli(["compose", "-f", composeFile, "config", "-q"])
        await finish(1)
        await skip(2, "skipped — compose file defines the stack")
        await skip(3, "skipped — compose build installs deps")
        await skip(4, "skipped — compose build handles compilation")
        await skip(5, "skipped — no separate test stage")
        await begin(6)
        await runCli(["compose", "-f", composeFile, "build"])
        await finish(6)
        image = ""
        await skip(7, "skipped — compose manages its own images")
      } else if (ctx.source === "git" || (!ctx.source && ctx.opts.repoUrl)) {
        // ── public git repo deploy ──────────────────────────────────────
        const git = normalizeGitSource(
          String(ctx.opts.repoUrl || ""),
          String(ctx.opts.branch || "main"),
          ""
        )
        if (!git) {
          await failStep(
            1,
            `Not a usable git URL: "${ctx.opts.repoUrl || ""}". Use github.com/org/repo or a full https:// URL.`
          )
          throw new Error(
            `Not a usable git URL: "${ctx.opts.repoUrl || ""}". Example: github.com/org/repo`
          )
        }

        // checkout
        await begin(1)
        buildDir = await clonePublicRepo(git.cloneUrl, git.branch, deploymentId)
        const workDir = git.subdir ? `${buildDir}/${git.subdir}` : buildDir
        const { access } = await import("node:fs/promises")
        try {
          await access(workDir)
        } catch {
          await failStep(1, `subdir "${git.subdir}" not found after clone`)
          throw new Error(`Repository cloned, but subdir "${git.subdir}" does not exist.`)
        }
        const sha = await gitRevParse(buildDir)
        if (sha) {
          await db.deployment.update({
            where: { id: deploymentId },
            data: { commitSha: sha, branch: git.branch },
          })
        }
        await finish(1)

        // detect stack + ensure Dockerfile
        await begin(2)
        const files = await listCheckoutFiles(workDir)
        let stack: DetectedStack = detectStackFromFiles(files)
        if (stack === "node") {
          const pkg = await readTextFile(`${workDir}/package.json`)
          stack = refineNodeStack(pkg)
        }
        let dfName = findDockerfile(files)
        let dfText = dfName ? (await readTextFile(`${workDir}/${dfName}`)) || "" : ""
        if (!dfName) {
          const generated = generateDockerfile({
            stack,
            buildCmd: ctx.opts.buildCmd,
            startCmd: ctx.opts.startCmd,
          })
          if (!generated) {
            await failStep(
              2,
              `No Dockerfile in the repo and Slipway cannot auto-generate one for stack "${stack}". Add a Dockerfile to the repository root.`
            )
            throw new Error(
              `No Dockerfile found in ${git.owner}/${git.repo} and stack "${stack}" is not auto-buildable. Add a Dockerfile and redeploy.`
            )
          }
          const { writeFile } = await import("node:fs/promises")
          await writeFile(`${workDir}/Dockerfile`, generated, "utf8")
          dfName = "Dockerfile"
          dfText = generated
          await db.deploymentStep.updateMany({
            where: { deploymentId, order: 2 },
            data: {
              log: `Detected ${stack}; generated Dockerfile (repo had none).`,
            },
          })
        }
        appPort = parseExposePort(dfText) || defaultPortFor(stack)
        await db.project.update({
          where: { id: projectId },
          data: {
            stack,
            stackLabel: stackLabelFor(stack),
            repoUrl: `https://${git.host}/${git.owner}/${git.repo}`,
          },
        })
        await finish(2)

        await skip(3, "skipped — dependency install happens inside the image build")
        await skip(4, "skipped — application build happens inside the image build")
        await skip(5, "skipped — Slipway does not run a test stage yet")

        // build image — stream context via stdin so a containerized Slipway
        // can build without the daemon seeing the container's filesystem paths
        await begin(6)
        const versionTag = `slipway-${projectSlug}:${deploymentId.slice(-8)}`
        const latestTag = `slipway-${projectSlug}:latest`
        try {
          await dockerBuildFromDir(workDir, dfName, [versionTag, latestTag])
          image = versionTag
          await finish(6)
        } catch (be) {
          const tail = ((be as Error & { stderr?: string }).stderr || (be as Error).message || "").trim()
          await failStep(6, tail)
          throw be
        }
        await skip(7, "skipped — local Docker engine, no registry push")
      } else if (ctx.source === "folder" || ctx.opts.folderPath) {
        const folder = String(ctx.opts.folderPath || "")
        if (!folder) {
          await failStep(1, "No folderPath on this project.")
          throw new Error("Folder deploy needs a folderPath that exists on the Slipway host/container.")
        }
        await begin(1)
        const { access } = await import("node:fs/promises")
        try {
          await access(folder)
        } catch {
          await failStep(1, `folder "${folder}" is not readable from Slipway`)
          throw new Error(
            `Folder "${folder}" is not readable. Inside the Slipway container only paths under the data volume (or a host bind-mount) work.`
          )
        }
        await finish(1)

        await begin(2)
        const files = await listCheckoutFiles(folder)
        let stack: DetectedStack = detectStackFromFiles(files)
        if (stack === "node") {
          stack = refineNodeStack(await readTextFile(`${folder}/package.json`))
        }
        let dfName = findDockerfile(files)
        let dfText = dfName ? (await readTextFile(`${folder}/${dfName}`)) || "" : ""
        if (!dfName) {
          const generated = generateDockerfile({
            stack,
            buildCmd: ctx.opts.buildCmd,
            startCmd: ctx.opts.startCmd,
          })
          if (!generated) {
            await failStep(2, `No Dockerfile in ${folder} and stack "${stack}" is not auto-buildable.`)
            throw new Error(`No Dockerfile in ${folder}. Add one or use a supported stack.`)
          }
          const { writeFile } = await import("node:fs/promises")
          await writeFile(`${folder}/Dockerfile`, generated, "utf8")
          dfName = "Dockerfile"
          dfText = generated
        }
        appPort = parseExposePort(dfText) || defaultPortFor(stack)
        await finish(2)

        await skip(3, "skipped — dependency install happens inside the image build")
        await skip(4, "skipped — application build happens inside the image build")
        await skip(5, "skipped — Slipway does not run a test stage yet")

        await begin(6)
        const versionTag = `slipway-${projectSlug}:${deploymentId.slice(-8)}`
        const latestTag = `slipway-${projectSlug}:latest`
        try {
          await dockerBuildFromDir(folder, dfName, [versionTag, latestTag])
          image = versionTag
          await finish(6)
        } catch (be) {
          const tail = ((be as Error & { stderr?: string }).stderr || (be as Error).message || "").trim()
          await failStep(6, tail)
          throw be
        }
        await skip(7, "skipped — local Docker engine, no registry push")
      } else {
        await failStep(
          1,
          `Nothing to deploy — source="${ctx.source || ""}" has no repoUrl/folderPath/image.`
        )
        throw new Error(
          `Project has source "${ctx.source || "unknown"}" but no repo URL, folder path, or image to deploy.`
        )
      }

      // release: run the container
      await begin(8)
      let containerId: string | null = null
      if (ctx.source === "compose") {
        try {
          await runCli(["compose", "-f", String(ctx.opts.composePath), "up", "-d"])
        } catch (ce) {
          await failStep(8, ((ce as Error & { stderr?: string }).stderr || (ce as Error).message || "").trim())
          throw ce
        }
      } else {
        const name = containerName(projectSlug, "app")
        try {
          const old = docker.getContainer(name)
          await old.remove({ force: true })
        } catch {
          /* ignore */
        }
        try {
          const cfg = await containerConfigFor(projectId)
          const exposedPort = appPort || 3000
          const hostPort = await pickFreePort(docker, exposedPort)
          const created = await docker.createContainer({
            Image: image,
            name,
            Env: cfg.Env,
            ...(cfg.Cmd ? { Cmd: cfg.Cmd } : {}),
            ExposedPorts: { [`${exposedPort}/tcp`]: {} },
            HostConfig: {
              RestartPolicy: { Name: "unless-stopped" },
              PortBindings: {
                [`${exposedPort}/tcp`]: [{ HostPort: String(hostPort) }],
              },
              ...(cfg.Memory ? { Memory: cfg.Memory } : {}),
              ...(cfg.NanoCpus ? { NanoCpus: cfg.NanoCpus } : {}),
            },
          })
          await created.start()
          containerId = created.id
          const publicHost =
            process.env.SLIPWAY_PUBLIC_HOST?.trim() || "localhost"
          const url = `http://${publicHost}:${hostPort}`
          await db.project.update({
            where: { id: projectId },
            data: { url },
          })
          // Ensure there is at least one app service row reflecting the live port
          const appServices = await db.service.count({ where: { projectId, kind: "app" } })
          if (appServices === 0) {
            await db.service.create({
              data: {
                projectId,
                name: "app",
                kind: "app",
                status: "running",
                image: image || "",
                port: hostPort,
                replicas: 1,
                memoryMb: 512,
                cpuMilli: 400,
                dockerContainerId: containerId,
              },
            })
          } else {
            await db.service.updateMany({
              where: { projectId, kind: "app" },
              data: { port: hostPort },
            })
          }
        } catch (re) {
          await failStep(8, ((re as Error).message || "").trim())
          throw re
        }
      }
      await finish(8)

      // verify: container is running
      await begin(9)
      if (containerId) {
        // ponytail: same settle window as DB provision — Next.js / Node apps
        // often bind a moment after start(); inspecting immediately falsely
        // reported crash-loops that were still booting.
        await sleep(2500)
        const c = docker.getContainer(containerId)
        const info = await c.inspect()
        const running = info.State?.Running === true
        if (!running) {
          const tail = await c
            .logs({ stdout: true, stderr: true, follow: false })
            .then((b) => demuxToString(b).slice(-1200))
            .catch(() => "")
          await failStep(9, tail)
          throw new Error("container exited after start")
        }
        await db.project.update({
          where: { id: projectId },
          data: { dockerContainerId: containerId, dockerImage: image || undefined },
        })
        await db.service.updateMany({
          where: { projectId },
          data: { dockerContainerId: containerId, status: "running" },
        })
      }
      await finish(9)

      // live
      await begin(10)
      await finish(10)

      await db.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "healthy",
          finishedAt: new Date(),
          durationMs: Date.now() - pipelineStart,
          image: image || null,
        },
      })
      await db.project.update({
        where: { id: projectId },
        data: { status: "running", lastDeployedAt: new Date(), monthlyDeploys: { increment: 1 } },
      })
      await emit(
        "deploy.success",
        "deploy",
        `deployed ${projectName} to ${ctx.opts.environment || "production"}`,
        { title: "Deployment complete", body: `${projectName} is live via Docker.`, level: "success", kind: "deploy" },
        { projectId, actor: ctx.actor }
      )
    } finally {
      if (buildDir) await rmBuildDir(buildDir)
    }
  } catch (e) {
    // ponytail: diagnose the REAL cause from the captured stderr/error and
    // persist it on the deployment (Bug 3) — the UI shows this instead of a
    // generic "error". Maps ENOSPC / context-canceled / 401-403 / missing yml.
    const errText = ((e as Error & { stderr?: string }).stderr || (e as Error).message || "").trim()
    const diag = diagnoseDeployError(errText)
    const errorStr = (diag ? `${diag.cause} → ${diag.action}` : errText).slice(0, 500)
    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        // a failed deploy took real time too — the list shows it
        durationMs: Date.now() - pipelineStart,
        error: errorStr || null,
      },
    })
    await db.project.update({ where: { id: projectId }, data: { status: "error" } })
    await emit(
      "deploy.failed",
      "deploy",
      `deploy of ${projectName} failed: ${diag ? diag.cause : errText.slice(0, 160)}`,
      { title: "Deploy failed", body: `${projectName}: ${diag ? `${diag.cause} — ${diag.action}` : errText.slice(0, 160)}`, level: "error", kind: "deploy" },
      { projectId, actor: ctx.actor }
    )
    throw e
  }
}

/** Run a `docker ...` CLI command (compose/build). Resolves on exit 0 with
 *  captured stdout+stderr; rejects with an Error carrying the stderr tail so the
 *  deploy pipeline can persist the real failing-step output (Bug 3). */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import("node:child_process")
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      {
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          // ponytail: without these, alpine's docker-cli falls back to the
          // legacy builder and any Dockerfile using `RUN --mount=…` fails with
          // "the --mount option requires BuildKit" — the exact error helix-web
          // hit after checkout started working.
          DOCKER_BUILDKIT: "1",
          COMPOSE_DOCKER_CLI_BUILD: "1",
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          const tail = (stderr || err.message || "").trim().slice(-1200)
          const e = new Error(`docker ${args.join(" ")} failed: ${tail || err.message}`)
          ;(e as Error & { stderr?: string }).stderr = tail
          reject(e)
        } else {
          resolve({ stdout: stdout || "", stderr: stderr || "" })
        }
      }
    )
  })
}

async function runCmd(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import("node:child_process")
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 8 * 1024 * 1024, cwd: opts.cwd, env: { ...process.env, ...opts.env } },
      (err, stdout, stderr) => {
        if (err) {
          const tail = (stderr || err.message || "").trim().slice(-1200)
          const e = new Error(`${command} ${args.join(" ")} failed: ${tail || err.message}`)
          ;(e as Error & { stderr?: string }).stderr = tail
          reject(e)
        } else {
          resolve({ stdout: stdout || "", stderr: stderr || "" })
        }
      }
    )
  })
}

function buildsRoot(): string {
  const base = process.env.SLIPWAY_DATA_DIR?.trim() || "/tmp"
  return `${base.replace(/\/+$/, "")}/builds`
}

/**
 * Shallow-clone a public repo into the data dir. Public HTTPS only — private
 * repos need credentials Slipway does not yet store for git clone.
 */
async function clonePublicRepo(cloneUrl: string, branch: string, deploymentId: string): Promise<string> {
  const { mkdir } = await import("node:fs/promises")
  const dir = `${buildsRoot()}/${deploymentId}`
  await rmBuildDir(dir)
  await mkdir(dir, { recursive: true })
  // ponytail: clone into a fresh directory per deployment. Reusing a shared
  // checkout raced concurrent deploys and left dirty trees that made the next
  // build pick up someone else's commit.
  try {
    await runCmd("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      branch,
      "--single-branch",
      cloneUrl,
      dir,
    ])
  } catch (e) {
    // default branch might not be what the UI sent (`main` vs `master`) —
    // retry without --branch so git uses the remote HEAD.
    const msg = ((e as Error & { stderr?: string }).stderr || (e as Error).message || "").toLowerCase()
    if (/not found|could not find remote|remote branch|does not exist|fatal:/.test(msg)) {
      await rmBuildDir(dir)
      await mkdir(dir, { recursive: true })
      try {
        await runCmd("git", ["clone", "--depth", "1", "--single-branch", cloneUrl, dir])
      } catch (e2) {
        // surface the ORIGINAL branch error when the unscoped clone also fails
        // (private/missing repo), otherwise the HEAD-clone error
        throw e2
      }
    } else {
      throw e
    }
  }
  return dir
}

async function gitRevParse(repoDir: string): Promise<string> {
  try {
    const { stdout } = await runCmd("git", ["rev-parse", "HEAD"], { cwd: repoDir })
    return stdout.trim().toLowerCase()
  } catch {
    return ""
  }
}

async function listCheckoutFiles(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    // top-level only is enough for stack detection (Dockerfile, package.json, …)
    return entries.map((e) => e.name)
  } catch {
    return []
  }
}

async function readTextFile(path: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises")
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

async function rmBuildDir(dir: string): Promise<void> {
  const { rm } = await import("node:fs/promises")
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

function stackLabelFor(stack: DetectedStack): string {
  switch (stack) {
    case "nextjs":
      return "Next.js"
    case "node":
      return "Node.js"
    case "python":
      return "Python"
    case "go":
      return "Go"
    case "rust":
      return "Rust"
    case "static":
      return "Static"
    case "compose":
      return "Docker Compose"
    case "dockerfile":
      return "Dockerfile"
    default:
      return stack
  }
}

/**
 * Build an image from a directory that lives INSIDE the Slipway container.
 *
 * ponytail: `docker build /container/path` asks the *host* daemon for that
 * path, which does not exist on the host when Slipway runs in a container with
 * only the socket mounted. Streaming a tar of the directory on stdin
 * (`docker build -`) sends the context to the daemon over the API — the only
 * reliable way to build from a checkout that lives in the manager container.
 *
 * ponytail: always enable BuildKit. Public repos (Next.js, etc.) ship
 * Dockerfiles with `RUN --mount=type=cache,…` which the legacy builder
 * rejects. Prefer `docker buildx build --load` when the plugin is present;
 * fall back to `DOCKER_BUILDKIT=1 docker build`.
 */
async function dockerBuildFromDir(
  contextDir: string,
  dockerfileName: string,
  tags: string[]
): Promise<void> {
  const { spawn } = await import("node:child_process")
  const buildEnv = {
    ...process.env,
    DOCKER_BUILDKIT: "1",
    COMPOSE_DOCKER_CLI_BUILD: "1",
    BUILDKIT_PROGRESS: "plain",
  }

  const useBuildx = await dockerBuildxAvailable()
  const args = useBuildx
    ? ["buildx", "build", "--load", "--progress=plain", "-f", dockerfileName]
    : ["build", "--progress=plain", "-f", dockerfileName]
  for (const t of tags) {
    args.push("-t", t)
  }
  args.push("-")

  await new Promise<void>((resolve, reject) => {
    const tar = spawn(
      "tar",
      [
        "-C",
        contextDir,
        // Keep the context small and free of host junk. .git alone can be
        // hundreds of MB on a shallow clone's pack — BuildKit doesn't need it.
        "--exclude=.git",
        "--exclude=node_modules",
        "--exclude=.next",
        "--exclude=dist",
        "--exclude=coverage",
        "-cf",
        "-",
        ".",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    )
    const build = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildEnv,
    })
    let stderr = ""
    tar.stdout.pipe(build.stdin)
    tar.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    build.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    build.stdout.on("data", (d: Buffer) => {
      // buildx prints progress on stdout when --progress=plain
      stderr += d.toString()
    })
    let tarCode: number | null = null
    let buildCode: number | null = null
    const maybeDone = () => {
      if (tarCode === null || buildCode === null) return
      if (tarCode !== 0) {
        const e = new Error(`tar context failed (exit ${tarCode}): ${stderr.trim().slice(-800)}`)
        ;(e as Error & { stderr?: string }).stderr = stderr.trim().slice(-1200)
        reject(e)
        return
      }
      if (buildCode !== 0) {
        const e = new Error(`docker build failed (exit ${buildCode}): ${stderr.trim().slice(-800)}`)
        ;(e as Error & { stderr?: string }).stderr = stderr.trim().slice(-1200)
        reject(e)
        return
      }
      resolve()
    }
    tar.on("error", (err) => reject(err))
    build.on("error", (err) => reject(err))
    tar.on("close", (code) => {
      tarCode = code ?? 1
      // if tar fails early, close the build stdin so it doesn't hang
      if (tarCode !== 0) build.stdin.destroy()
      maybeDone()
    })
    build.on("close", (code) => {
      buildCode = code ?? 1
      maybeDone()
    })
  })
}

/** True when `docker buildx version` works (plugin installed). Cached with a
 * TTL so a daemon restart / plugin install is picked up without a process
 * restart (the old permanent cache went stale forever). */
let buildxCached: { v: boolean; t: number } | null = null
const BUILDX_CACHE_TTL = 60_000
async function dockerBuildxAvailable(): Promise<boolean> {
  const now = Date.now()
  if (buildxCached && now - buildxCached.t < BUILDX_CACHE_TTL) return buildxCached.v
  try {
    await runCli(["buildx", "version"])
    buildxCached = { v: true, t: now }
  } catch {
    buildxCached = { v: false, t: now }
  }
  return buildxCached.v
}
/** Test/daemon hook: force the buildx probe to recompute on next call. */
export function invalidateBuildxCache(): void {
  buildxCached = null
}

// Every real container id tied to a project: the project's own container
// (scanned/imported containers set project.dockerContainerId) plus any service
// containers. Deduped. Scanned projects have NO Service rows, so without this
// the lifecycle ops below would silently no-op on the real container — which
// was the bug behind "can't do anything with scanned containers".
async function projectContainerIds(projectId: string): Promise<string[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { dockerContainerId: true },
  })
  const services = await db.service.findMany({
    where: { projectId },
    select: { dockerContainerId: true },
  })
  const ids = new Set<string>()
  if (project?.dockerContainerId) ids.add(project.dockerContainerId)
  for (const s of services) if (s.dockerContainerId) ids.add(s.dockerContainerId)
  return [...ids]
}

export async function realRestart(
  projectId: string,
  serviceId?: string,
  actor = "you"
): Promise<void> {
  const docker = await getDocker()
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error("Project not found")
  // serviceId = restart just that service's container; otherwise restart every
  // real container tied to the project (project + services).
  let ids: string[]
  if (serviceId) {
    const s = await db.service.findUnique({ where: { id: serviceId }, select: { dockerContainerId: true } })
    ids = s?.dockerContainerId ? [s.dockerContainerId] : []
  } else {
    ids = await projectContainerIds(projectId)
  }
  // ponytail: don't claim "running" for containers that did NOT restart. This
  // swallowed every failure and then unconditionally wrote status=running, so
  // restarting a project whose container had been removed on the host left the
  // dashboard showing a healthy service backed by nothing.
  if (ids.length === 0) {
    throw new Error(
      "No real container is linked to this project — deploy it first (or re-scan the host if it was created outside Slipway)."
    )
  }
  const failures: string[] = []
  for (const id of ids) {
    try {
      await docker.getContainer(id).restart()
    } catch (e) {
      failures.push((e as Error).message)
    }
  }
  // R2: report per-service results honestly — never all-green when any
  // container failed. Partial success (some restarted) is marked as such, not
  // silently "running".
  if (failures.length > 0) {
    const okCount = ids.length - failures.length
    if (failures.length === ids.length) {
      await db.project.update({ where: { id: projectId }, data: { status: "error" } }).catch(() => {})
      throw new Error(`Restart failed: ${failures[0]}`)
    }
    // partial: mark degraded, increment only for the ones that restarted
    await db.project.update({ where: { id: projectId }, data: { status: "degraded" } }).catch(() => {})
    await recordActivity("scale", `partial restart of ${project.name}: ${okCount}/${ids.length} containers restarted (${failures[0]})`, {
      projectId,
      actor,
    })
    await db.service.updateMany({
      where: { projectId, ...(serviceId ? { id: serviceId } : {}) },
      data: { restarts: { increment: okCount } },
    })
    throw new Error(`Restart partial: ${okCount}/${ids.length} containers restarted; ${failures[0]}`)
  }
  await db.service.updateMany({
    where: { projectId, ...(serviceId ? { id: serviceId } : {}) },
    data: { status: "running", restarts: { increment: 1 } },
  })
  if (!serviceId) await db.project.update({ where: { id: projectId }, data: { status: "running" } })
  await recordActivity("scale", `restarted ${serviceId ? "service" : project.name}`, {
    projectId,
    actor,
  })
}

export async function stopService(
  projectId: string,
  serviceId: string | undefined,
  actor = "you"
): Promise<void> {
  const docker = await getDocker()
  const service = await db.service.findUnique({ where: { id: serviceId }, select: { dockerContainerId: true, name: true } })
  if (!service) throw new Error("Service not found")
  if (!service.dockerContainerId) {
    throw new Error(`Service "${service.name}" has no container to stop (deploy the project first).`)
  }
  try {
    await docker.getContainer(service.dockerContainerId).stop()
  } catch {
    /* already stopped or gone — the desired end state either way */
  }
  await db.service.update({ where: { id: serviceId }, data: { status: "stopped" } })
  await recordActivity("scale", `stopped service ${service.name}`, { projectId, actor })
}

export async function realStop(projectId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
  const ids = await projectContainerIds(projectId)
  for (const id of ids) {
    try {
      await docker.getContainer(id).stop()
    } catch {
      /* already stopped or gone — the desired end state either way */
    }
  }
  await db.project.update({ where: { id: projectId }, data: { status: "stopped" } })
  await db.service.updateMany({ where: { projectId }, data: { status: "stopped" } })
  // Stopping an app is an operator action; it belongs in the audit log next to
  // restart/scale/deploy rather than happening invisibly.
  await recordActivity("scale", `stopped ${project?.name || projectId}`, { projectId, actor })
}

export async function realRemove(projectId: string, actor = "you"): Promise<void> {
  // Read the name BEFORE the row is deleted — the activity entry used to record
  // the raw cuid, which is meaningless in the audit log once the row is gone.
  const doomed = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
  // ponytail: delete the PROJECT ROW, not just the container. The previous
  // version only `docker rm`'d the containers and returned — the Project row (and
  // its services/domains/envVars) stayed in SQLite, so the app reappeared after
  // every refresh. That was the "delete says success but it comes back" bug:
  // the DELETE route returned {ok:true} even though the row was never touched.
  //
  // Container removal is best-effort (Docker may be down, the container may
  // already be gone) and must NOT block the row deletion — deleting the project
  // is the real delete. The schema cascades Service/Domain/EnvVar and SetNulls
  // Deployment/Volume/Notification/Activity (kept as history), so one
  // db.project.delete cleans everything.
  try {
    const docker = await getDocker()
    const ids = await projectContainerIds(projectId)
    for (const id of ids) {
      try {
        await docker.getContainer(id).remove({ force: true })
      } catch {
        /* container already gone / swarm-managed — ignore */
      }
    }
  } catch {
    /* Docker engine down — still delete the row; the container is orphaned */
  }
  await db.project.delete({ where: { id: projectId } })
  await recordActivity("deploy", `deleted project "${doomed?.name || projectId}"`, { actor })
}

// Live, non-destructive `docker update` for resource limits. Only applied when
// the project has a real container; otherwise the row edit is metadata-only
// (applied on next deploy). Renaming the real container is intentionally NOT
// done — the container name is the Docker identity other tools may reference;
// the project name is just Slipway's label.
export async function realUpdateContainer(
  projectId: string,
  patch: { memoryMb?: number; cpuMilli?: number },
  actor = "you"
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { dockerContainerId: true },
  })
  if (!project?.dockerContainerId) return
  const docker = await getDocker()
  const c = docker.getContainer(project.dockerContainerId)
  const upd: { Memory?: number; NanoCpus?: number } = {}
  if (patch.memoryMb !== undefined) upd.Memory = patch.memoryMb * 1024 * 1024
  if (patch.cpuMilli !== undefined) upd.NanoCpus = Math.round((patch.cpuMilli / 1000) * 1e9)
  if (Object.keys(upd).length) {
    try {
      await c.update(upd)
    } catch (e) {
      console.error("[docker-ops] live update failed:", (e as Error).message)
    }
  }
  void actor
}

// Recreate the project's real container applying Slipway's config: image
// (project.dockerImage), env vars, start command, and resource limits. The
// existing container is inspected first so its named volumes, networks, port
// bindings and labels are preserved — only env/image/cmd/resources are
// overlaid. This is the real "edit the app and have it take effect": env/cmd
// can't change on a running container, so the container is recreated (brief
// downtime). Honest: throws on failure so the API returns 500, no fake success.
export async function realReconcile(projectId: string, actor = "you"): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { envVars: true },
  })
  if (!project) throw new Error("Project not found")
  if (!project.dockerContainerId) throw new Error("No real container to reconcile — deploy the project first")
  const docker = await getDocker()
  const old = docker.getContainer(project.dockerContainerId)
  const info = await old.inspect()

  // ponytail: refuse to reconcile a container Docker Swarm manages. Swarm
  // owns task containers (label `com.docker.swarm.task.id` / `com.docker.service`);
  // stop+remove+recreate a standalone container with the task's name leaves
  // Swarm to respawn the original task under a new id, so the recreated
  // container "disappears" and Slipway's stored id goes stale. That was the
  // "container 8b7366f9515b created but not shown on the dashboard" bug. The
  // honest answer is: edit a Swarm service via `docker service update`, not by
  // recreating its task. (Wiring service-update for arbitrary imported Swarm
  // services is a follow-up; for now refuse with a clear message.)
  const labels = info.Config?.Labels || {}
  const swarmTask = labels["com.docker.swarm.task.id"] || labels["com.docker.service"]
  if (swarmTask) {
    throw new Error(
      `This container is a Docker Swarm task (service ${labels["com.docker.service"] || "?"}). Slipway can't recreate it standalone — Swarm would respawn it under a new id. Edit the service via 'docker service update' on the host, or deploy a non-Swarm container to manage it from Slipway.`
    )
  }

  const image = project.dockerImage || info.Config.Image || ""
  if (!image) throw new Error("No image to reconcile to")

  // Env: keep the container's existing env (minus PATH, which the image sets),
  // then overlay Slipway's env vars (last write wins per key). The Slipway side
  // comes from containerConfigFor() — the same helper the deploy pipeline uses,
  // so a container built by a deploy and one rebuilt by a reconcile carry
  // identical Slipway configuration.
  const cfg = await containerConfigFor(projectId)
  const envMap = new Map<string, string>()
  for (const e of info.Config.Env || []) {
    const i = e.indexOf("=")
    if (i > 0 && e.slice(0, i) !== "PATH") envMap.set(e.slice(0, i), e.slice(i + 1))
  }
  for (const e of cfg.Env) {
    const i = e.indexOf("=")
    if (i > 0) envMap.set(e.slice(0, i), e.slice(i + 1))
  }
  const Env = [...envMap].map(([k, v]) => `${k}=${v}`)
  const Cmd = cfg.Cmd ?? info.Config.Cmd ?? undefined

  const hc = (info.HostConfig || {}) as Docker.HostConfig
  const HostConfig: Docker.HostConfig = {
    RestartPolicy: { Name: "unless-stopped" },
    PortBindings: hc.PortBindings || {},
    Memory: cfg.Memory ?? hc.Memory,
    NanoCpus: cfg.NanoCpus ?? hc.NanoCpus,
  }
  // preserve named-volume binds (data volumes survive the recreate)
  const binds = (info.Mounts || [])
    .filter((m) => m.Type === "volume" && m.Name)
    .map((m) => `${m.Name}:${m.Destination}`)
  if (binds.length) HostConfig.Binds = binds

  // rejoin the same networks
  const nets = info.NetworkSettings?.Networks || {}
  const EndpointsConfig: Record<string, Docker.EndpointSettings> = {}
  for (const name of Object.keys(nets)) EndpointsConfig[name] = {}
  const NetworkingConfig = Object.keys(EndpointsConfig).length ? { EndpointsConfig } : undefined

  const name = (info.Name || "").replace(/^\//, "")
  await old.stop().catch(() => {})
  await old.remove({ force: true }).catch(() => {})

  const created = await docker.createContainer({
    Image: image,
    name: name || undefined,
    Env,
    ...(Cmd ? { Cmd } : {}),
    HostConfig,
    ...(NetworkingConfig ? { NetworkingConfig } : {}),
    ...(info.Config.Labels && Object.keys(info.Config.Labels).length ? { Labels: info.Config.Labels } : {}),
  })
  await created.start()

  const fresh = await created.inspect()
  const running = fresh.State?.Running === true
  await db.project.update({
    where: { id: projectId },
    data: { dockerContainerId: created.id, status: running ? "running" : "failed" },
  })
  await db.service.updateMany({
    where: { projectId },
    data: { dockerContainerId: created.id, status: running ? "running" : "failed" },
  })
  if (!running) {
    throw new Error(`Container was recreated but is not running (state: ${fresh.State?.Status || "exited"}). Check its logs on the host — the image/start command may be invalid.`)
  }
  await recordActivity("deploy", `applied config changes to ${project.name} (container recreated)`, {
    projectId,
    actor,
  })
  return created.id
}

/**
 * Roll a project back to the image a previous deployment released.
 *
 * ponytail: this used to be `simulateRollback` — it created a Deployment row
 * with status "healthy", hardcoded step durations (800/4200/5200/400ms) and
 * `durationMs: 12_000`, then emitted "Rollback complete. Health checks passed."
 * It never touched Docker. The container kept running the exact image it was
 * already running, while the dashboard and the notification both told the
 * operator the rollback had succeeded — the most dangerous fake success in the
 * codebase, because rollback is what people reach for during an incident.
 *
 * The real thing: recreate the project's container from the target
 * deployment's recorded image, preserving the container's volumes, networks,
 * port bindings and labels exactly as realReconcile does, then record the
 * outcome with measured timings. Fails honestly when there is nothing to roll
 * back to (no recorded image, image pruned off the host, no container).
 */
export async function realRollback(deploymentId: string, actor = "you"): Promise<string> {
  const target = await db.deployment.findUnique({ where: { id: deploymentId } })
  if (!target) throw new Error("Deployment not found")
  if (!target.projectId) throw new Error("This deployment has no project to roll back")
  const project = await db.project.findUnique({ where: { id: target.projectId } })
  if (!project) throw new Error("Project not found")

  if (!target.image) {
    throw new Error(
      "That deployment didn't record an image, so there is nothing to roll back to. Deployments taken before this Slipway version — and compose deploys, where compose owns the images — can't be rolled back automatically."
    )
  }
  if (!project.dockerContainerId) {
    throw new Error("This project has no running container to roll back — deploy it first.")
  }

  const docker = await getDocker()

  // The image must still exist on the host: `docker image prune` or a manual
  // cleanup can remove it, and recreating from a missing image would fail
  // halfway through, after the current container had already been destroyed.
  // Check BEFORE touching anything.
  try {
    await docker.getImage(target.image).inspect()
  } catch {
    throw new Error(
      `Image "${target.image}" is no longer on this host (pruned?), so the rollback can't run. Redeploy from source instead.`
    )
  }

  const startedAt = Date.now()
  const steps = [
    { stage: "queued", label: "Queued", order: 0 },
    { stage: "release", label: "Release", order: 1 },
    { stage: "verify", label: "Health check", order: 2 },
    { stage: "live", label: "Live", order: 3 },
  ]
  const rollback = await db.deployment.create({
    data: {
      projectId: project.id,
      commitSha: target.commitSha,
      commitMessage: `Rollback to ${target.commitSha || target.image}`,
      branch: target.branch,
      author: actor,
      environment: target.environment,
      status: "deploying",
      rollbackOfId: target.id,
      image: target.image,
      url: project.url || undefined,
      steps: {
        create: steps.map((s) => ({ ...s, status: "queued", startedAt: null, finishedAt: null })),
      },
    },
  })

  // Set when a failed rollback successfully put the previous container back —
  // the project is then still serving traffic, so the catch below must not
  // stamp it "error" on top of the "running" the restore just wrote.
  let recovered = false

  const stepStart = new Map<number, number>()
  const begin = async (order: number) => {
    stepStart.set(order, Date.now())
    await db.deploymentStep.updateMany({
      where: { deploymentId: rollback.id, order },
      data: { status: "building", startedAt: new Date() },
    })
  }
  const finish = async (order: number) => {
    const t0 = stepStart.get(order)
    await db.deploymentStep.updateMany({
      where: { deploymentId: rollback.id, order },
      data: {
        status: "healthy",
        finishedAt: new Date(),
        durationMs: t0 !== undefined ? Date.now() - t0 : null,
      },
    })
  }
  const failStep = async (order: number, log: string) => {
    await db.deploymentStep.updateMany({
      where: { deploymentId: rollback.id, order },
      data: { status: "failed", finishedAt: new Date(), log: log.slice(-1200) || null },
    })
  }

  try {
    await begin(0)
    await finish(0)

    // release: recreate the container on the target image
    await begin(1)
    const old = docker.getContainer(project.dockerContainerId)
    const info = await old.inspect()

    const labels = info.Config?.Labels || {}
    if (labels["com.docker.swarm.task.id"] || labels["com.docker.service"]) {
      throw new Error(
        "This container is a Docker Swarm task — Swarm would respawn it under a new id, so Slipway won't recreate it. Roll back via 'docker service update' on the host."
      )
    }

    const cfg = await containerConfigFor(project.id)
    const envMap = new Map<string, string>()
    for (const e of info.Config.Env || []) {
      const i = e.indexOf("=")
      if (i > 0 && e.slice(0, i) !== "PATH") envMap.set(e.slice(0, i), e.slice(i + 1))
    }
    for (const e of cfg.Env) {
      const i = e.indexOf("=")
      if (i > 0) envMap.set(e.slice(0, i), e.slice(i + 1))
    }
    const hc = (info.HostConfig || {}) as Docker.HostConfig
    const HostConfig: Docker.HostConfig = {
      RestartPolicy: { Name: "unless-stopped" },
      PortBindings: hc.PortBindings || {},
      Memory: cfg.Memory ?? hc.Memory,
      NanoCpus: cfg.NanoCpus ?? hc.NanoCpus,
    }
    const binds = (info.Mounts || [])
      .filter((m) => m.Type === "volume" && m.Name)
      .map((m) => `${m.Name}:${m.Destination}`)
    if (binds.length) HostConfig.Binds = binds
    const nets = info.NetworkSettings?.Networks || {}
    const EndpointsConfig: Record<string, Docker.EndpointSettings> = {}
    for (const n of Object.keys(nets)) EndpointsConfig[n] = {}
    const name = (info.Name || "").replace(/^\//, "")

    // ponytail: RENAME the current container aside instead of destroying it, so
    // a rollback that fails to come up can be undone. The dialog promises "if
    // health checks fail, the rollback is aborted automatically" — that promise
    // is only keepable if the known-good container still exists. Removing it
    // first (the obvious implementation) means a bad rollback takes the service
    // down with no way back, during an incident, which is the worst possible
    // moment to discover it.
    const backupName = `${name || "slipway-rollback"}-prev-${Date.now().toString(36)}`
    let backedUp = false
    await old.stop().catch(() => {})
    try {
      await old.rename({ name: backupName })
      backedUp = true
    } catch {
      // rename unsupported/failed — fall back to removing it; we can no longer
      // restore, and the catch below reports that honestly.
      await old.remove({ force: true }).catch(() => {})
    }

    /** Put the previous container back and start it. Best-effort. */
    const restorePrevious = async (): Promise<boolean> => {
      if (!backedUp) return false
      try {
        const prev = docker.getContainer(backupName)
        await prev.rename({ name })
        await prev.start()
        const back = await prev.inspect()
        if (back.State?.Running === true) {
          await db.project.update({
            where: { id: project.id },
            data: { dockerContainerId: prev.id, status: "running" },
          })
          await db.service.updateMany({
            where: { projectId: project.id },
            data: { dockerContainerId: prev.id, status: "running" },
          })
          recovered = true
          return true
        }
      } catch {
        /* fall through — reported by the caller */
      }
      return false
    }

    let created: Docker.Container | null = null
    try {
      created = await docker.createContainer({
        Image: target.image,
        name: name || undefined,
        Env: [...envMap].map(([k, v]) => `${k}=${v}`),
        ...(cfg.Cmd ? { Cmd: cfg.Cmd } : info.Config.Cmd ? { Cmd: info.Config.Cmd } : {}),
        HostConfig,
        ...(Object.keys(EndpointsConfig).length ? { NetworkingConfig: { EndpointsConfig } } : {}),
        ...(Object.keys(labels).length ? { Labels: labels } : {}),
      })
      await created.start()
    } catch (ce) {
      // ponytail: if createContainer succeeded but start() failed, the failed
      // container still owns `name`. restorePrevious() then tries to rename the
      // saved container back onto that name and hits a collision — leaving both
      // the broken new container and the known-good one renamed aside. Force-
      // remove the failed create first so the restore rename can succeed.
      if (created) {
        await created.remove({ force: true }).catch(() => {})
        created = null
      } else if (name) {
        await docker
          .getContainer(name)
          .remove({ force: true })
          .catch(() => {})
      }
      const restored = await restorePrevious()
      await failStep(1, (ce as Error).message)
      throw new Error(
        `Couldn't start ${target.image}: ${(ce as Error).message}. ${
          restored
            ? "The previous container was restored and is running again."
            : "The previous container could NOT be restored — check the host."
        }`
      )
    }
    await finish(1)

    // verify: it has to actually be running, same bar as a deploy
    await begin(2)
    const fresh = await created.inspect()
    if (fresh.State?.Running !== true) {
      const tail = await created
        .logs({ stdout: true, stderr: true, follow: false })
        .then((b) => demuxToString(b).slice(-1200))
        .catch(() => "")
      await failStep(2, tail)
      // abort: drop the failed container and put the known-good one back
      await created.remove({ force: true }).catch(() => {})
      const restored = await restorePrevious()
      throw new Error(
        `Rolled-back container is not running (state: ${fresh.State?.Status || "exited"}). The previous image may not start with the project's current configuration. ${
          restored
            ? "Rollback aborted — the previous container was restored and is running again."
            : "The previous container could NOT be restored — check the host."
        }`
      )
    }
    // rollback is good — discard the saved container
    if (backedUp) {
      await docker.getContainer(backupName).remove({ force: true }).catch(() => {})
    }
    await db.project.update({
      where: { id: project.id },
      data: {
        dockerContainerId: created.id,
        dockerImage: target.image,
        status: "running",
        lastDeployedAt: new Date(),
      },
    })
    await db.service.updateMany({
      where: { projectId: project.id },
      data: { dockerContainerId: created.id, status: "running" },
    })
    await finish(2)

    await begin(3)
    await finish(3)

    await db.deployment.update({
      where: { id: rollback.id },
      data: { status: "healthy", finishedAt: new Date(), durationMs: Date.now() - startedAt },
    })
    await emit(
      "rollback",
      "rollback",
      `rolled back ${project.name} to ${target.commitSha || target.image}`,
      {
        title: "Rollback complete",
        body: `${project.name} is running ${target.image} again.`,
        level: "success",
        kind: "deploy",
      },
      { projectId: project.id, actor }
    )
  } catch (e) {
    const msg = (e as Error).message
    await db.deployment.update({
      where: { id: rollback.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: msg.slice(0, 500),
      },
    })
    if (!recovered) {
      await db.project.update({ where: { id: project.id }, data: { status: "error" } }).catch(() => {})
    }
    await emit(
      "rollback",
      "rollback",
      `rollback of ${project.name} failed: ${msg.slice(0, 160)}`,
      { title: "Rollback failed", body: `${project.name}: ${msg.slice(0, 200)}`, level: "error", kind: "deploy" },
      { projectId: project.id, actor }
    )
    throw e
  }
  return rollback.id
}

// Restart a real database container (managed or scanned/imported).
export async function realRestartDatabase(dbId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const row = await db.databaseInstance.findUnique({
    where: { id: dbId },
    select: { dockerContainerId: true, name: true },
  })
  if (!row) throw new Error("Database not found")
  if (!row.dockerContainerId) throw new Error("No real container for this database")
  await docker.getContainer(row.dockerContainerId).restart()
  await db.databaseInstance.update({ where: { id: dbId }, data: { status: "running" } })
  await recordActivity("database", `restarted database ${row.name}`, { actor })
}

// Run a command inside a container and return its exit code + combined output.
// Used by credential rotation to `docker exec` the engine's CLI.
async function execInContainer(
  docker: Docker,
  containerId: string,
  cmd: string[]
): Promise<{ exitCode: number; output: string }> {
  const exec = await docker.getContainer(containerId).exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({ hijack: true, Detach: false })
  let output = ""
  await new Promise<void>((resolve) => {
    const chunks: Buffer[] = []
    stream.on("data", (c: Buffer) => chunks.push(c))
    stream.on("end", () => {
      output = Buffer.concat(chunks).toString("utf8")
      resolve()
    })
    stream.on("error", () => resolve())
  })
  const inspectRes = await exec.inspect()
  // dockerode multiplexed stream — strip the 8-byte header per chunk for a
  // readable message. ponytail: best-effort parse; we mainly care about exit.
  const strip = (s: string) =>
    s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim()
  return { exitCode: inspectRes.ExitCode ?? 0, output: strip(output) || output }
}

// Set / rotate credentials on a Slipway-managed database by `docker exec`-ing
// the engine CLI. Slipway knows the admin password for DBs it provisioned
// (it set the env), so rotation works there. For imported/external DBs it does
// NOT know the admin password → honest refusal (the user rotates from inside).
//
// Engines supported: postgres, mysql, mariadb, mongodb, mssql.
// redis/valkey: requirepass is baked into the container Cmd, so a live CONFIG
// SET reverts on restart — rotating them needs a container recreate (honest
// refusal here, recreate the DB to change its password).
export async function realSetDatabaseCredentials(
  dbId: string,
  patch: { password?: string; username?: string },
  actor = "you"
): Promise<{ username: string | null; password: string | null }> {
  const row = await db.databaseInstance.findUnique({ where: { id: dbId } })
  if (!row) throw new Error("Database not found")
  if (!row.dockerContainerId) throw new Error("No real container for this database")
  if (row.status === "external") {
    throw new Error("This database was imported — Slipway doesn't know its admin password. Rotate it from inside the container manually.")
  }
  const engine = ENGINE_SPECS[row.kind]
  if (!engine) throw new Error(`Unsupported engine: ${row.kind}`)

  const newPass = patch.password?.trim()
  if (!newPass) throw new Error("A new password is required")
  const username = patch.username?.trim() || row.username || engine.defaultUser || ""

  // ponytail: the username is interpolated into a SQL IDENTIFIER, where quoting
  // rules differ per engine (" for postgres, ` for mysql, [ ] for mssql) and an
  // embedded delimiter breaks out of all of them. Escaping three dialects
  // correctly is a losing game, so restrict the identifier instead: reject
  // anything that isn't a plain SQL name. Passwords are still escaped below —
  // they are string literals, where doubling the quote is well defined.
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(username)) {
    throw new Error(
      `"${username}" isn't a usable database username — use letters, digits and underscores, starting with a letter or underscore.`
    )
  }

  const docker = await getDocker()
  // ponytail: the admin password is EXACTLY what the row stores. This used to
  // append "Aa1!" for mssql to mirror a suffix that provisioning added only to
  // the container's env — so the stored value and the real SA password differed.
  // genPassword() now guarantees complexity itself and provisioning sets the
  // stored value verbatim, so there is no suffix anywhere. Reintroducing one
  // here would recreate the "revealed credentials don't work" bug.
  // R6: stored encrypted at rest; decrypt only here, at the connection point.
  const currentAdmin = decryptDbPassword(row.password)

  // Escape a SQL string literal. Postgres / MSSQL only need quote doubling.
  // MySQL/MariaDB default to backslash escapes too — a password containing `\'`
  // would otherwise terminate the literal and inject SQL. Escape backslashes
  // first, then quotes.
  const litPg = (v: string) => v.replace(/'/g, "''")
  const litMysql = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "''")

  let cmd: string[]
  switch (row.kind) {
    case "postgres":
      cmd = ["psql", "-U", username, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `ALTER USER "${username}" WITH PASSWORD '${litPg(newPass)}';`]
      break
    case "mysql":
    case "mariadb": {
      // ponytail: provision sets the SAME password on root and the app user
      // (MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD). Rotation used to ALTER only the
      // app user, then store newPass as the row password — so the next backup
      // (mysqldump -u root with MYSQL_PWD=row.password) and the next rotation
      // both authenticated root with the wrong secret. Keep them in lockstep.
      const p = litMysql(newPass)
      const statements = [
        `ALTER USER 'root'@'localhost' IDENTIFIED BY '${p}'`,
        `ALTER USER 'root'@'%' IDENTIFIED BY '${p}'`,
        username ? `ALTER USER '${username.replace(/'/g, "''")}'@'%' IDENTIFIED BY '${p}'` : "",
      ]
        .filter(Boolean)
        .join("; ")
      cmd = ["mysql", "-u", "root", `-p${currentAdmin}`, "-e", statements]
      break
    }
    case "mongodb":
      cmd = ["mongosh", "--quiet", "-u", "root", "-p", currentAdmin, "--authenticationDatabase", "admin", "--eval", `db.changeUserPassword(${JSON.stringify(username)},${JSON.stringify(newPass)})`]
      break
    case "mssql":
      cmd = ["/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", currentAdmin, "-C", "-Q", `ALTER LOGIN [${username}] WITH PASSWORD = '${litPg(newPass)}';`]
      break
    case "redis":
    case "valkey":
      throw new Error("Rotating a redis/valkey password needs recreating the container (the password is baked into its start command). Delete and recreate the database to change its password.")
    default:
      throw new Error(`Credential rotation not implemented for ${row.kind}`)
  }

  const { exitCode, output } = await execInContainer(docker, row.dockerContainerId, cmd)
  if (exitCode !== 0) {
    throw new Error(`engine rejected the credential change (exit ${exitCode}): ${output.slice(0, 300)}`)
  }

  // Store exactly what was set on the engine — /credentials reveals this value
  // verbatim and it must be the password that actually works.
  // R6: encrypted at rest (decrypted on reveal / connect).
  await db.databaseInstance.update({
    where: { id: dbId },
    data: { password: encryptSecret(newPass), username },
  })
  await recordActivity("database", `rotated credentials for database ${row.name}`, { actor })
  await emit(
    "system",
    "database",
    `rotated credentials for database ${row.name}`,
    { title: "Credentials updated", body: `${row.name} password was rotated.`, level: "success", kind: "database" },
    { actor }
  )
  return { username, password: newPass }
}

// Test a real connection to a managed database. If the container is running,
// `docker exec` the engine's ping (pg_isready / mysqladmin ping / redis-cli
// ping / mongosh ping / sqlcmd SELECT 1) inside it and report ok + latency. If
// the container ISN'T running (crash-loop, init failure, exited), pull the
// logs and classify the failure into friendly, actionable guidance — e.g.
// "could not write init file" → read-only data dir / wrong ownership / disk
// full — instead of surfacing a raw dump. Honest: returns ok=false + a hint,
// never claims success for a down DB. (bug 1)
export async function realTestDatabaseConnection(
  dbId: string
): Promise<{
  ok: boolean
  latencyMs?: number
  state?: string
  error?: string
  hint?: string
  raw?: string
}> {
  const row = await db.databaseInstance.findUnique({ where: { id: dbId } })
  if (!row) throw new Error("Database not found")
  if (!row.dockerContainerId) {
    return {
      ok: false,
      error: "No real container for this database",
      hint: "This is an imported/stub row with no container to test. Provision a managed database, or reach an imported DB from a container on the same Docker network.",
    }
  }
  let docker: Docker
  try {
    docker = await getDocker()
  } catch {
    return { ok: false, error: "Docker engine unavailable", hint: "Start Docker on the host and retry." }
  }
  const c = docker.getContainer(row.dockerContainerId)
  let info: { State?: { Running?: boolean; Status?: string; Restarting?: boolean } }
  try {
    info = await c.inspect()
  } catch (e) {
    return { ok: false, error: "Container not found", hint: `The container for this database is gone. ${(e as Error).message}` }
  }
  if (info.State?.Running !== true) {
    let logTail = ""
    try {
      logTail = demuxToString(await c.logs({ stdout: true, stderr: true, follow: false })).slice(-600)
    } catch {
      /* ignore */
    }
    const cls = classifyDbError(logTail)
    return {
      ok: false,
      state: info.State?.Restarting ? "restarting" : info.State?.Status || "exited",
      error: cls.error,
      hint: cls.hint,
      raw: logTail.slice(-200),
    }
  }

  const engine = ENGINE_SPECS[row.kind]
  if (!engine) return { ok: false, error: `Unsupported engine: ${row.kind}` }
  const user = row.username ?? engine.defaultUser ?? ""
  // R6: decrypt the stored credential only where it authenticates.
  const pass = decryptDbPassword(row.password)
  const port = String(engine.internalPort)
  let cmd: string[]
  switch (row.kind) {
    case "postgres":
      cmd = ["pg_isready", "-h", "127.0.0.1", "-p", port, "-U", user]
      break
    case "mysql":
    case "mariadb":
      cmd = ["mysqladmin", "ping", "-h", "127.0.0.1", "--protocol=tcp", "-u", "root", `-p${pass}`]
      break
    case "mongodb":
      cmd = ["mongosh", "--quiet", "-u", user || "root", "-p", pass, "--authenticationDatabase", "admin", "--eval", "db.adminCommand({ping:1}).ok"]
      break
    case "redis":
      cmd = ["redis-cli", "-a", pass, "ping"]
      break
    case "valkey":
      cmd = ["valkey-cli", "-a", pass, "ping"]
      break
    case "mssql":
      cmd = ["/opt/mssql-tools18/bin/sqlcmd", "-S", "127.0.0.1", "-U", "sa", "-P", pass, "-C", "-Q", "SELECT 1"]
      break
    default:
      return { ok: false, error: `No ping command for ${row.kind}` }
  }
  const t0 = Date.now()
  let res: { exitCode: number; output: string }
  try {
    res = await execInContainer(docker, row.dockerContainerId, cmd)
  } catch (e) {
    return { ok: false, error: "Ping command failed to run", hint: (e as Error).message, latencyMs: Date.now() - t0 }
  }
  const latencyMs = Date.now() - t0
  const ok = res.exitCode === 0
  if (ok) return { ok: true, latencyMs, state: "running" }
  // The container is up but the engine ping failed — a postgres that's
  // crash-looping INSIDE a "running" container (e.g. "could not write init
  // file" repeating in its logs) shows State.Running=true, so the stopped-path
  // classifier above never fires. Pull the logs here and classify the same way
  // so the real root cause (read-only data dir / disk full / corrupt) surfaces
  // instead of a generic "not accepting connections" message. (bug 1)
  let logTail = ""
  try {
    logTail = (await c.logs({ stdout: true, stderr: true, follow: false })).toString("utf8").slice(-600)
  } catch {
    /* ignore */
  }
  const cls = classifyDbError(logTail || res.output)
  // Only trust the log classification when it found a recognized pattern; if
  // the logs are clean (engine genuinely still starting), fall back to the
  // generic "still initializing" hint so we never fabricate a misdiagnosis.
  const recognized = /could not write|read-only|permission denied|no space left|enospc|disk full|malformed|corrupt|authentication failed|password authentication failed|access denied|logon failed|login failed|connection refused|not accepting|already in use|already allocated/.test((logTail || res.output).toLowerCase())
  return {
    ok: false,
    latencyMs,
    state: "running",
    error: recognized ? cls.error : res.output.slice(0, 200) || `engine ping exited with code ${res.exitCode}`,
    hint: recognized
      ? cls.hint
      : "The container is up but the engine isn't accepting connections yet (still initializing?) — retry in a few seconds. If it persists, inspect the container logs on the host (`docker logs <db>`).",
    raw: (logTail || res.output).slice(-200),
  }
}

// Map an engine's crash-loop log tail to a friendly, actionable message. The
// raw "FATAL: could not write init file (SQLSTATE XX000)" a Postgres prints when
// its data dir isn't writable is meaningless to a dashboard user; this turns it
// into "check the data directory ownership / disk space / volume mount".
function classifyDbError(logTail: string): { error: string; hint: string } {
  const t = logTail.toLowerCase()
  if (/could not write init file|could not write|read-only file system|readonly|permission denied|operation not permitted|could not create directory/.test(t)) {
    return {
      error: "The database can't write to its data directory (init / permission error).",
      hint: "The data directory or volume mount is read-only or owned by the wrong user. On the host run `df -h` (disk full?), then check the volume mount + data-directory ownership — the engine user (e.g. `postgres`) must own it. For Docker: `docker volume ls`, inspect the bind/volume, and `docker exec <db> ls -la <datadir>`. Recreate the database with a fresh empty volume if the volume is corrupted.",
    }
  }
  if (/no space left|enospc|disk full|write.*failed.*space/.test(t)) {
    return {
      error: "The host disk is full — the database can't initialize.",
      hint: "Run `df -h` on the server and free space (e.g. `docker system prune`), then restart or recreate the database. Slipway won't fake a 'running' state when the disk is full.",
    }
  }
  if (/database disk image is malformed|corrupt|inconsistent/.test(t)) {
    return {
      error: "The database data directory is corrupted.",
      hint: "The volume's data is unusable. Delete the database with 'also delete the data volume' and provision a fresh one.",
    }
  }
  if (/role .* does not exist|authentication failed|password authentication failed|access denied|logon failed|login failed/.test(t)) {
    return {
      error: "Authentication failed — the stored credentials don't match the database.",
      hint: "Rotate the credentials from the ⋯ menu (Set / rotate password), or recreate the database.",
    }
  }
  if (/connection refused|not accepting connections|failed to bind|address already in use|port .* already allocated/.test(t)) {
    return {
      error: "The database engine isn't listening (port conflict or still starting).",
      hint: "Check for a port conflict (`docker port <db>`), wait a few seconds for the engine to finish starting, and retry. A crash-loop will keep restarting — inspect the logs.",
    }
  }
  return {
    error: "The database container exited unexpectedly.",
    hint: "Inspect the container logs on the host: `docker logs <db-container>`. Common causes: bad env vars, an incompatible image version, or a corrupted data volume.",
  }
}

export async function realScale(
  projectId: string,
  serviceId: string | undefined,
  replicas: number,
  actor = "you"
): Promise<void> {
  const docker = await getDocker()
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error("Project not found")
  const services = await db.service.findMany({
    where: { projectId, ...(serviceId ? { id: serviceId } : {}) },
  })

  // ponytail: real multi-replica orchestration needs a scheduler (Swarm/K8s),
  // which this single-node build explicitly does not have — so >1 replica is
  // refused instead of being recorded as if it happened. What single-node CAN
  // honour exactly is 0 (stop) and 1 (run), and that is now done for real in
  // BOTH directions. Previously only the 0 case touched Docker: scaling back to
  // 1 wrote replicas=1 to the row and left the container stopped, so the
  // dashboard showed a running service that was not running.
  if (replicas > 1) {
    throw new Error(
      `Slipway is single-node and has no scheduler, so it can't run ${replicas} replicas of one service. Scale to 0 (stop) or 1 (run), or put a real orchestrator behind it.`
    )
  }
  if (replicas < 0) throw new Error("Replica count can't be negative.")

  const ids = serviceId
    ? services.map((s) => s.dockerContainerId).filter(Boolean as unknown as (v: string | null) => v is string)
    : await projectContainerIds(projectId)

  const errors: string[] = []
  for (const id of ids) {
    try {
      const c = docker.getContainer(id)
      if (replicas === 0) await c.stop()
      else await c.start()
    } catch (e) {
      const msg = (e as Error & { statusCode?: number }).message || ""
      // 304 = already in the requested state; that is success, not an error.
      if ((e as { statusCode?: number }).statusCode !== 304) errors.push(msg)
    }
  }
  if (errors.length && errors.length === ids.length) {
    throw new Error(`Could not ${replicas === 0 ? "stop" : "start"} the container(s): ${errors[0]}`)
  }

  const status = replicas === 0 ? "stopped" : "running"
  for (const s of services) {
    await db.service.update({ where: { id: s.id }, data: { replicas, status } })
  }
  if (!serviceId) {
    await db.project.update({ where: { id: projectId }, data: { status, replicas } })
  }
  await recordActivity("scale", `scaled ${project.name} to ${replicas} ${replicas === 1 ? "replica" : "replicas"}`, {
    projectId,
    actor,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Backups.
//
// ponytail: these used to be theatre. The volume path ran `tar -c /data
// >/dev/null` (tar to the bit bucket — nothing was ever stored), the database
// path did nothing at all beyond inspecting a container, and BOTH then wrote
// `sizeMb = Math.random() * 4000 + 100` and `durationMs: 5000` before emitting
// "Backup completed — snapshot stored." A restore was impossible and the size
// column was a random number. That is precisely the fake success this codebase
// refuses to ship everywhere else, so it is now real:
//
//   - archives are written into the `slipway-backups` named Docker volume, so
//     they survive the Slipway container being recreated,
//   - the recorded size is `stat` of the produced file, and the duration is
//     measured,
//   - databases are dumped with their engine's own tool (pg_dump, mysqldump,
//     mongodump, redis-cli --rdb) from a helper container that shares the DB
//     container's network namespace, so it reaches the engine on 127.0.0.1
//     whatever the network topology is,
//   - anything not actually supported fails honestly instead of recording a
//     completed backup that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

/** Named Docker volume every archive is written into. */
const BACKUP_VOLUME = "slipway-backups"

async function ensureBackupVolume(docker: Docker): Promise<void> {
  try {
    await docker.getVolume(BACKUP_VOLUME).inspect()
  } catch {
    await docker.createVolume({ Name: BACKUP_VOLUME })
  }
}

/**
 * Run a throwaway helper container to completion and return its exit code plus
 * combined output. Used for the archive/dump work, which has to happen inside a
 * container that can see the volume or the database.
 *
 * Tty:true so the logs come back as plain text rather than dockerode's
 * multiplexed framing.
 */
async function runHelper(
  docker: Docker,
  opts: {
    Image: string
    Cmd: string[]
    Env?: string[]
    Binds?: string[]
    NetworkMode?: string
  }
): Promise<{ exitCode: number; output: string }> {
  const create = () =>
    docker.createContainer({
      Image: opts.Image,
      Cmd: opts.Cmd,
      ...(opts.Env ? { Env: opts.Env } : {}),
      Tty: true,
      HostConfig: {
        ...(opts.Binds ? { Binds: opts.Binds } : {}),
        ...(opts.NetworkMode ? { NetworkMode: opts.NetworkMode } : {}),
      },
    })
  let c: Docker.Container
  try {
    c = await create()
  } catch {
    // image not present locally — pull it and retry once
    await pullImage(docker, opts.Image)
    c = await create()
  }
  try {
    await c.start()
    // ponytail: wait for exit BEFORE reading logs. Reading first returns an
    // empty buffer for anything that takes more than an instant — the same
    // mistake that made every volume measure 0 bytes in getVolumeSizes().
    const res = (await c.wait()) as { StatusCode?: number }
    const output = (await c.logs({ stdout: true, stderr: true, follow: false })).toString("utf8")
    return { exitCode: Number(res?.StatusCode ?? 0), output }
  } finally {
    await c.remove({ force: true }).catch(() => {})
  }
}

/**
 * Take a real backup of a volume or a managed database.
 *
 * `target` is the Slipway row's display name (that is what the dialog and the
 * scheduler pass), not a Docker object name — resolved here.
 */
export async function realBackup(
  target: string,
  targetKind: string,
  schedule?: string,
  actor = "you"
): Promise<string> {
  // ponytail: record the attempt BEFORE touching Docker. getDocker() throws
  // when the engine is unreachable, and doing it first meant a failed backup
  // left no BackupRecord at all — the Backups view stayed empty and the only
  // evidence was a line in the server's stdout. For a SCHEDULED backup that is
  // the worst possible failure mode: the operator believes backups are running
  // while nothing is being written and nothing anywhere says otherwise.
  const startedAt = Date.now()
  const retentionDays = await defaultRetentionFor(target, schedule)
  const backup = await db.backupRecord.create({
    data: {
      target,
      targetKind,
      status: "running",
      sizeMb: 0,
      schedule: schedule ?? null,
      retentionDays,
      server: "local",
    },
  })
  await recordActivity("backup", `started backup of ${target}`, { actor })

  const fail = async (message: string): Promise<never> => {
    await db.backupRecord.update({
      where: { id: backup.id },
      data: { status: "failed", finishedAt: new Date(), durationMs: Date.now() - startedAt },
    })
    await emit(
      "backup.failed",
      "backup",
      `backup of ${target} failed: ${message}`,
      { title: "Backup failed", body: `${target}: ${message}`, level: "error", kind: "backup" },
      { actor }
    )
    throw new Error(message)
  }

  let docker: Docker
  try {
    docker = await getDocker()
  } catch (e) {
    return await fail(
      `${(e as Error).message} — start Docker on the host and retry, or the schedule will keep failing.`
    )
  }

  try {
    await ensureBackupVolume(docker)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    let bytes = 0
    let fileName = ""

    if (targetKind === "volume") {
      const row = await db.volume.findFirst({ where: { name: target } })
      // The row's dockerVolumeName is the real Docker object; fall back to the
      // display name so a volume named exactly like its Docker volume still
      // works (and so an ad-hoc target from the API is usable).
      const volumeName = row?.dockerVolumeName || target
      try {
        await docker.getVolume(volumeName).inspect()
      } catch {
        return await fail(
          `No Docker volume named "${volumeName}" — nothing to archive. The Slipway row may reference a volume that was removed on the host.`
        )
      }
      fileName = `volume-${backupSlug(target)}-${stamp}.tar.gz`
      const dest = `/backups/${fileName}`
      const res = await runHelper(docker, {
        Image: "alpine:latest",
        Cmd: [
          "sh",
          "-c",
          `tar -czf ${dest} -C /data . && echo SIZE:$(stat -c %s ${dest})`,
        ],
        Binds: [`${volumeName}:/data:ro`, `${BACKUP_VOLUME}:/backups`],
      })
      if (res.exitCode !== 0) {
        return await fail(`tar failed (exit ${res.exitCode}): ${res.output.trim().slice(-300)}`)
      }
      const size = parseSizeMarker(res.output)
      if (size === null) return await fail(`archive produced no measurable file: ${res.output.trim().slice(-300)}`)
      bytes = size
    } else if (targetKind === "database") {
      const row = await db.databaseInstance.findFirst({ where: { name: target } })
      if (!row) return await fail(`No database named "${target}" in Slipway.`)
      if (!row.dockerContainerId) {
        return await fail(
          `"${target}" has no container Slipway can reach (imported or not provisioned), so there is nothing to dump.`
        )
      }
      if (row.status === "external" || !row.password) {
        return await fail(
          `"${target}" was imported from an existing container and Slipway does not know its credentials, so it cannot run a dump. Back it up with your own tooling.`
        )
      }
      try {
        await docker.getContainer(row.dockerContainerId).inspect()
      } catch {
        return await fail(`The container for "${target}" is gone — nothing to dump.`)
      }
      const ext = backupExtension(row.kind)
      fileName = `db-${backupSlug(target)}-${stamp}.${ext}`
      const dest = `/backups/${fileName}`
      // R6: decrypt the stored credential for the dump (env, never argv).
      const dumpRow = { ...row, password: decryptDbPassword(row.password) }
      const spec = dumpCommandFor(row.kind, dumpRow, dest, ENGINE_SPECS[row.kind]?.internalPort ?? 0)
      if (!spec) {
        return await fail(
          `Slipway has no dump tool for ${row.kind}. Supported: postgres, mysql, mariadb, mongodb, redis, valkey.`
        )
      }
      const res = await runHelper(docker, {
        Image: ENGINE_SPECS[row.kind].image(row.version),
        Cmd: ["sh", "-c", `${spec.cmd} && echo SIZE:$(stat -c %s ${dest})`],
        Env: spec.env,
        Binds: [`${BACKUP_VOLUME}:/backups`],
        // share the database container's network namespace so 127.0.0.1 is the
        // engine regardless of published ports or bridge/overlay networks
        NetworkMode: `container:${row.dockerContainerId}`,
      })
      if (res.exitCode !== 0) {
        return await fail(`dump failed (exit ${res.exitCode}): ${res.output.trim().slice(-300)}`)
      }
      const size = parseSizeMarker(res.output)
      if (size === null) return await fail(`dump produced no measurable file: ${res.output.trim().slice(-300)}`)
      bytes = size
    } else {
      return await fail(
        `Unsupported backup target kind "${targetKind}". Slipway backs up volumes and managed databases.`
      )
    }

    // An archive of zero bytes means the dump silently produced nothing —
    // report it rather than recording a "completed" empty backup.
    if (bytes === 0) {
      return await fail("the archive came out empty (0 bytes) — treating this as a failed backup, not a completed one")
    }

    const durationMs = Date.now() - startedAt
    await db.backupRecord.update({
      where: { id: backup.id },
      data: {
        status: "completed",
        // sizeMb is an Int column; round up so a sub-megabyte archive doesn't
        // display as 0 MB and read as "nothing was stored".
        sizeMb: Math.max(1, Math.round(bytes / 1_000_000)),
        durationMs,
        finishedAt: new Date(),
        fileName,
      },
    })
    await emit(
      "backup.completed",
      "backup",
      `backup of ${target} completed (${formatBytes(bytes)})`,
      {
        title: "Backup completed",
        body: `${target} → ${fileName} (${formatBytes(bytes)}) in the ${BACKUP_VOLUME} volume.`,
        level: "success",
        kind: "backup",
      },
      { actor }
    )
    // Retention is part of taking a backup: without pruning, the backup volume
    // grows until it fills the host disk — the failure mode host-health exists
    // to diagnose.
    await pruneBackups(docker, retentionDays, targetKind, target).catch((e) =>
      console.error("[docker-ops] backup prune failed:", (e as Error).message)
    )
  } catch (e) {
    // fail() already recorded + notified and threw; anything else is unexpected
    const current = await db.backupRecord.findUnique({ where: { id: backup.id } })
    if (current?.status === "running") {
      await db.backupRecord.update({
        where: { id: backup.id },
        data: { status: "failed", finishedAt: new Date(), durationMs: Date.now() - startedAt },
      })
    }
    throw e
  }
  return backup.id
}

/** Human-readable byte size for notification text. */
function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`
  return `${n} B`
}

/**
 * Retention for a new record: the matching schedule's value when the backup was
 * fired by one, otherwise the 14-day default the schema uses.
 */
async function defaultRetentionFor(target: string, schedule?: string): Promise<number> {
  if (!schedule) return 14
  const row = await db.backupSchedule
    .findFirst({ where: { target, schedule, active: true } })
    .catch(() => null)
  return row?.retentionDays ?? 14
}

/**
 * Delete archives older than `retentionDays` from the backup volume for THIS
 * target only, and mark the corresponding records expired. Best-effort: a
 * prune failure must never fail the backup that just succeeded.
 *
 * ponytail: pruning used to `find /backups -mtime +N -delete` across the
 * entire shared volume, so a one-day schedule for database A deleted every
 * other target's 30-day archives too. Scope by the filename prefix we write
 * (`volume-<slug>-…` / `db-<slug>-…`).
 */
async function pruneBackups(
  docker: Docker,
  retentionDays: number,
  targetKind: string,
  target: string
): Promise<void> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return
  const prefix =
    targetKind === "volume"
      ? `volume-${backupSlug(target)}-`
      : `db-${backupSlug(target)}-`
  const days = Math.floor(retentionDays)
  await runHelper(docker, {
    Image: "alpine:latest",
    Cmd: [
      "sh",
      "-c",
      `find /backups -type f -name ${shq(prefix + "*")} -mtime +${days} -delete 2>/dev/null; echo pruned`,
    ],
    Binds: [`${BACKUP_VOLUME}:/backups`],
  })
  const cutoff = new Date(Date.now() - days * 86_400_000)
  await db.backupRecord
    .updateMany({
      where: {
        target,
        targetKind,
        status: "completed",
        finishedAt: { lt: cutoff },
      },
      data: { status: "expired" },
    })
    .catch(() => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// Managed databases — provision/remove real engine containers.
//
// ponytail scope: host=localhost + a published host port → works from the host
// machine (psql, the dashboard user). App containers inside Docker can't reach
// localhost:<port> (that's their own loopback); inter-container access needs a
// shared `slipway` Docker network attached to both app and db containers, and
// app containers currently publish no ports / join no network. That wiring is
// a follow-up — not faked here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * R6: decrypt a stored DB password. Legacy rows (pre-encryption) are plaintext
 * and pass through unchanged, so nothing breaks on upgrade; new rows are
 * AES-256-GCM and decrypt only at the connection/reveal point.
 */
export function decryptDbPassword(stored: string | null | undefined): string {
  if (!stored) return ""
  try {
    return decryptSecret(stored)
  } catch {
    return stored
  }
}

interface EngineSpec {
  image: (version: string) => string
  internalPort: number
  dataDir: string
  defaultUser: string | null // null = no username (redis/valkey)
  env: (user: string, password: string, dbName: string) => string[]
  cmd?: (password: string) => string[]
  // name of the env var holding the password, for sanity in error messages
  passwordLabel: string
}

const ENGINE_SPECS: Record<string, EngineSpec> = {
  postgres: {
    image: (v) => `postgres:${v}`,
    internalPort: 5432,
    dataDir: "/var/lib/postgresql/data",
    defaultUser: "slipway",
    env: (u, p, d) => [`POSTGRES_USER=${u}`, `POSTGRES_PASSWORD=${p}`, `POSTGRES_DB=${d}`],
    passwordLabel: "POSTGRES_PASSWORD",
  },
  mysql: {
    image: (v) => `mysql:${v}`,
    internalPort: 3306,
    dataDir: "/var/lib/mysql",
    defaultUser: "slipway",
    env: (u, p, d) => [
      `MYSQL_ROOT_PASSWORD=${p}`,
      `MYSQL_USER=${u}`,
      `MYSQL_PASSWORD=${p}`,
      `MYSQL_DATABASE=${d}`,
    ],
    passwordLabel: "MYSQL_PASSWORD",
  },
  mariadb: {
    image: (v) => `mariadb:${v}`,
    internalPort: 3306,
    dataDir: "/var/lib/mysql",
    defaultUser: "slipway",
    env: (u, p, d) => [
      `MARIADB_ROOT_PASSWORD=${p}`,
      `MARIADB_USER=${u}`,
      `MARIADB_PASSWORD=${p}`,
      `MARIADB_DATABASE=${d}`,
    ],
    passwordLabel: "MARIADB_PASSWORD",
  },
  mongodb: {
    image: (v) => `mongo:${v}`,
    internalPort: 27017,
    dataDir: "/data/db",
    defaultUser: "root",
    env: (u, p) => [`MONGO_INITDB_ROOT_USERNAME=${u}`, `MONGO_INITDB_ROOT_PASSWORD=${p}`],
    passwordLabel: "MONGO_INITDB_ROOT_PASSWORD",
  },
  redis: {
    image: (v) => `redis:${v}`,
    internalPort: 6379,
    dataDir: "/data",
    defaultUser: null,
    env: () => [],
    cmd: (p) => ["redis-server", "--requirepass", p],
    passwordLabel: "requirepass",
  },
  valkey: {
    image: (v) => `valkey/valkey:${v}`,
    internalPort: 6379,
    dataDir: "/data",
    defaultUser: null,
    env: () => [],
    cmd: (p) => ["valkey-server", "--requirepass", p],
    passwordLabel: "requirepass",
  },
  mssql: {
    image: (v) => `mcr.microsoft.com/mssql/server:${v}`,
    internalPort: 1433,
    dataDir: "/var/opt/mssql",
    defaultUser: "sa",
    // SA_PASSWORD must be ≥8 chars with upper+lower+digit — genPassword()
    // guarantees that, so the password set here is exactly the one stored on
    // the row. It previously appended "Aa1!" HERE only, so the container's real
    // SA password and the password Slipway revealed (and put in the connection
    // string) differed by that suffix — every revealed MSSQL credential was
    // unusable.
    env: (u, p) => [`ACCEPT_EULA=Y`, `SA_PASSWORD=${p}`, `MSSQL_PID=Express`],
    passwordLabel: "SA_PASSWORD",
  },
}

/**
 * Generate a database password.
 *
 * base64url alone (A-Za-z0-9-_) can, by chance, miss an uppercase or a digit,
 * which MSSQL rejects (it demands 3 of 4 character classes). The fixed "Aa1"
 * tail guarantees upper + lower + digit for every engine while staying free of
 * URI-reserved and shell-metacharacter bytes, so the same value is safe in a
 * connection string, a `--requirepass` argv, and an env var alike.
 */
function genPassword(): string {
  return randomBytes(18).toString("base64url") + "Aa1"
}

function sanitizeDbName(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
  return s || "slipway"
}

function dbContainerName(id: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "db"
  return `slipway-db-${slug}-${id.slice(-6)}`
}

// ponytail: pick a free host port so two engines of the same kind don't both
// try to bind host 5432 (Docker would refuse the second with "port already
// allocated"). Gathers every host port currently bound by any container, then
// returns the preferred port if free, else the first free port in the
// ephemeral range (49152+). Honest — no silent fallback to a colliding port.
async function pickFreePort(docker: Docker, preferred: number): Promise<number> {
  const containers = await docker.listContainers({ all: true })
  const bound = new Set<number>()
  for (const c of containers) {
    for (const p of c.Ports || []) if (p.PublicPort) bound.add(p.PublicPort)
  }
  if (!bound.has(preferred)) return preferred
  for (let candidate = 49152; candidate < 65535; candidate++) {
    if (!bound.has(candidate)) return candidate
  }
  throw new Error("no free host port available (49152–65535 all bound)")
}

/**
 * Provision a real engine container for an existing DatabaseInstance row.
 * Pulls the image, creates + starts the container with credentials env, a
 * named data volume, and a published host port. Updates the row with the real
 * containerId/host/credentials on success; marks status=failed and rethrows on
 * any error (honest — the caller surfaces a 503/500, no fake "running").
 */
export async function realProvisionDatabase(
  dbInstanceId: string,
  actor = "you"
): Promise<void> {
  const spec = await db.databaseInstance.findUnique({ where: { id: dbInstanceId } })
  if (!spec) throw new Error("Database not found")
  const engine = ENGINE_SPECS[spec.kind]
  if (!engine) throw new Error(`Unsupported database engine: ${spec.kind}`)

  const docker = await getDocker()
  const username = engine.defaultUser ?? ""
  const password = genPassword()
  const dbName = sanitizeDbName(spec.name)
  const containerNameStr = dbContainerName(spec.id, spec.name)
  const volumeName = `slipway-db-${spec.id}`

  try {
    // R6: encrypt the DB password at rest. SQLite (slipway.db) is a file on the
    // host that backups/scp/support dumps routinely exfiltrate; a plaintext
    // column there hands out every database root password. Encrypt with the env
    // master key (fail closed if missing); decrypt only when connecting.
    let storedPassword = password
    try {
      storedPassword = encryptSecret(password)
    } catch (e) {
      throw new Error(
        `Cannot provision database: ${(e as Error).message}. Set SLIPWAY_MASTER_KEY so credentials can be stored encrypted.`
      )
    }
    await db.databaseInstance.update({
      where: { id: dbInstanceId },
      data: { status: "restarting", username: username || null, password: storedPassword, dbName },
    })

    await pullImage(docker, engine.image(spec.version))

    // a named volume persists data across container recreation
    try {
      await docker.getVolume(volumeName).inspect()
    } catch {
      await docker.createVolume({ Name: volumeName })
    }

    // ponytail: auto-allocate a free host port. The POST route defaults port to
    // the engine's well-known port (5432…), so without this two postgres DBs
    // would collide on host 5432. Persist the actual port back to the row so the
    // connection string and the dashboard show the real binding.
    const hostPort = await pickFreePort(docker, spec.port || engine.internalPort)
    const env = engine.env(username, password, dbName)
    const created = await docker.createContainer({
      Image: engine.image(spec.version),
      name: containerNameStr,
      ...(engine.cmd ? { Cmd: engine.cmd(password) } : {}),
      Env: env,
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
        // ponytail: without HostIp Docker binds 0.0.0.0, publishing every
        // managed database on all host interfaces — reachable from the public
        // internet whenever the host firewall allows it. Default to loopback;
        // operators who need remote access set SLIPWAY_PUBLIC_HOST / open the
        // port deliberately (credentials reveal already documents that path).
        PortBindings: {
          [`${engine.internalPort}/tcp`]: [
            { HostIp: "127.0.0.1", HostPort: String(hostPort) },
          ],
        },
        Binds: [`${volumeName}:${engine.dataDir}`],
      },
    })
    await created.start()

    // ponytail: a DB engine does its real init (initdb, etc.) AFTER the
    // container "starts" — it can exit a moment later on a bad config, a full
    // disk, or a bad volume. Checking State.Running immediately (as we used to)
    // reported "running" for a container that then crash-looped. Give it a
    // couple seconds to settle, then re-inspect; if it's not stably running,
    // pull the logs and fail honestly.
    await new Promise((r) => setTimeout(r, 2500))
    const info = await created.inspect()
    if (info.State?.Running !== true) {
      let logTail = ""
      try {
        logTail = demuxToString(await created.logs({ stdout: true, stderr: true, follow: false }))
          .split("\n")
          .slice(-6)
          .join(" ")
          .slice(0, 400)
      } catch { /* ignore */ }
      throw new Error(
        `database container exited after start (state: ${info.State?.Status || "exited"}). ${logTail}`.trim()
      )
    }

    await db.databaseInstance.update({
      where: { id: dbInstanceId },
      data: {
        dockerContainerId: created.id,
        host: "localhost",
        port: hostPort,
        internalPort: engine.internalPort,
        status: "running",
      },
    })
    await recordActivity("database", `provisioned ${spec.kind} database "${spec.name}"`, { actor })
    await emit(
      "database.provisioned",
      "database",
      `provisioned ${spec.kind} database "${spec.name}"`,
      {
        title: "Database ready",
        body: `${spec.name} (${spec.kind} ${spec.version}) is running on localhost:${hostPort}.`,
        level: "success",
        kind: "database",
      },
      { actor }
    )
  } catch (e) {
    const msg = (e as Error).message
    await db.databaseInstance.update({
      where: { id: dbInstanceId },
      data: { status: "failed" },
    })
    await emit(
      "database.failed",
      "database",
      `failed to provision ${spec.kind} database "${spec.name}": ${msg}`,
      {
        title: "Database provisioning failed",
        body: `${spec.name}: ${msg}`,
        level: "error",
        kind: "database",
      },
      { actor }
    )
    throw e
  }
}

/**
 * Stop + remove the database container. If removeData, also drop the named
 * volume (irreversible). Best-effort on the container/volume side; the row is
 * deleted by the caller regardless.
 */
export async function realRemoveDatabase(
  dbInstanceId: string,
  removeData: boolean,
  actor = "you"
): Promise<void> {
  const row = await db.databaseInstance.findUnique({ where: { id: dbInstanceId } })
  if (!row) return
  const volumeName = `slipway-db-${row.id}`

  // only touch Docker if the engine is actually up
  const { isDockerAvailable } = await import("./docker")
  if (await isDockerAvailable()) {
    const docker = await getDocker().catch(() => null)
    if (docker) {
      if (row.dockerContainerId) {
        try {
          const c = docker.getContainer(row.dockerContainerId)
          await c.remove({ force: true })
        } catch {
          /* container already gone */
        }
      }
      if (removeData) {
        try {
          await docker.getVolume(volumeName).remove({ force: true })
        } catch {
          /* volume already gone */
        }
      }
    }
  }

  await recordActivity("database", `removed ${row.kind} database "${row.name}"`, { actor })
  await emit(
    "database.deleted",
    "database",
    `removed ${row.kind} database "${row.name}"`,
    {
      title: "Database removed",
      body: `${row.name} was removed${removeData ? " (data volume deleted)" : ""}.`,
      level: "info",
      kind: "database",
    },
    { actor }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Host scan — discover existing Docker containers/volumes on the host and
// import them as Slipway resources so a freshly-installed Slipway can manage
// workloads that were already running (not just ones it created).
//
// Honest scope:
//  - containers → Projects (image source) or DatabaseInstance (DB images),
//    linked to the real containerId so restart/stop/remove act on the real
//    container. Slipway did NOT create these, so for DBs it records no
//    password (status "external"); the credentials route says so honestly.
//  - volumes → Volume rows (size best-effort 0; Docker doesn't report usage
//    without a stat call per-volume).
//  - domains / SSL → detected from the container's `traefik.http.routers.*`
//    labels (Host() + tls). On this host Traefik routes by reading those same
//    labels, so reading them is the honest way to surface imported domains.
//    Other proxies (Caddy / proxy-manager) are a follow-up.
//  - skip Slipway-managed resources (name prefix `slipway-`) and anything
//    already imported (matched by dockerContainerId / volume name).
// ─────────────────────────────────────────────────────────────────────────────

const DB_IMAGE_MATCHERS: { kind: string; test: (image: string) => boolean }[] = [
  { kind: "postgres", test: (i) => /^postgres(:|@|$)/.test(i) || i.includes("/postgres:") },
  { kind: "mysql", test: (i) => /^mysql(:|@|$)/.test(i) },
  { kind: "mariadb", test: (i) => /^mariadb(:|@|$)/.test(i) || i.includes("/mariadb:") },
  { kind: "mongodb", test: (i) => /^mongo(:|@|$)/.test(i) },
  { kind: "redis", test: (i) => /^redis(:|@|$)/.test(i) || i.includes("/redis:") },
  { kind: "valkey", test: (i) => /^valkey(:|@|$)/.test(i) || i.includes("/valkey:") },
  { kind: "mssql", test: (i) => i.includes("mssql/server") },
]

const DB_DEFAULT_PORT: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
  valkey: 6379,
  mssql: 1433,
}

function detectDbKind(image: string): string | null {
  const repo = image.split(":")[0].split("@")[0].split("/").pop() || ""
  for (const m of DB_IMAGE_MATCHERS) {
    if (m.test(image) || m.test(repo)) return m.kind
  }
  return null
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app"
}

function statusFromState(state: string): string {
  if (state === "running") return "running"
  if (state === "restarting") return "restarting"
  if (state === "paused") return "paused"
  return "stopped"
}

// Parse `traefik.http.routers.<r>.rule` + `*.tls` labels off a container into
// { hostname, tls } pairs. A rule can be `Host(\`a.com\`) && Host(\`b.com\`)` or
// `HostRegexp` etc.; we extract every `Host(\`x\`)` occurrence. tls is on when
// any router for the container has `traefik.http.routers.<r>.tls` set.
// ponytail: the router NAME must be discovered from the `.rule` label too, not
// just the bare `traefik.http.routers.<r>` enable label. Real Traefik setups
// usually define a router by its `.rule` (and `.tls`) labels WITHOUT a bare
// enable label, so the old matcher found zero routers and the scan surfaced no
// domains — the "existing servers/domains with SSL don't appear" bug.
function detectTraefikDomains(labels: Record<string, string>): { hostname: string; tls: boolean }[] {
  const routerNames = new Set<string>()
  const tlsRouter = new Set<string>()
  for (const k of Object.keys(labels)) {
    // bare enable label: traefik.http.routers.<r>
    const m = k.match(/^traefik\.http\.routers\.([^.]+)$/)
    if (m) routerNames.add(m[1])
    // the rule label itself: traefik.http.routers.<r>.rule  (the common case)
    const rm = k.match(/^traefik\.http\.routers\.([^.]+)\.rule$/)
    if (rm) routerNames.add(rm[1])
    const tm = k.match(/^traefik\.http\.routers\.([^.]+)\.tls$/)
    if (tm) tlsRouter.add(tm[1])
  }
  const out = new Map<string, boolean>()
  for (const r of routerNames) {
    const rule = labels[`traefik.http.routers.${r}.rule`]
    if (!rule) continue
    const tls = tlsRouter.has(r)
    // match Host(`x`) and Host(`x`) with backtick delimiters
    const re = /Host\(\s*`([^`]+)`\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rule)) !== null) {
      const h = m[1].trim()
      if (h) out.set(h, tls || out.get(h) === true)
    }
  }
  return [...out.entries()].map(([hostname, tls]) => ({ hostname, tls }))
}

export async function realScanHost(actor = "you"): Promise<{
  projects: number
  databases: number
  volumes: number
  domains: number
  skipped: number
}> {
  const docker = await getDocker()
  const result = { projects: 0, databases: 0, volumes: 0, domains: 0, skipped: 0 }

  // --- containers ---
  const containers = await docker.listContainers({ all: true })
  // ponytail: map imported container id -> project id. The old scan SKIPPED
  // already-imported containers entirely, so a second scan (or one run after
  // Traefik labels were added) never discovered their domains — "existing
  // servers/domains with SSL don't appear." Now we re-scan domains for already
  // imported projects too (deduped against existing Domain rows), and only skip
  // importing a duplicate project row.
  const existingProjectByContainer = new Map<string, string>(
    (await db.project.findMany({ where: { dockerContainerId: { not: null } }, select: { id: true, dockerContainerId: true } }))
      .map((p) => [p.dockerContainerId as string, p.id] as [string, string])
  )
  const existingDbContainers = new Set(
    (await db.databaseInstance.findMany({ where: { dockerContainerId: { not: null } }, select: { dockerContainerId: true } }))
      .map((d) => d.dockerContainerId as string)
  )

  for (const c of containers) {
    const name = (c.Names?.[0] || "").replace(/^\//, "")
    // skip Slipway-managed containers + already-imported DATABASE containers
    // (databases are imported once; re-scanning them is pointless and would
    // create duplicate rows).
    if (name.startsWith("slipway-") || existingDbContainers.has(c.Id)) {
      result.skipped++
      continue
    }
    const labels = c.Labels || {}
    const domains = detectTraefikDomains(labels)

    // already-imported PROJECT container: don't re-import, but DO re-scan its
    // domains (merge/dedupe). This is the fix for "existing domains don't
    // appear" — labels added after the first import are now picked up.
    const existingProjectId = existingProjectByContainer.get(c.Id)
    if (existingProjectId) {
      if (domains.length) {
        const existingHosts = new Set(
          (await db.domain.findMany({ where: { projectId: existingProjectId }, select: { hostname: true } }))
            .map((d) => d.hostname)
        )
        for (const d of domains) {
          if (!existingHosts.has(d.hostname)) {
            await db.domain.create({
              data: {
                projectId: existingProjectId,
                hostname: d.hostname,
                type: "primary",
                ssl: d.tls ? "managed" : "disabled",
                https: d.tls,
                status: "active",
              },
            })
            result.domains++
          }
        }
      }
      result.skipped++
      continue
    }

    const image = c.Image || ""
    const dbKind = detectDbKind(image)
    // ponytail: record the ACTUAL published host port. When the container
    // publishes nothing on the host, store 0 (sentinel = "not published") — NOT
    // the internal engine port, which would make the credentials route emit a
    // misleading `104.214.169.39:5432` external string for a DB that isn't
    // reachable from outside.
    const publicPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort ?? 0

    if (dbKind) {
      await db.databaseInstance.create({
        data: {
          name: name || `${dbKind}-${c.Id.slice(0, 6)}`,
          kind: dbKind,
          version: image.split(":")[1]?.split("@")[0] || "latest",
          status: "external", // imported — Slipway didn't provision it, has no password
          host: "localhost",
          port: publicPort, // 0 = not published on a host port
          dockerContainerId: c.Id,
          username: null,
          password: null,
          dbName: null,
          internalPort: DB_DEFAULT_PORT[dbKind] ?? null,
        },
      })
      result.databases++
    } else {
      const base = slugify(name || image.split(":")[0].split("/").pop() || "app")
      let slug = base
      let n = 1
      while (await db.project.findUnique({ where: { slug } })) {
        slug = `${base}-${++n}`
      }
      const created = await db.project.create({
        data: {
          name: name || image.split(":")[0].split("/").pop() || "imported-app",
          slug,
          source: "image",
          stack: "dockerfile",
          stackLabel: `Docker image · ${image}`,
          framework: "Docker",
          environment: "production",
          status: statusFromState(c.State || "stopped"),
          region: "local",
          dockerImage: image,
          dockerContainerId: c.Id,
          url: publicPort ? `http://localhost:${publicPort}` : null,
          description: "Imported from an existing container on the host via Scan.",
        },
      })
      result.projects++
      // ponytail: detect domains/SSL from the container's Traefik labels. Domains
      // live in the reverse proxy, and on this host Traefik routes by reading
      // `traefik.http.routers.<r>.rule=Host(\`x\`)` + `*.tls` labels off each
      // container — so reading the same labels is the honest way to surface
      // imported domains. (Caddy/proxy-manager readers are a follow-up.)
      for (const d of domains) {
        await db.domain.create({
          data: {
            projectId: created.id,
            hostname: d.hostname,
            type: "primary",
            ssl: d.tls ? "managed" : "disabled",
            https: d.tls,
            status: "active",
          },
        })
        result.domains++
      }
    }
  }

  // --- volumes ---
  const volList = await docker.listVolumes()
  const existingVolNames = new Set(
    (await db.volume.findMany({ where: { dockerVolumeName: { not: null } }, select: { dockerVolumeName: true } }))
      .map((v) => v.dockerVolumeName as string)
  )
  for (const v of volList.Volumes || []) {
    const vname = v.Name || ""
    if (!vname || vname.startsWith("slipway-db-") || existingVolNames.has(vname)) {
      result.skipped++
      continue
    }
    await db.volume.create({
      data: {
        name: vname,
        dockerVolumeName: vname,
        sizeGb: 20,
        usedGb: 0,
        server: "local",
      },
    })
    result.volumes++
  }

  await recordActivity("system", `scanned host: imported ${result.projects} app(s), ${result.databases} database(s), ${result.volumes} volume(s), ${result.domains} domain(s)`, { actor })
  await emit(
    "system",
    "system",
    `host scan imported ${result.projects} app(s), ${result.databases} database(s), ${result.volumes} volume(s), ${result.domains} domain(s)`,
    {
      title: "Host scan complete",
      body: `Found ${result.projects + result.databases + result.volumes + result.domains} resource(s): ${result.projects} app(s), ${result.databases} database(s), ${result.volumes} volume(s), ${result.domains} domain(s) (${result.skipped} already managed).`,
      level: "success",
      kind: "system",
    },
    { actor }
  )
  return result
}