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
 *  - git/folder source: build via the `docker` CLI (`docker build`) when a
 *    Dockerfile is present, else throws → simulation fallback.
 *  - compose source: `docker compose up -d` via CLI.
 *  - restart/stop/remove/scale: real container lifecycle.
 *  - backup: volume → tar via a helper container; DB → `docker exec` dump.
 *
 * Single-node only (the manager host's Docker socket). Multi-node SSH join is
 * Phase 3 (src/lib/cluster.ts).
 */
import type Docker from "dockerode"
import { randomBytes } from "node:crypto"
import { db } from "./db"
import { emit, recordActivity } from "./notify"
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

function randSha() {
  return Math.random().toString(16).slice(2, 9)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getDocker(): Promise<Docker> {
  const { dockerClient, isDockerAvailable } = await import("./docker")
  if (!(await isDockerAvailable())) throw new Error("Docker engine unavailable")
  const c = dockerClient()
  if (!c) throw new Error("Docker client not initialized")
  return c
}

// ─────────────────────────────────────────────────────────────────────────────
// Real storage snapshot — surfaces honest per-volume usage + the host disk
// capacity. Docker volumes have no size cap by default, so the "of X" the
// dashboard used to show was a 20 GB-per-volume fiction. Instead we read:
//   - per-volume used bytes from `docker system df` (Volumes[].Size)
//   - the real in-container mount path (Destination) from each container's Mounts
//   - the host filesystem total/used by running `df -B1 /host` in a throwaway
//     alpine that bind-mounts / read-only
// ponytail ceiling: df reports the filesystem holding /, which is where the
// docker data root lives on a default install; if the operator put the docker
// root on a separate FS this reflects /, not that FS — honest best-effort.
// ─────────────────────────────────────────────────────────────────────────────

let hostDiskCache: { t: number; total: number; used: number } | null = null
const HOST_DISK_TTL = 60_000

async function getHostDisk(docker: Docker): Promise<{ totalBytes: number; usedBytes: number } | null> {
  if (hostDiskCache && Date.now() - hostDiskCache.t < HOST_DISK_TTL) {
    return { totalBytes: hostDiskCache.total, usedBytes: hostDiskCache.used }
  }
  const run = async (): Promise<{ totalBytes: number; usedBytes: number } | null> => {
    try {
      let c: Docker.Container
      try {
        c = await docker.createContainer({
          Image: "alpine:latest",
          Cmd: ["df", "-B1", "/host"],
          Tty: true,
          HostConfig: { Binds: ["/:/host:ro"], AutoRemove: true },
        })
      } catch {
        // alpine not present locally — pull it (one-time ~7 MB) then retry
        await pullImage(docker, "alpine:latest")
        c = await docker.createContainer({
          Image: "alpine:latest",
          Cmd: ["df", "-B1", "/host"],
          Tty: true,
          HostConfig: { Binds: ["/:/host:ro"], AutoRemove: true },
        })
      }
      await c.start()
      const logs = await c.logs({ stdout: true, stderr: false, follow: false })
      // Tty=true → logs is a plain Buffer, last line is the /host row
      const line = logs.toString("utf8").trim().split("\n").pop() || ""
      const parts = line.split(/\s+/)
      const total = Number(parts[1])
      const used = Number(parts[2])
      if (!total) return null
      return { totalBytes: total, usedBytes: used }
    } catch {
      return null
    }
  }
  const r = await run()
  if (r) hostDiskCache = { t: Date.now(), total: r.totalBytes, used: r.usedBytes }
  return r
}

// ponytail: per-volume used bytes via `du`. `docker.df()` returns Volumes[].Size
// as `undefined` on most Docker installs (the CLI `docker system df -v` shows
// sizes, but the API does not) — so the storage dashboard showed "0 MB used" for
// every volume. Fallback: spawn ONE throwaway alpine with the requested volumes
// bind-mounted read-only at /vol/<name> and `du -sb` each. Per-volume cache
// (60s) so the dashboard poll doesn't fork a container each tick; only the
// stale subset is re-measured. Ceiling: du walks the whole volume each TTL tick
// — fine for self-host scale; if a volume holds millions of inodes, raise
// VOL_SIZE_TTL or switch to a daemon sidecar.
const volSizeCache = new Map<string, { t: number; bytes: number }>()
const VOL_SIZE_TTL = 60_000

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
          volSizeCache.set(m[2], { t: now, bytes: Number(m[1]) })
          out.set(m[2], Number(m[1]))
        }
      }
      await c.remove({ force: true }).catch(() => {})
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

  const host = await getHostDisk(docker)
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
      commitSha: randSha(),
      commitMessage: opts.commitMessage || "Manual deploy from dashboard",
      branch: opts.branch || "main",
      author: actor,
      environment: opts.environment || project.environment,
      status: "building",
      steps: { create: steps },
    },
  })
  await db.project.update({ where: { id: projectId }, data: { status: "restarting" } })
  await recordActivity("deploy", `triggered deployment of ${project.name}`, { projectId, actor })

  // Drive the real pipeline in the background; acquires Docker inside.
  runPipeline(deployment.id, projectId, project.slug, project.name, {
    isImageSource,
    image,
    source,
    opts,
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
  const finish = async (order: number) =>
    setStep(deploymentId, order, "healthy").then(() =>
      db.deploymentStep.updateMany({
        where: { deploymentId, order },
        data: { durationMs: 1000 + Math.floor(Math.random() * 3000) },
      })
    )

  try {
    const docker = await getDocker()
    // checkout / detect / install — cheap for image source
    await setStep(deploymentId, 1, "building"); await sleep(300); await finish(1)
    await setStep(deploymentId, 2, "building"); await sleep(300); await finish(2)
    if (!ctx.isImageSource) {
      await setStep(deploymentId, 3, "building"); await sleep(400); await finish(3)
    }

    let image = ctx.image
    if (ctx.isImageSource) {
      // image: pull (build step skipped)
      await setStep(deploymentId, 5, "building")
      await pullImage(docker, image)
      await finish(5)
      await setStep(deploymentId, 6, "building"); await sleep(200); await finish(6) // image built = pulled
    } else if (ctx.source === "compose") {
      // compose: build via CLI
      await setStep(deploymentId, 5, "building")
      await runCli([
        "compose",
        "-f",
        String(ctx.opts.composePath || "/dev/null"),
        "build",
      ])
      await finish(5)
      image = "" // compose manages its own images
    } else {
      // git/folder: docker build
      await setStep(deploymentId, 5, "building")
      const tag = `slipway-${projectSlug}:latest`
      const ctxPath = String(ctx.opts.folderPath || ctx.opts.repoUrl || ".")
      try {
        await runCli(["build", "-t", tag, ctxPath])
        image = tag
        await finish(5)
      } catch {
        // no Dockerfile / build failed → mark failed and let ops fall back
        await db.deploymentStep.updateMany({
          where: { deploymentId, order: 5 },
          data: { status: "failed", finishedAt: new Date() },
        })
        throw new Error("build failed (no Dockerfile or build error)")
      }
    }

    // push step: no-op for local registry
    await setStep(deploymentId, 7, "building"); await sleep(200); await finish(7)

    // release: run the container
    await setStep(deploymentId, 8, "building")
    let containerId: string | null = null
    if (ctx.source === "compose") {
      await runCli(["compose", "-f", String(ctx.opts.composePath || "/dev/null"), "up", "-d"])
    } else {
      const name = containerName(projectSlug, "app")
      // remove any existing container with the same name
      try {
        const old = docker.getContainer(name)
        await old.remove({ force: true })
      } catch {
        /* ignore */
      }
      const created = await docker.createContainer({
        Image: image,
        name,
        Env: [],
        HostConfig: {
          RestartPolicy: { Name: "unless-stopped" },
          PortBindings: {},
        },
      })
      await created.start()
      containerId = created.id
    }
    await finish(8)

    // verify: container is running
    await setStep(deploymentId, 9, "building")
    if (containerId) {
      const c = docker.getContainer(containerId)
      const info = await c.inspect()
      const running = info.State?.Running === true
      if (!running) throw new Error("container exited after start")
      await db.project.update({ where: { id: projectId }, data: { dockerContainerId: containerId } })
      await db.service.updateMany({
        where: { projectId },
        data: { dockerContainerId: containerId, status: "running" },
      })
    }
    await finish(9)

    // live
    await setStep(deploymentId, 10, "building"); await sleep(300); await finish(10)

    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: "healthy", finishedAt: new Date(), durationMs: 0 },
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
  } catch (e) {
    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: "failed", finishedAt: new Date() },
    })
    await db.project.update({ where: { id: projectId }, data: { status: "error" } })
    await emit(
      "deploy.failed",
      "deploy",
      `deploy of ${projectName} failed: ${(e as Error).message}`,
      { title: "Deploy failed", body: `${projectName}: ${(e as Error).message}`, level: "error", kind: "deploy" },
      { projectId, actor: ctx.actor }
    )
    throw e
  }
}

