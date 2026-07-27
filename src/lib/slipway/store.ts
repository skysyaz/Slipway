'use client'

import { create } from 'zustand'
import {
  projects as seedProjects,
  deployments as seedDeployments,
  databases as seedDatabases,
  volumes as seedVolumes,
  servers as seedServers,
  backups as seedBackups,
  notifications as seedNotifications,
  activity as seedActivity,
  nextLogLine,
  metrics as seedMetrics,
} from './data'
import type {
  Project,
  Deployment,
  DatabaseInstance,
  Volume,
  Server,
  BackupRecord,
  Notification,
  ActivityEvent,
  LogLine,
  NavView,
  Environment,
  DatabaseKind,
  Domain,
} from './types'

interface SlipwayState {
  // navigation
  view: NavView
  selectedProjectId: string | null
  setView: (view: NavView) => void
  selectProject: (id: string) => void

  // global filters
  env: Environment
  setEnv: (env: Environment) => void

  // data
  projects: Project[]
  deployments: Deployment[]
  databases: DatabaseInstance[]
  volumes: Volume[]
  servers: Server[]
  backups: BackupRecord[]
  notifications: Notification[]
  activity: ActivityEvent[]
  logs: LogLine[]
  metrics: typeof seedMetrics

  // ui dialogs
  newDeploymentOpen: boolean
  setNewDeploymentOpen: (open: boolean) => void
  rollbackTarget: Deployment | null
  setRollbackTarget: (d: Deployment | null) => void
  notifOpen: boolean
  setNotifOpen: (open: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  newDatabaseOpen: boolean
  setNewDatabaseOpen: (open: boolean) => void
  newVolumeOpen: boolean
  setNewVolumeOpen: (open: boolean) => void
  newDomainOpen: boolean
  setNewDomainOpen: (open: boolean) => void
  newBackupOpen: boolean
  setNewBackupOpen: (open: boolean) => void
  newBackupScheduleOpen: boolean
  setNewBackupScheduleOpen: (open: boolean) => void
  newPreviewOpen: boolean
  setNewPreviewOpen: (open: boolean) => void
  newServerOpen: boolean
  setNewServerOpen: (open: boolean) => void
  newSshKeyOpen: boolean
  setNewSshKeyOpen: (open: boolean) => void
  newRegistryOpen: boolean
  setNewRegistryOpen: (open: boolean) => void
  newWebhookOpen: boolean
  setNewWebhookOpen: (open: boolean) => void
  newTokenOpen: boolean
  setNewTokenOpen: (open: boolean) => void
  addServiceOpen: boolean
  setAddServiceOpen: (open: boolean) => void

  // actions
  triggerDeployment: (projectId: string) => void
  rollback: (deploymentId: string) => void
  promoteToProduction: (projectId: string) => void
  markAllNotifsRead: () => void
  pushLog: () => void
  appendLogs: (n: number) => void

  // create actions
  addDatabase: (input: Partial<DatabaseInstance>) => void
  addVolume: (input: Partial<Volume>) => void
  addDomain: (projectId: string, hostname: string, type: Domain['type'], ssl: boolean) => void
  runBackup: (target: string, targetKind: BackupRecord['targetKind']) => void
  addBackupSchedule: (target: string, schedule: string, retentionDays: number) => void
  addServer: (input: Partial<Server>) => void
  restartService: (projectId: string, serviceId?: string) => void
  scaleProject: (projectId: string, replicas: number) => void
  toggleEnvVar: (projectId: string, key: string, value: string) => void
  addActivity: (kind: ActivityEvent['kind'], message: string, projectId?: string) => void
  pushToast: (title: string, body?: string, level?: Notification['level']) => void
}

function pushNotif(state: SlipwayState, n: Omit<Notification, 'id' | 'ts' | 'read'>): Notification[] {
  const newNotif: Notification = {
    ...n,
    id: 'n-' + Math.random().toString(36).slice(2, 9),
    ts: new Date().toISOString(),
    read: false,
  }
  return [newNotif, ...state.notifications]
}

function pushActivity(state: SlipwayState, kind: ActivityEvent['kind'], message: string, projectId?: string): ActivityEvent[] {
  const event: ActivityEvent = {
    id: 'a-' + Math.random().toString(36).slice(2, 9),
    ts: new Date().toISOString(),
    actor: 'you',
    kind,
    message,
    projectId,
  }
  return [event, ...state.activity]
}

export const useSlipway = create<SlipwayState>((set, get) => ({
  view: 'overview',
  selectedProjectId: null,
  setView: (view) => set({ view }),
  selectProject: (id) => set({ selectedProjectId: id, view: 'project-detail' }),

  env: 'production',
  setEnv: (env) => set({ env }),

  projects: seedProjects,
  deployments: seedDeployments,
  databases: seedDatabases,
  volumes: seedVolumes,
  servers: seedServers,
  backups: seedBackups,
  notifications: seedNotifications,
  activity: seedActivity,
  logs: Array.from({ length: 60 }, () => nextLogLine()).reverse(),
  metrics: seedMetrics,

  newDeploymentOpen: false,
  setNewDeploymentOpen: (open) => set({ newDeploymentOpen: open }),
  rollbackTarget: null,
  setRollbackTarget: (d) => set({ rollbackTarget: d }),
  notifOpen: false,
  setNotifOpen: (open) => set({ notifOpen: open }),
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  newDatabaseOpen: false,
  setNewDatabaseOpen: (open) => set({ newDatabaseOpen: open }),
  newVolumeOpen: false,
  setNewVolumeOpen: (open) => set({ newVolumeOpen: open }),
  newDomainOpen: false,
  setNewDomainOpen: (open) => set({ newDomainOpen: open }),
  newBackupOpen: false,
  setNewBackupOpen: (open) => set({ newBackupOpen: open }),
  newBackupScheduleOpen: false,
  setNewBackupScheduleOpen: (open) => set({ newBackupScheduleOpen: open }),
  newPreviewOpen: false,
  setNewPreviewOpen: (open) => set({ newPreviewOpen: open }),
  newServerOpen: false,
  setNewServerOpen: (open) => set({ newServerOpen: open }),
  newSshKeyOpen: false,
  setNewSshKeyOpen: (open) => set({ newSshKeyOpen: open }),
  newRegistryOpen: false,
  setNewRegistryOpen: (open) => set({ newRegistryOpen: open }),
  newWebhookOpen: false,
  setNewWebhookOpen: (open) => set({ newWebhookOpen: open }),
  newTokenOpen: false,
  setNewTokenOpen: (open) => set({ newTokenOpen: open }),
  addServiceOpen: false,
  setAddServiceOpen: (open) => set({ addServiceOpen: open }),

  triggerDeployment: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    const newDep: Deployment = {
      id: 'dep-' + Math.random().toString(36).slice(2, 9),
      projectId,
      projectName: project.name,
      commitSha: Math.random().toString(16).slice(2, 9),
      commitMessage: 'Manual deploy from dashboard',
      branch: project.environment === 'preview' ? 'preview' : 'main',
      author: 'you',
      environment: project.environment,
      status: 'building',
      createdAt: new Date().toISOString(),
      steps: [
        { stage: 'queued', label: 'Queued', status: 'healthy', durationMs: 1200, logLines: 4 },
        { stage: 'checkout', label: 'Checkout', status: 'healthy', durationMs: 3200, logLines: 18 },
        { stage: 'detect', label: 'Detect stack', status: 'healthy', durationMs: 1800, logLines: 6 },
        { stage: 'install', label: 'Install deps', status: 'building' },
        { stage: 'build', label: 'Build', status: 'queued' },
        { stage: 'test', label: 'Tests', status: 'queued' },
        { stage: 'image', label: 'Build image', status: 'queued' },
        { stage: 'push', label: 'Push image', status: 'queued' },
        { stage: 'release', label: 'Release', status: 'queued' },
        { stage: 'verify', label: 'Health check', status: 'queued' },
        { stage: 'live', label: 'Live', status: 'queued' },
      ],
    }
    set((s) => ({
      deployments: [newDep, ...s.deployments],
      activity: pushActivity(s, 'deploy', `triggered deployment of ${project.name}`, projectId),
    }))
  },

  rollback: (deploymentId) => {
    const dep = get().deployments.find((d) => d.id === deploymentId)
    if (!dep) return
    const rollbackDep: Deployment = {
      id: 'dep-' + Math.random().toString(36).slice(2, 9),
      projectId: dep.projectId,
      projectName: dep.projectName,
      commitSha: dep.commitSha,
      commitMessage: `Rollback to ${dep.commitSha}`,
      branch: dep.branch,
      author: 'you',
      environment: dep.environment,
      status: 'healthy',
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 12_000,
      steps: [
        { stage: 'queued', label: 'Queued', status: 'healthy', durationMs: 800, logLines: 2 },
        { stage: 'release', label: 'Release', status: 'healthy', durationMs: 4200, logLines: 12 },
        { stage: 'verify', label: 'Health check', status: 'healthy', durationMs: 5200, logLines: 8 },
        { stage: 'live', label: 'Live', status: 'healthy', durationMs: 400, logLines: 1 },
      ],
      rollbackOfId: dep.id,
    }
    set((s) => ({
      deployments: [rollbackDep, ...s.deployments],
      rollbackTarget: null,
      activity: pushActivity(s, 'rollback', `rolled back ${dep.projectName} to ${dep.commitSha}`, dep.projectId),
      notifications: pushNotif(s, {
        title: 'Rollback complete',
        body: `${dep.projectName} rolled back to ${dep.commitSha}. Health checks passed.`,
        level: 'success',
        kind: 'deploy',
      }),
    }))
  },

  promoteToProduction: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    set((s) => ({
      activity: pushActivity(s, 'deploy', `promoted ${project.name} to production`, projectId),
    }))
  },

  markAllNotifsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  pushLog: () =>
    set((s) => ({ logs: [...s.logs.slice(-200), nextLogLine()] })),

  appendLogs: (n) =>
    set((s) => ({
      logs: [...s.logs.slice(-(200 - n)), ...Array.from({ length: n }, () => nextLogLine())],
    })),

  addDatabase: (input) => {
    const id = 'db-' + Math.random().toString(36).slice(2, 9)
    const newDb: DatabaseInstance = {
      id,
      name: input.name || 'new-database',
      kind: (input.kind as DatabaseKind) || 'postgres',
      version: input.version || '16.4',
      status: 'running',
      projectId: input.projectId,
      host: `${id}.internal.slipway.run`,
      port: input.port || 5432,
      storageGb: input.storageGb || 20,
      usedGb: 0,
      connections: 0,
      maxConnections: input.kind === 'redis' || input.kind === 'valkey' ? 1000 : 200,
      backupsEnabled: input.backupsEnabled ?? true,
      region: input.region || 'eu-fra1',
      createdAt: new Date().toISOString(),
    }
    set((s) => ({
      databases: [...s.databases, newDb],
      newDatabaseOpen: false,
      activity: pushActivity(s, 'database', `created ${newDb.kind} database "${newDb.name}"`, input.projectId),
      notifications: pushNotif(s, {
        title: 'Database created',
        body: `${newDb.name} (${newDb.kind} ${newDb.version}) is running and ready for connections.`,
        level: 'success',
        kind: 'database',
      }),
    }))
  },

  addVolume: (input) => {
    const id = 'vol-' + Math.random().toString(36).slice(2, 9)
    const newVol: Volume = {
      id,
      name: input.name || 'new-volume',
      projectId: input.projectId,
      mountPath: input.mountPath || '/data',
      sizeGb: input.sizeGb || 20,
      usedGb: 0,
      type: input.type || 'ssd',
      server: input.server || 'fra1-manager',
      encrypted: input.encrypted ?? true,
    }
    set((s) => ({
      volumes: [...s.volumes, newVol],
      newVolumeOpen: false,
      activity: pushActivity(s, 'database', `created volume "${newVol.name}" (${newVol.sizeGb} GB ${newVol.type.toUpperCase()})`),
      notifications: pushNotif(s, {
        title: 'Volume created',
        body: `${newVol.name} mounted at ${newVol.mountPath} on ${newVol.server}.`,
        level: 'success',
        kind: 'system',
      }),
    }))
  },

  addDomain: (projectId, hostname, type, ssl) => {
    const id = 'dom-' + Math.random().toString(36).slice(2, 9)
    const newDom: Domain = {
      id,
      hostname,
      projectId,
      type,
      ssl: ssl ? 'managed' : 'disabled',
      sslExpiry: ssl ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString() : undefined,
      https: ssl,
      status: 'active',
    }
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, domains: [...p.domains, newDom] } : p,
      ),
      newDomainOpen: false,
      activity: pushActivity(s, 'domain', `added domain ${hostname} to project`, projectId),
      notifications: pushNotif(s, {
        title: 'Domain added',
        body: ssl
          ? `${hostname} added. SSL certificate provisioning via Let's Encrypt started.`
          : `${hostname} added without SSL. Enable SSL in Domains to secure it.`,
        level: ssl ? 'success' : 'info',
        kind: 'ssl',
      }),
    }))
  },

  runBackup: (target, targetKind) => {
    const id = 'bk-' + Math.random().toString(36).slice(2, 9)
    const newBackup: BackupRecord = {
      id,
      target,
      targetKind,
      status: 'running',
      sizeMb: 0,
      startedAt: new Date().toISOString(),
      server: 'fra1-manager',
      retentionDays: 14,
    }
    set((s) => ({
      backups: [newBackup, ...s.backups],
      newBackupOpen: false,
      activity: pushActivity(s, 'backup', `started manual backup of ${target}`),
    }))
    // Simulate completion after a few seconds
    setTimeout(() => {
      set((s) => ({
        backups: s.backups.map((b) =>
          b.id === id
            ? {
                ...b,
                status: 'completed',
                sizeMb: Math.floor(Math.random() * 4000) + 100,
                durationMs: Math.floor(Math.random() * 60_000) + 10_000,
              }
            : b,
        ),
        notifications: pushNotif(s, {
          title: 'Backup completed',
          body: `${target} snapshot stored successfully.`,
          level: 'success',
          kind: 'backup',
        }),
      }))
    }, 4000)
  },

  addBackupSchedule: (target, schedule, retentionDays) => {
    set((s) => ({
      newBackupScheduleOpen: false,
      activity: pushActivity(s, 'backup', `scheduled backup of ${target}: ${schedule} (keep ${retentionDays} days)`),
      notifications: pushNotif(s, {
        title: 'Backup schedule created',
        body: `${target} will be backed up on schedule: ${schedule}. Retention: ${retentionDays} days.`,
        level: 'success',
        kind: 'backup',
      }),
    }))
  },

  addServer: (input) => {
    const id = 'srv-' + Math.random().toString(36).slice(2, 9)
    const newServer: Server = {
      id,
      name: input.name || 'new-server',
      hostname: input.hostname || '',
      ip: input.ip || '',
      role: input.role || 'worker',
      status: 'online',
      os: input.os || 'Ubuntu 24.04 LTS',
      cpuCores: input.cpuCores || 4,
      memoryGb: input.memoryGb || 16,
      diskGb: input.diskGb || 200,
      diskUsedGb: 0,
      dockerVersion: '27.3.1',
      region: input.region || 'eu-fra1',
      uptimeHours: 0,
    }
    set((s) => ({
      servers: [...s.servers, newServer],
      newServerOpen: false,
      activity: pushActivity(s, 'server', `added server ${newServer.name} (${newServer.ip}) to cluster`),
      notifications: pushNotif(s, {
        title: 'Server connected',
        body: `${newServer.name} joined the cluster. Docker installed, ready to receive workloads.`,
        level: 'success',
        kind: 'server',
      }),
    }))
  },

  restartService: (projectId, serviceId) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              services: p.services.map((svc) =>
                !serviceId || svc.id === serviceId ? { ...svc, status: 'restarting' as const } : svc,
              ),
            }
          : p,
      ),
      activity: pushActivity(s, 'scale', `restarted ${serviceId ? 'service' : 'all services'} on ${project.name}`, projectId),
    }))
    // Simulate restart completion
    setTimeout(() => {
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                services: p.services.map((svc) =>
                  !serviceId || svc.id === serviceId ? { ...svc, status: 'running' as const, restarts: svc.restarts + 1 } : svc,
                ),
              }
            : p,
        ),
      }))
    }, 2500)
  },

  scaleProject: (projectId, replicas) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, replicas } : p)),
      activity: pushActivity(s, 'scale', `scaled ${project.name} to ${replicas} replicas`, projectId),
      notifications: pushNotif(s, {
        title: 'Scaling complete',
        body: `${project.name} now running ${replicas} replica${replicas === 1 ? '' : 's'}.`,
        level: 'success',
        kind: 'deploy',
      }),
    }))
  },

  toggleEnvVar: (projectId, key, value) => {
    set((s) => ({
      activity: pushActivity(s, 'env', `updated ${key} on project`, projectId),
    }))
  },

  addActivity: (kind, message, projectId) => {
    set((s) => ({ activity: pushActivity(s, kind, message, projectId) }))
  },

  pushToast: (title, body, level = 'info') => {
    set((s) => ({
      notifications: pushNotif(s, { title, body: body || '', level, kind: 'system' }),
    }))
  },
}))

// helpers
export function useProject(id: string | null) {
  return useSlipway((s) => (id ? s.projects.find((p) => p.id === id) ?? null : null))
}

export function useDeploymentsFor(projectId: string | null) {
  return useSlipway((s) => (projectId ? s.deployments.filter((d) => d.projectId === projectId) : s.deployments))
}
