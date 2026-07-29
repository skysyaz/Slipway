// Slipway — domain types for the self-hosted deployment platform

export type Environment = 'production' | 'staging' | 'preview'

// ponytail: ONE env-identity normalizer. The env filter compares the value the
// selector writes against the env stored on each record; both sides MUST go
// through this so a key/case mismatch (e.g. 'Staging' vs 'staging', or '' vs
// 'all') can never silently filter nothing. Used by the store (URL → state) and
// every env-filtered view (Deployments / Projects / Databases).
export const envKey = (e: unknown): string => String(e ?? '').trim().toLowerCase()

// ponytail: host-health client shape (mirrors src/lib/host-health.ts). ONE
// source of truth the overview banner, disk gauges, routing/TLS panel, and
// domains list all read from.
export type DiskStatus = 'ok' | 'warn' | 'critical' | 'full'

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
  severity: 'critical' | 'error' | 'warn'
  kind: 'config' | 'middleware' | 'acme' | 'watcher'
  domain?: string
  appSlug?: string
  message: string
  hint?: string
}

export interface HostHealth {
  agent: 'up' | 'down'
  mounts: DiskMount[]
  disk: { totalBytes: number; usedBytes: number; freeBytes: number; usedPct: number; status: DiskStatus }
  status: DiskStatus
  freeBytes: number
  inodesCritical: boolean
  enospc: EnospcHit[]
  traefik: TraefikIssue[]
}

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'healthy'
  | 'failed'
  | 'rolled_back'
  | 'cancelled'

export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'restarting' | 'failed' | 'paused' | 'external' | 'offline'

export type ServiceKind = 'app' | 'worker' | 'database' | 'cache' | 'cron'

export type StackKind =
  | 'nextjs'
  | 'node'
  | 'python'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'static'
  | 'dockerfile'
  | 'compose'
  | 'bun'
  | 'deno'
  | 'elixir'
  | 'dotnet'

export type DatabaseKind = 'postgres' | 'mysql' | 'mariadb' | 'mongodb' | 'redis' | 'valkey' | 'sqlite' | 'mssql'

export type PipelineStage =
  | 'queued'
  | 'checkout'
  | 'detect'
  | 'install'
  | 'build'
  | 'test'
  | 'image'
  | 'push'
  | 'release'
  | 'verify'
  | 'live'

export interface PipelineStep {
  stage: PipelineStage
  label: string
  status: DeploymentStatus
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  logLines?: number
  log?: string
}

export interface Deployment {
  id: string
  projectId?: string
  projectName: string
  kind?: 'project' | 'database'
  commitSha: string
  commitMessage: string
  branch: string
  author: string
  environment: Environment
  status: DeploymentStatus
  createdAt: string
  finishedAt?: string
  durationMs?: number
  steps: PipelineStep[]
  rollbackOfId?: string
  url?: string
  error?: string
  /** P1: per-domain routing warnings; deploy stayed healthy. */
  routeWarnings?: string[]
  /** P3: scrubbed frozen config snapshot. */
  configSnapshot?: unknown
  /** P4: paths that triggered this deploy. */
  changedPaths?: string[]
  forceAll?: boolean
}

export interface EnvVar {
  id: string
  key: string
  value: string
  scope: 'all' | 'production' | 'staging' | 'preview'
  masked: boolean
}

export interface Project {
  id: string
  name: string
  slug: string
  source: 'git' | 'folder' | 'compose'
  repoUrl?: string
  folderPath?: string
  composePath?: string
  stack: StackKind
  stackLabel: string
  framework?: string
  environment: Environment
  status: ServiceStatus
  lastDeployedAt: string
  url?: string
  previewUrl?: string
  description?: string
  services: Service[]
  domains: Domain[]
  envVars: EnvVar[]
  envVarsCount: number
  monthlyDeploys: number
  successRate: number // 0-100
  region: string
  memoryMb: number
  cpuMilli: number
  replicas: number
  minReplicas: number
  maxReplicas: number
  monorepo?: boolean
  monorepoPath?: string
  // deploy policy
  autoDeploy: boolean
  requireTests: boolean
  autoRollback: boolean
  pauseDuringWindows: boolean
  prPreviews: boolean
  buildCmd?: string
  startCmd?: string
  paused: boolean
  dockerImage?: string
  dockerContainerId?: string
}

export interface Service {
  id: string
  name: string
  kind: ServiceKind
  status: ServiceStatus
  image: string
  port?: number
  replicas: number
  memoryMb: number
  cpuMilli: number
  uptimeSeconds: number
  restarts: number
}

export interface Domain {
  id: string
  hostname: string
  projectId: string
  type: 'primary' | 'redirect' | 'preview' | 'api'
  ssl: 'managed' | 'custom' | 'pending' | 'disabled'
  sslExpiry?: string
  https: boolean
  status: 'active' | 'pending' | 'failed' | 'action-required'
}

export interface DatabaseInstance {
  id: string
  name: string
  kind: DatabaseKind
  version: string
  status: ServiceStatus
  projectId?: string
  host: string
  port: number
  storageGb: number
  usedGb: number
  connections: number
  maxConnections: number
  backupsEnabled: boolean
  region: string
  username?: string
  hasPassword?: boolean
  dbName?: string
  internalPort?: number
  dockerContainerId?: string
  environment?: Environment
  createdAt: string
}

export interface Volume {
  id: string
  name: string
  projectId?: string
  mountPath: string
  sizeGb: number
  usedGb: number
  type: 'ssd' | 'hdd' | 'nfs'
  server: string
  encrypted: boolean
}

export interface Server {
  id: string
  name: string
  hostname: string
  ip: string
  role: 'manager' | 'worker' | 'standalone'
  status: 'online' | 'offline' | 'degraded'
  os: string
  cpuCores: number
  memoryGb: number
  diskGb: number
  diskUsedGb: number
  dockerVersion: string
  region: string
  uptimeHours: number
}

export interface BackupRecord {
  id: string
  target: string // db name or volume name
  targetKind: 'database' | 'volume' | 'project'
  status: 'completed' | 'running' | 'failed' | 'scheduled'
  sizeMb: number
  startedAt: string
  durationMs?: number
  schedule?: string
  retentionDays: number
  server: string
  /** Archive produced inside the `slipway-backups` Docker volume, when one was. */
  fileName?: string
}

export interface BackupSchedule {
  id: string
  target: string
  targetKind: string
  schedule: string
  retentionDays: number
  active: boolean
  createdAt: string
}

export interface LogLine {
  id: string
  ts: string
  level: 'debug' | 'info' | 'warn' | 'error' | 'system'
  service: string
  message: string
}

export interface MetricPoint {
  t: number
  v: number
}

export interface MetricSeries {
  name: string
  color?: string
  data: MetricPoint[]
}

export interface Notification {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  ts: string
  read: boolean
  kind: 'deploy' | 'backup' | 'ssl' | 'server' | 'security' | 'system'
}

export interface ActivityEvent {
  id: string
  ts: string
  actor: string
  kind: 'deploy' | 'rollback' | 'scale' | 'domain' | 'database' | 'backup' | 'env' | 'server'
  message: string
  projectId?: string
}

export type NavView =
  | 'overview'
  | 'projects'
  | 'project-detail'
  | 'deployments'
  | 'databases'
  | 'storage'
  | 'domains'
  | 'metrics'
  | 'logs'
  | 'backups'
  | 'previews'
  | 'settings'
  | 'cli'
