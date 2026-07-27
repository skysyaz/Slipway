'use client'

import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  Project,
  Deployment,
  DatabaseInstance,
  Volume,
  Server,
  BackupRecord,
  BackupSchedule,
  Notification,
  ActivityEvent,
  LogLine,
  NavView,
  Environment,
  Domain,
  MetricPoint,
} from './types'

const EMPTY: MetricPoint[] = []

const EMPTY_METRICS = {
  cpu: { name: 'CPU usage', data: EMPTY },
  memory: { name: 'Memory', data: EMPTY },
  networkIn: { name: 'Network in (Mb/s)', data: EMPTY },
  networkOut: { name: 'Network out (Mb/s)', data: EMPTY },
  requestsPerSec: { name: 'Requests / sec', data: EMPTY },
  p95Latency: { name: 'p95 latency (ms)', data: EMPTY },
  deployFrequency: { name: 'Deploys / day', data: EMPTY },
  errorRate: { name: 'Error rate %', data: EMPTY },
}

type Metrics = typeof EMPTY_METRICS

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
  backupSchedules: BackupSchedule[]
  notifications: Notification[]
  activity: ActivityEvent[]
  logs: LogLine[]
  metrics: Metrics
  hydrated: boolean
  hydrating: boolean

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

  // data lifecycle
  hydrate: () => Promise<void>
  refetchAll: () => Promise<void>
  refetch: (keys: string[]) => Promise<void>

  // actions
  triggerDeployment: (projectId: string) => Promise<void>
  createAndDeploy: (payload: Record<string, unknown>) => Promise<string | undefined>
  rollback: (deploymentId: string) => Promise<void>
  promoteToProduction: (projectId: string) => Promise<void>
  markAllNotifsRead: () => Promise<void>
  pushLog: () => void
  appendLogs: (n: number) => void
  appendLogLine: (line: LogLine) => void

  // create actions
  addDatabase: (input: Partial<DatabaseInstance>) => Promise<DatabaseInstance & { password?: string; username?: string; dbName?: string }>
  updateDatabase: (id: string, patch: Record<string, unknown>) => Promise<void>
  deleteDatabase: (id: string, removeData: boolean) => Promise<void>
  addVolume: (input: Partial<Volume>) => Promise<void>
  addDomain: (projectId: string, hostname: string, type: Domain['type'], ssl: boolean) => Promise<void>
  runBackup: (target: string, targetKind: BackupRecord['targetKind']) => Promise<void>
  addBackupSchedule: (target: string, schedule: string, retentionDays: number) => Promise<void>
  scanHost: () => Promise<{ projects: number; databases: number; volumes: number; skipped: number }>
  addServer: (input: Record<string, unknown>) => Promise<void>
  addService: (projectId: string, input: Record<string, unknown>) => Promise<void>
  restartService: (projectId: string, serviceId?: string) => Promise<void>
  scaleProject: (projectId: string, replicas: number) => Promise<void>
  toggleEnvVar: (projectId: string, key: string, value: string) => Promise<void>
  addActivity: (kind: ActivityEvent['kind'], message: string, projectId?: string) => Promise<void>
  pushToast: (title: string, body?: string, level?: Notification['level']) => Promise<void>
}

async function safeGet<T>(url: string, fallback: T): Promise<T> {
  try {
    return await api.get<T>(url)
  } catch {
    return fallback
  }
}

