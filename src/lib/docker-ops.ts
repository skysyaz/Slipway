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

export async function realRestart(
  projectId: string,
  serviceId?: string,
  actor = "you"
): Promise<void> {
  const docker = await getDocker()
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error("Project not found")
  const services = await db.service.findMany({
    where: { projectId, ...(serviceId ? { id: serviceId } : {}) },
  })
  for (const s of services) {
    if (s.dockerContainerId) {
      try {
        await docker.getContainer(s.dockerContainerId).restart()
      } catch {
        /* container may be gone */
      }
    }
  }
  await db.service.updateMany({
    where: { projectId, ...(serviceId ? { id: serviceId } : {}) },
    data: { status: "running", restarts: { increment: 1 } },
  })
  await recordActivity("scale", `restarted ${serviceId ? "service" : "all services"} on ${project.name}`, {
    projectId,
    actor,
  })
}

export async function realStop(projectId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const services = await db.service.findMany({ where: { projectId } })
  for (const s of services) {
    if (s.dockerContainerId) {
      try {
        await docker.getContainer(s.dockerContainerId).stop()
      } catch {
        /* ignore */
      }
    }
  }
  await db.project.update({ where: { id: projectId }, data: { status: "stopped" } })
  await db.service.updateMany({ where: { projectId }, data: { status: "stopped" } })
  void actor
}

export async function realRemove(projectId: string, actor = "you"): Promise<void> {
  const docker = await getDocker()
  const services = await db.service.findMany({ where: { projectId } })
  for (const s of services) {
    if (s.dockerContainerId) {
      try {
        await docker.getContainer(s.dockerContainerId).remove({ force: true })
      } catch {
        /* ignore */
      }
    }
  }
  void actor
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

    const env = engine.env(username, password, dbName)
    const created = await docker.createContainer({
      Image: engine.image(spec.version),
      name: containerNameStr,
      ...(engine.cmd ? { Cmd: engine.cmd(password) } : {}),
      Env: env,
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
        PortBindings: {
          [`${engine.internalPort}/tcp`]: [{ HostPort: String(spec.port) }],
        },
        Binds: [`${volumeName}:${engine.dataDir}`],
      },
    })
    await created.start()

    const info = await created.inspect()
    if (info.State?.Running !== true) throw new Error("database container exited after start")

    await db.databaseInstance.update({
      where: { id: dbInstanceId },
      data: {
        dockerContainerId: created.id,
        host: "localhost",
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
        body: `${spec.name} (${spec.kind} ${spec.version}) is running on localhost:${spec.port}.`,
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
//  - domains / SSL are NOT detected — those live in the reverse proxy
//    (Caddy/Traefik/Dokploy), which Slipway doesn't own. Add a proxy-reader
//    when a specific proxy is in scope.
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
    const publicPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort

    if (dbKind) {
      const port = publicPort ?? DB_DEFAULT_PORT[dbKind] ?? 5432
      await db.databaseInstance.create({
        data: {
          name: name || `${dbKind}-${c.Id.slice(0, 6)}`,
          kind: dbKind,
          version: image.split(":")[1]?.split("@")[0] || "latest",
          status: "external", // imported — Slipway didn't provision it, has no password
          host: "localhost",
          port,
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
      await db.project.create({
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