/**
 * Server-side serializers: Prisma rows → the exact shapes the frontend
 * expects (src/lib/slipway/types.ts). Keeps view components unchanged.
 */
import type { Prisma } from "@prisma/client"

type ProjectRow = Prisma.ProjectGetPayload<{
  include: {
    services: true
    domains: true
    envVars: true
  }
}>

const iso = (d: Date | null | undefined): string | undefined =>
  d ? d.toISOString() : undefined

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    source: p.source,
    repoUrl: p.repoUrl ?? undefined,
    folderPath: p.folderPath ?? undefined,
    stack: p.stack,
    stackLabel: p.stackLabel,
    framework: p.framework ?? undefined,
    environment: p.environment,
    status: p.status,
    lastDeployedAt: p.lastDeployedAt ? p.lastDeployedAt.toISOString() : "",
    url: p.url ?? undefined,
    description: p.description ?? undefined,
    services: p.services.map(serializeService),
    domains: p.domains.map(serializeDomain),
    envVarsCount: p.envVars.length,
    envVars: p.envVars.map((e) => ({
      id: e.id,
      key: e.key,
      value: e.masked ? "" : e.value,
      scope: e.scope,
      masked: e.masked,
    })),
    monthlyDeploys: p.monthlyDeploys,
    successRate: p.successRate,
    region: p.region,
    memoryMb: p.memoryMb,
    cpuMilli: p.cpuMilli,
    replicas: p.replicas,
    monorepo: p.monorepo,
    monorepoPath: p.monorepoPath ?? undefined,
    // deploy policy (used by project settings tab)
    autoDeploy: p.autoDeploy,
    requireTests: p.requireTests,
    autoRollback: p.autoRollback,
    pauseDuringWindows: p.pauseDuringWindows,
    prPreviews: p.prPreviews,
    minReplicas: p.minReplicas,
    maxReplicas: p.maxReplicas,
    buildCmd: p.buildCmd ?? undefined,
    startCmd: p.startCmd ?? undefined,
    paused: p.paused,
    dockerImage: p.dockerImage ?? undefined,
  }
}

export function serializeService(s: {
  id: string
  name: string
  kind: string
  status: string
  image: string
  port: number | null
  replicas: number
  memoryMb: number
  cpuMilli: number
  uptimeSeconds: number
  restarts: number
}) {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    status: s.status,
    image: s.image,
    port: s.port ?? undefined,
    replicas: s.replicas,
    memoryMb: s.memoryMb,
    cpuMilli: s.cpuMilli,
    uptimeSeconds: s.uptimeSeconds,
    restarts: s.restarts,
  }
}

export function serializeDomain(d: {
  id: string
  projectId: string
  hostname: string
  type: string
  ssl: string
  sslExpiry: Date | null
  https: boolean
  status: string
}) {
  return {
    id: d.id,
    hostname: d.hostname,
    projectId: d.projectId,
    type: d.type,
    ssl: d.ssl,
    sslExpiry: iso(d.sslExpiry),
    https: d.https,
    status: d.status,
  }
}

type DeploymentRow = Prisma.DeploymentGetPayload<{ include: { steps: true } }>

export function serializeDeployment(d: DeploymentRow, projectName?: string) {
  return {
    id: d.id,
    projectId: d.projectId,
    projectName: projectName ?? d.projectId,
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    branch: d.branch,
    author: d.author,
    environment: d.environment,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    finishedAt: iso(d.finishedAt),
    durationMs: d.durationMs ?? undefined,
    steps: d.steps
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        stage: s.stage,
        label: s.label,
        status: s.status,
        startedAt: iso(s.startedAt),
        finishedAt: iso(s.finishedAt),
        durationMs: s.durationMs ?? undefined,
        logLines: s.logLines,
      })),
    rollbackOfId: d.rollbackOfId ?? undefined,
    url: d.url ?? undefined,
  }
}

export function serializeDatabase(d: {
  id: string
  name: string
  kind: string
  version: string
  status: string
  projectId: string | null
  host: string
  port: number
  storageGb: number
  usedGb: number
  connections: number
  maxConnections: number
  backupsEnabled: boolean
  region: string
  createdAt: Date
}) {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    version: d.version,
    status: d.status,
    projectId: d.projectId ?? undefined,
    host: d.host,
    port: d.port,
    storageGb: d.storageGb,
    usedGb: d.usedGb,
    connections: d.connections,
    maxConnections: d.maxConnections,
    backupsEnabled: d.backupsEnabled,
    region: d.region,
    createdAt: d.createdAt.toISOString(),
  }
}

export function serializeVolume(v: {
  id: string
  name: string
  projectId: string | null
  mountPath: string
  sizeGb: number
  usedGb: number
  type: string
  server: string
  encrypted: boolean
}) {
  return {
    id: v.id,
    name: v.name,
    projectId: v.projectId ?? undefined,
    mountPath: v.mountPath,
    sizeGb: v.sizeGb,
    usedGb: v.usedGb,
    type: v.type,
    server: v.server,
    encrypted: v.encrypted,
  }
}

export function serializeServer(s: {
  id: string
  name: string
  hostname: string
  ip: string
  role: string
  status: string
  os: string
  cpuCores: number
  memoryGb: number
  diskGb: number
  diskUsedGb: number
  dockerVersion: string
  region: string
  uptimeHours: number
}) {
  return {
    id: s.id,
    name: s.name,
    hostname: s.hostname,
    ip: s.ip,
    role: s.role,
    status: s.status,
    os: s.os,
    cpuCores: s.cpuCores,
    memoryGb: s.memoryGb,
    diskGb: s.diskGb,
    diskUsedGb: s.diskUsedGb,
    dockerVersion: s.dockerVersion,
    region: s.region,
    uptimeHours: s.uptimeHours,
  }
}

export function serializeBackup(b: {
  id: string
  target: string
  targetKind: string
  status: string
  sizeMb: number
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
  schedule: string | null
  retentionDays: number
  server: string
}) {
  return {
    id: b.id,
    target: b.target,
    targetKind: b.targetKind,
    status: b.status,
    sizeMb: b.sizeMb,
    startedAt: b.startedAt.toISOString(),
    finishedAt: iso(b.finishedAt),
    durationMs: b.durationMs ?? undefined,
    schedule: b.schedule ?? undefined,
    retentionDays: b.retentionDays,
    server: b.server,
  }
}

export function serializeNotification(n: {
  id: string
  title: string
  body: string
  level: string
  kind: string
  read: boolean
  ts: Date
}) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    level: n.level,
    kind: n.kind,
    read: n.read,
    ts: n.ts.toISOString(),
  }
}

export function serializeActivity(a: {
  id: string
  ts: Date
  actor: string
  kind: string
  message: string
  projectId: string | null
}) {
  return {
    id: a.id,
    ts: a.ts.toISOString(),
    actor: a.actor,
    kind: a.kind,
    message: a.message,
    projectId: a.projectId ?? undefined,
  }
}

export function serializeLogLine(l: {
  id: string
  ts: Date
  level: string
  service: string
  message: string
}) {
  return {
    id: l.id,
    ts: l.ts.toISOString(),
    level: l.level,
    service: l.service,
    message: l.message,
  }
}