export const useSlipway = create<SlipwayState>((set, get) => ({
  view: 'overview',
  selectedProjectId: null,
  setView: (view) => set({ view }),
  selectProject: (id) => set({ selectedProjectId: id, view: 'project-detail' }),

  env: 'production',
  setEnv: (env) => set({ env }),

  projects: [],
  deployments: [],
  databases: [],
  volumes: [],
  servers: [],
  backups: [],
  backupSchedules: [],
  notifications: [],
  activity: [],
  logs: [],
  metrics: EMPTY_METRICS,
  hydrated: false,
  hydrating: false,

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

  hydrate: async () => {
    if (get().hydrating || get().hydrated) return
    set({ hydrating: true })
    await get().refetchAll()
    set({ hydrating: false, hydrated: true })
  },

  refetchAll: async () => {
    const [projects, deployments, databases, volumes, servers, backups, backupSchedules, notifications, activity, metrics] =
      await Promise.all([
        safeGet<Project[]>('/api/projects', []),
        safeGet<Deployment[]>('/api/deployments', []),
        safeGet<DatabaseInstance[]>('/api/databases', []),
        safeGet<Volume[]>('/api/volumes', []),
        safeGet<Server[]>('/api/servers', []),
        safeGet<BackupRecord[]>('/api/backups', []),
        safeGet<BackupSchedule[]>('/api/backups/schedules', []),
        safeGet<Notification[]>('/api/notifications', []),
        safeGet<ActivityEvent[]>('/api/activity', []),
        safeGet<Metrics>('/api/metrics', EMPTY_METRICS),
      ])
    set({ projects, deployments, databases, volumes, servers, backups, backupSchedules, notifications, activity, metrics })
  },

  refetch: async (keys) => {
    const tasks: Promise<void>[] = []
    if (keys.includes('projects')) tasks.push(safeGet<Project[]>('/api/projects', []).then((v) => set({ projects: v })))
    if (keys.includes('deployments')) tasks.push(safeGet<Deployment[]>('/api/deployments', []).then((v) => set({ deployments: v })))
    if (keys.includes('databases')) tasks.push(safeGet<DatabaseInstance[]>('/api/databases', []).then((v) => set({ databases: v })))
    if (keys.includes('volumes')) tasks.push(safeGet<Volume[]>('/api/volumes', []).then((v) => set({ volumes: v })))
    if (keys.includes('servers')) tasks.push(safeGet<Server[]>('/api/servers', []).then((v) => set({ servers: v })))
    if (keys.includes('backups')) tasks.push(safeGet<BackupRecord[]>('/api/backups', []).then((v) => set({ backups: v })))
    if (keys.includes('schedules')) tasks.push(safeGet<BackupSchedule[]>('/api/backups/schedules', []).then((v) => set({ backupSchedules: v })))
    if (keys.includes('notifications')) tasks.push(safeGet<Notification[]>('/api/notifications', []).then((v) => set({ notifications: v })))
    if (keys.includes('activity')) tasks.push(safeGet<ActivityEvent[]>('/api/activity', []).then((v) => set({ activity: v })))
    await Promise.all(tasks)
  },

  triggerDeployment: async (projectId) => {
    await api.post('/api/deployments', { projectId })
    await get().refetch(['deployments', 'projects', 'activity'])
  },

  createAndDeploy: async (payload) => {
    // create project (if new) then trigger a deploy
    let projectId = String(payload.existingProjectId || '')
    if (!projectId) {
      const created = await api.post<Project>('/api/projects', payload)
      projectId = created.id
    }
    await api.post('/api/deployments', { projectId, ...payload })
    await get().refetch(['projects', 'deployments', 'activity'])
    return projectId || undefined
  },

  rollback: async (deploymentId) => {
    await api.post('/api/deployments/rollback', { deploymentId })
    set({ rollbackTarget: null })
    await get().refetch(['deployments', 'projects', 'notifications', 'activity'])
  },

  promoteToProduction: async (projectId) => {
    await get().addActivity('deploy', `promoted project to production`, projectId)
  },

  markAllNotifsRead: async () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
    await api.patch('/api/notifications/read-all')
  },

  pushLog: () => {
    // No-op placeholder kept for call-site compatibility; real logs arrive via
    // the /api/logs/stream SSE feed (see LogsView).
  },

  appendLogs: (_n) => {
    // Export now downloads the current buffer (handled in the view); kept for
    // call-site compatibility.
  },

  appendLogLine: (line) =>
    set((s) => ({ logs: [...s.logs.slice(-200), line] })),

  addDatabase: async (input) => {
    const created = await api.post<DatabaseInstance & { password?: string; username?: string; dbName?: string }>('/api/databases', input)
    await get().refetch(['databases', 'activity', 'notifications'])
    return created
  },

  updateDatabase: async (id, patch) => {
    await api.patch(`/api/databases/${id}`, patch)
    await get().refetch(['databases', 'activity', 'notifications'])
  },

  deleteDatabase: async (id, removeData) => {
    await api.del(`/api/databases/${id}?removeData=${removeData ? 'true' : 'false'}`)
    await get().refetch(['databases', 'activity', 'notifications'])
  },

  addVolume: async (input) => {
    await api.post('/api/volumes', input)
    await get().refetch(['volumes', 'activity', 'notifications'])
  },

  addDomain: async (projectId, hostname, type, ssl) => {
    await api.post(`/api/projects/${projectId}/domains`, { hostname, type, ssl })
    await get().refetch(['projects', 'activity', 'notifications'])
  },

  runBackup: async (target, targetKind) => {
    await api.post('/api/backups', { target, targetKind })
    await get().refetch(['backups', 'activity'])
  },

  addBackupSchedule: async (target, schedule, retentionDays) => {
    await api.post('/api/backups/schedules', { target, schedule, retentionDays })
    await get().refetch(['schedules', 'activity', 'notifications'])
  },

  scanHost: async () => {
    const result = await api.post<{ projects: number; databases: number; volumes: number; skipped: number }>('/api/cluster/scan')
    await get().refetch(['projects', 'databases', 'volumes', 'activity', 'notifications'])
    return result
  },

  addServer: async (input) => {
    await api.post('/api/servers', input)
    await get().refetch(['servers', 'activity', 'notifications'])
  },

  addService: async (projectId, input) => {
    await api.post(`/api/projects/${projectId}/services`, input)
    await get().refetch(['projects', 'activity'])
  },

  restartService: async (projectId, serviceId) => {
    const url = serviceId
      ? `/api/projects/${projectId}/services/${serviceId}/restart`
      : `/api/projects/${projectId}/restart`
    await api.post(url)
    await get().refetch(['projects', 'activity'])
  },

  scaleProject: async (projectId, replicas) => {
    await api.post(`/api/projects/${projectId}/scale`, { replicas })
    await get().refetch(['projects', 'activity', 'notifications'])
  },

  toggleEnvVar: async (projectId, key, value) => {
    await api.post(`/api/projects/${projectId}/env-vars`, { key, value, scope: 'all' })
    await get().refetch(['projects', 'activity'])
  },

  addActivity: async (kind, message, projectId) => {
    await api.post('/api/activity', { kind, message, projectId })
    await get().refetch(['activity'])
  },

  pushToast: async (title, body, level = 'info') => {
    // record as an in-app notification via the activity endpoint pattern is not
    // appropriate; we keep this as a no-op since the UI uses sonner toasts directly.
    void title
    void body
    void level
  },
}))

// helpers
export function useProject(id: string | null) {
  return useSlipway((s) => (id ? s.projects.find((p) => p.id === id) ?? null : null))
}

export function useDeploymentsFor(projectId: string | null) {
  return useSlipway((s) => (projectId ? s.deployments.filter((d) => d.projectId === projectId) : s.deployments))
}