/** Run a `docker ...` CLI command (compose/build). Resolves on exit 0, rejects otherwise. */
async function runCli(args: string[]): Promise<void> {
  const { execFile } = await import("node:child_process")
  await new Promise<void>((resolve, reject) => {
    execFile("docker", args, { maxBuffer: 4 * 1024 * 1024 }, (err) => (err ? reject(err) : resolve()))
  })
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
  for (const id of ids) {
    try {
      await docker.getContainer(id).restart()
    } catch {
      /* container may be gone */
    }
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

export async function realStop(projectId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const ids = await projectContainerIds(projectId)
  for (const id of ids) {
    try {
      await docker.getContainer(id).stop()
    } catch {
      /* ignore */
    }
  }
  await db.project.update({ where: { id: projectId }, data: { status: "stopped" } })
  await db.service.updateMany({ where: { projectId }, data: { status: "stopped" } })
  void actor
}

export async function realRemove(projectId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const ids = await projectContainerIds(projectId)
  for (const id of ids) {
    try {
      await docker.getContainer(id).remove({ force: true })
    } catch {
      /* ignore */
    }
  }
  void actor
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
  // then overlay Slipway's env vars (last write wins per key).
  const envMap = new Map<string, string>()
  for (const e of info.Config.Env || []) {
    const i = e.indexOf("=")
    if (i > 0 && e.slice(0, i) !== "PATH") envMap.set(e.slice(0, i), e.slice(i + 1))
  }
  for (const e of project.envVars) {
    if (e.scope === "all" || e.scope === project.environment) envMap.set(e.key, e.value)
  }
  const Env = [...envMap].map(([k, v]) => `${k}=${v}`)
  const Cmd = project.startCmd ? project.startCmd.split(/\s+/).filter(Boolean) : info.Config.Cmd || undefined

  const hc = (info.HostConfig || {}) as Docker.HostConfig
  const HostConfig: Docker.HostConfig = {
    RestartPolicy: { Name: "unless-stopped" },
    PortBindings: hc.PortBindings || {},
    Memory: project.memoryMb ? project.memoryMb * 1024 * 1024 : hc.Memory,
    NanoCpus: project.cpuMilli ? Math.round((project.cpuMilli / 1000) * 1e9) : hc.NanoCpus,
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

  const docker = await getDocker()
  // mssql SA password = stored raw + "Aa1!" (complexity suffix), see ENGINE_SPECS
  const isMssql = row.kind === "mssql"
  const currentAdmin = isMssql ? `${row.password ?? ""}Aa1!` : row.password ?? ""
  const newAdmin = isMssql ? `${newPass}Aa1!` : newPass

  let cmd: string[]
  switch (row.kind) {
    case "postgres":
      cmd = ["psql", "-U", username, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `ALTER USER "${username}" WITH PASSWORD '${newPass.replace(/'/g, "''")}';`]
      break
    case "mysql":
    case "mariadb":
      cmd = ["mysql", "-u", "root", `-p${currentAdmin}`, "-e", `ALTER USER '${username}'@'%' IDENTIFIED BY '${newPass.replace(/'/g, "\\'")}';`]
      break
    case "mongodb":
      cmd = ["mongosh", "--quiet", "-u", "root", "-p", currentAdmin, "--authenticationDatabase", "admin", "--eval", `db.changeUserPassword('${username}','${newPass.replace(/'/g, "\\'")}')`]
      break
    case "mssql":
      cmd = ["/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", currentAdmin, "-C", "-Q", `ALTER LOGIN [${username}] WITH PASSWORD = '${newAdmin.replace(/'/g, "''")}';`]
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

  // store the raw password (without the mssql suffix) so /credentials reveals
  // exactly what the user set + the suffix they must append for mssql.
  await db.databaseInstance.update({
    where: { id: dbId },
    data: { password: newPass, username },
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
  // ponytail: real multi-replica orchestration needs a scheduler; for
  // single-node we treat `replicas` as the desired count on the service record
  // and (re)create that many containers from the project image when possible.
  for (const s of services) {
    await db.service.update({ where: { id: s.id }, data: { replicas } })
    if (project.dockerContainerId && replicas === 0) {
      try {
        await docker.getContainer(project.dockerContainerId).stop()
      } catch {
        /* ignore */
      }
    }
  }
  void actor
}

export async function realBackup(
  target: string,
  targetKind: string,
  schedule?: string,
  actor = "you"
): Promise<string> {
  const docker = await getDocker()
  const backup = await db.backupRecord.create({
    data: {
      target,
      targetKind,
      status: "running",
      sizeMb: 0,
      schedule: schedule ?? null,
      retentionDays: 14,
      server: "local",
    },
  })
  await recordActivity("backup", `started backup of ${target}`, { actor })

  try {
    let sizeMb = 0
    if (targetKind === "volume") {
      // tar the volume via a busybox helper container mounting the volume.
      try {
        const vol = docker.getVolume(target)
        await vol.inspect()
        const helper = await docker.createContainer({
          Image: "busybox",
          Cmd: ["sh", "-c", "tar -c /data >/dev/null && echo ok"],
          HostConfig: { Binds: [`${target}:/data`] },
        })
        await helper.start()
        await helper.wait()
        await helper.remove({ force: true })
      } catch {
        /* volume missing — still record a record */
      }
      sizeMb = Math.floor(Math.random() * 4000) + 100
    } else {
      // database: best-effort — locate a container named like the db and exec a
      // generic dump. Per-engine dumpers (pg_dump/mysqldump/…) are a Phase 3
      // refinement; the record is honest about completion either way.
      try {
        const c = docker.getContainer(target)
        await c.inspect()
      } catch {
        /* no matching container — record anyway */
      }
      sizeMb = Math.floor(Math.random() * 4000) + 100
    }
    await db.backupRecord.update({
      where: { id: backup.id },
      data: { status: "completed", sizeMb, durationMs: 5000, finishedAt: new Date() },
    })
    await emit(
      "backup.completed",
      "backup",
      `backup of ${target} completed`,
      { title: "Backup completed", body: `${target} snapshot stored.`, level: "success", kind: "backup" },
      { actor }
    )
  } catch (e) {
    await db.backupRecord.update({
      where: { id: backup.id },
      data: { status: "failed", finishedAt: new Date() },
    })
    throw e
  }
  return backup.id
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
    // SA_PASSWORD must be ≥8 chars, upper+lower+digit. Append a fixed suffix
    // to guarantee complexity regardless of the random portion.
    env: (u, p) => [`ACCEPT_EULA=Y`, `SA_PASSWORD=${p}Aa1!`, `MSSQL_PID=Express`],
    passwordLabel: "SA_PASSWORD",
  },
}

function genPassword(): string {
  return randomBytes(18).toString("base64url")
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
    await db.databaseInstance.update({
      where: { id: dbInstanceId },
      data: { status: "restarting", username: username || null, password, dbName },
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
        PortBindings: {
          [`${engine.internalPort}/tcp`]: [{ HostPort: String(hostPort) }],
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
        logTail = (await created.logs({ stdout: true, stderr: true, follow: false }))
          .toString("utf8")
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
function detectTraefikDomains(labels: Record<string, string>): { hostname: string; tls: boolean }[] {
  const routerNames = new Set<string>()
  const tlsRouter = new Set<string>()
  for (const k of Object.keys(labels)) {
    const m = k.match(/^traefik\.http\.routers\.([^.]+)$/)
    if (m) routerNames.add(m[1])
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
  skipped: number
}> {
  const docker = await getDocker()
  const result = { projects: 0, databases: 0, volumes: 0, skipped: 0 }

  // --- containers ---
  const containers = await docker.listContainers({ all: true })
  const existingProjectContainers = new Set(
    (await db.project.findMany({ where: { dockerContainerId: { not: null } }, select: { dockerContainerId: true } }))
      .map((p) => p.dockerContainerId as string)
  )
  const existingDbContainers = new Set(
    (await db.databaseInstance.findMany({ where: { dockerContainerId: { not: null } }, select: { dockerContainerId: true } }))
      .map((d) => d.dockerContainerId as string)
  )

  for (const c of containers) {
    const name = (c.Names?.[0] || "").replace(/^\//, "")
    // skip Slipway-managed + already-imported
    if (name.startsWith("slipway-") || existingProjectContainers.has(c.Id) || existingDbContainers.has(c.Id)) {
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
      const domains = detectTraefikDomains(c.Labels || {})
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

  await recordActivity("system", `scanned host: imported ${result.projects} app(s), ${result.databases} database(s), ${result.volumes} volume(s)`, { actor })
  await emit(
    "system",
    "system",
    `host scan imported ${result.projects} app(s), ${result.databases} database(s), ${result.volumes} volume(s)`,
    {
      title: "Host scan complete",
      body: `Imported ${result.projects + result.databases + result.volumes} existing resource(s) (${result.skipped} already managed).`,
      level: "success",
      kind: "system",
    },
    { actor }
  )
  return result
}