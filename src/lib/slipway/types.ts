// Slipway — domain types for the self-hosted deployment platform

export type Environment = 'production' | 'staging' | 'preview'

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'healthy'
  | 'failed'
  | 'rolled_back'
  | 'cancelled'

export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'restarting' | 'failed'

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

export type DatabaseKind = 'postgres' | 'mysql' | 'mariadb' | 'mongodb' | 'redis' | 'valkey' | 'sqlite'

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
}

export interface Deployment {
  id: string
  projectId: string
  projectName: string
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
}

export interface Project {
  id: string
  name: string
  slug: string
  source: 'git' | 'folder' | 'compose'
  repoUrl?: string
  folderPath?: string
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
  envVarsCount: number
  monthlyDeploys: number
  successRate: number // 0-100
  region: string
  memoryMb: number
  cpuMilli: number
  replicas: number
  monorepo?: boolean
  monorepoPath?: string
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
  status: 'active' | 'pending' | 'failed'
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
