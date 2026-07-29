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
  HostHealth,
} from './types'
import { envKey } from './types'

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
  projectTab: string | null
  setProjectTab: (tab: string) => void
  serviceLogScope: string | null
  setServiceLogScope: (name: string | null) => void
  setView: (view: NavView) => void
  selectProject: (id: string) => void

  // global filters
  env: Environment | 'all'
  setEnv: (env: Environment | 'all') => void

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
  hostHealth: HostHealth | null
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
  // ponytail: open exactly one dialog at a time — opening one closes the
  // others. Fixes "click another button, the previously open dialog stays."
  openDialog: (name: string) => void
  closeAllDialogs: () => void

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
  updateVolume: (id: string, patch: Record<string, unknown>) => Promise<void>
  deleteVolume: (id: string, removeData: boolean) => Promise<void>
  addDomain: (projectId: string, hostname: string, type: Domain['type'], ssl: boolean) => Promise<void>
  deleteDomain: (projectId: string, domainId: string) => Promise<void>
  restartDatabase: (id: string) => Promise<void>
  reconcileProject: (projectId: string) => Promise<void>
  runBackup: (target: string, targetKind: BackupRecord['targetKind']) => Promise<void>
  addBackupSchedule: (target: string, schedule: string, retentionDays: number) => Promise<void>
  deleteBackupSchedule: (id: string) => Promise<void>
  scanHost: () => Promise<{ projects: number; databases: number; volumes: number; domains: number; skipped: number }>
  addServer: (input: Record<string, unknown>) => Promise<void>
  addService: (projectId: string, input: Record<string, unknown>) => Promise<void>
  restartService: (projectId: string, serviceId?: string) => Promise<void>
  stopService: (projectId: string, serviceId?: string) => Promise<void>
  removeService: (projectId: string, serviceId: string) => Promise<void>
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

// ponytail: on a transient API failure (container mid-restart, network blip),
// KEEP the existing data instead of blanking the dashboard to []. This is the
// fix for "scanned items go missing on refresh then come back" — a failed poll
// no longer overwrites good data with empty.
async function fetchOrKeep<T>(url: string, keep: T): Promise<T> {
  try {
    return await api.get<T>(url)
  } catch {
    return keep
  }
}

// ponytail: the set of "new X" + add-service dialog flags that are mutually
// exclusive. openOverlay() clears ALL overlays (dialogs + the command palette +
// the notifications panel) then sets one true — so only ONE panel can be open
// at any time (fixes "click another button, the previously open panel stays").
type DialogFlag =
  | 'newDeploymentOpen'
  | 'newDatabaseOpen'
  | 'newVolumeOpen'
  | 'newDomainOpen'
  | 'newBackupOpen'
  | 'newBackupScheduleOpen'
  | 'newPreviewOpen'
  | 'newServerOpen'
  | 'newSshKeyOpen'
  | 'newRegistryOpen'
  | 'newWebhookOpen'
  | 'newTokenOpen'
  | 'addServiceOpen'

// ponytail: notifOpen + commandOpen are overlays too, so they join the mutex —
// opening a dialog closes the notifications panel / command palette and
// vice-versa. The local topbar dropdowns (UserMenu, EnvToggle) close themselves
// via useAnyOverlayOpen() (see topbar.tsx).
type OverlayFlag = DialogFlag | 'notifOpen' | 'commandOpen'

const DIALOG_FALSE: Record<DialogFlag, boolean> = {
  newDeploymentOpen: false,
  newDatabaseOpen: false,
  newVolumeOpen: false,
  newDomainOpen: false,
  newBackupOpen: false,
  newBackupScheduleOpen: false,
  newPreviewOpen: false,
  newServerOpen: false,
  newSshKeyOpen: false,
  newRegistryOpen: false,
  newWebhookOpen: false,
  newTokenOpen: false,
  addServiceOpen: false,
}

const OVERLAY_FALSE: Record<OverlayFlag, boolean> = {
  ...DIALOG_FALSE,
  notifOpen: false,
  commandOpen: false,
}

function openOverlay(
  set: (partial: Partial<SlipwayState>) => void,
  flag: OverlayFlag
) {
  set({ ...OVERLAY_FALSE, [flag]: true })
}

// ponytail: bug 1 — hash-based routing. The app uses state-based navigation
// (this store's `view`), not a router lib, so a refresh reset `view` to its
// 'overview' default and a shareable URL was impossible. The minimal fix that
// still satisfies "refresh restores the page + shareable URL + browser
// Back/Forward" is to mirror `view` to location.hash — zero dependencies, no
// BrowserRouter server-rewrite-config needed on the static/standalone host.
// project-detail carries its selected id as `#project-detail/<id>`. The
// sidebar's active state is already derived from `view`, so it stays correct
// once `view` tracks the hash.
const VIEW_SET: ReadonlySet<NavView> = new Set<NavView>([
  'overview', 'projects', 'project-detail', 'deployments', 'databases', 'storage',
  'domains', 'metrics', 'logs', 'backups', 'previews', 'settings', 'cli',
])
function parseHash(): { view: NavView; projectId: string | null; tab: string | null } {
  if (typeof window === 'undefined') return { view: 'overview', projectId: null, tab: null }
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return { view: 'overview', projectId: null, tab: null }
  const [v, pid, tab] = raw.split('/')
  const view = VIEW_SET.has(v as NavView) ? (v as NavView) : 'overview'
  const projectId = view === 'project-detail' && pid ? pid : null
  return { view, projectId, tab: view === 'project-detail' && tab ? tab : null }
}
function writeHash(view: NavView, projectId: string | null, tab?: string | null, replace = false) {
  if (typeof window === 'undefined') return
  const base = view === 'project-detail' && projectId ? `project-detail/${projectId}` : view
  const hash = `#${base}${view === 'project-detail' && tab ? `/${tab}` : ''}`
  if (replace) {
    const url = new URL(window.location.href)
    url.hash = hash
    window.history.replaceState(null, '', url.href)
  } else if (window.location.hash !== hash) {
    window.location.hash = hash
  }
}

// ponytail: the env filter is a URL query param (?env=production|staging|preview;
// absent = 'all') so it is the SINGLE source of truth — the dropdown highlight,
// every filtered list, and the summary all read from it, so they can never drift
// (the bug: the dropdown set a store value the Deployments list never read).
// URL source-of-truth also gives refresh-persistence + shareable links for free,
// matching the hash-routing nav fix. pushState (not replaceState) so Back/Forward
// traverses env selections; the popstate listener below syncs URL → store.
const ENV_SET: ReadonlySet<string> = new Set<string>(['production', 'staging', 'preview'])
function parseEnvParam(): Environment | 'all' {
  if (typeof window === 'undefined') return 'all'
  const v = envKey(new URLSearchParams(window.location.search).get('env'))
  return ENV_SET.has(v) ? (v as Environment) : 'all'
}
function writeEnvParam(env: Environment | 'all') {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (env === 'all') url.searchParams.delete('env')
  else url.searchParams.set('env', env)
  window.history.pushState({ slipwayEnv: env }, '', url.href)
}

let hydrateInFlight: Promise<void> | null = null

export const useSlipway = create<SlipwayState>((set, get) => {
  const initial = parseHash()
  // Sync external hash changes (browser Back/Forward, or a pasted shareable
  // URL) back into the store. Registered once, client-only; idempotent.
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const p = parseHash()
      const cur = get()
      if (cur.view !== p.view) {
        set({
          view: p.view,
          ...(p.view === 'project-detail' && p.projectId ? { selectedProjectId: p.projectId, projectTab: p.tab } : {}),
        })
      } else if (p.view === 'project-detail' && p.projectId && cur.selectedProjectId !== p.projectId) {
        set({ selectedProjectId: p.projectId, projectTab: p.tab })
      } else if (p.view === 'project-detail' && cur.projectTab !== p.tab) {
        set({ projectTab: p.tab })
      }
    })
    // ponytail: Back/Forward over env (a query-only change) fires popstate but
    // NOT hashchange, so sync the URL env back into the store here. On a
    // hash-only back, popstate also fires but the env is unchanged → no-op.
    window.addEventListener('popstate', () => {
      const e = parseEnvParam()
      if (get().env !== e) set({ env: e })
    })
  }
  return {
  view: initial.view,
  selectedProjectId: initial.projectId,
  projectTab: initial.tab,
  serviceLogScope: null,
  setServiceLogScope: (name) => set({ serviceLogScope: name }),
  setView: (view) => { writeHash(view, get().selectedProjectId); set({ view }) },
  selectProject: (id) => { writeHash('project-detail', id); set({ selectedProjectId: id, view: 'project-detail' }) },
  // META-RULE 1: the active project tab lives in the URL (#/project-detail/<id>/<tab>)
  // so refresh + shareable links + Back/Forward restore the exact tab. Written
  // with replace so a tab click doesn't push a history entry per chip.
  setProjectTab: (tab) => {
    const pid = get().selectedProjectId
    writeHash('project-detail', pid, tab, true)
    set({ projectTab: tab })
  },

  env: parseEnvParam(),
  setEnv: (env) => { writeEnvParam(env); set({ env }) },

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
  hostHealth: null,
  hydrated: false,
  hydrating: false,

  // ponytail: the "new X" + add-service dialogs AND the command palette +
  // notifications panel are ALL mutually exclusive — opening one closes every
  // other overlay (fixes "click another button, the previous panel stays
  // open"). Close (open=false) only touches its own flag.
  newDeploymentOpen: false,
  setNewDeploymentOpen: (open) => (open ? openOverlay(set, 'newDeploymentOpen') : set({ newDeploymentOpen: false })),
  rollbackTarget: null,
  setRollbackTarget: (d) => set({ rollbackTarget: d }),
  notifOpen: false,
  setNotifOpen: (open) => (open ? openOverlay(set, 'notifOpen') : set({ notifOpen: false })),
  commandOpen: false,
  setCommandOpen: (open) => (open ? openOverlay(set, 'commandOpen') : set({ commandOpen: false })),
  newDatabaseOpen: false,
  setNewDatabaseOpen: (open) => (open ? openOverlay(set, 'newDatabaseOpen') : set({ newDatabaseOpen: false })),
  newVolumeOpen: false,
  setNewVolumeOpen: (open) => (open ? openOverlay(set, 'newVolumeOpen') : set({ newVolumeOpen: false })),
  newDomainOpen: false,
  setNewDomainOpen: (open) => (open ? openOverlay(set, 'newDomainOpen') : set({ newDomainOpen: false })),
  newBackupOpen: false,
  setNewBackupOpen: (open) => (open ? openOverlay(set, 'newBackupOpen') : set({ newBackupOpen: false })),
  newBackupScheduleOpen: false,
  setNewBackupScheduleOpen: (open) => (open ? openOverlay(set, 'newBackupScheduleOpen') : set({ newBackupScheduleOpen: false })),
  newPreviewOpen: false,
  setNewPreviewOpen: (open) => (open ? openOverlay(set, 'newPreviewOpen') : set({ newPreviewOpen: false })),
  newServerOpen: false,
  setNewServerOpen: (open) => (open ? openOverlay(set, 'newServerOpen') : set({ newServerOpen: false })),
  newSshKeyOpen: false,
  setNewSshKeyOpen: (open) => (open ? openOverlay(set, 'newSshKeyOpen') : set({ newSshKeyOpen: false })),
  newRegistryOpen: false,
  setNewRegistryOpen: (open) => (open ? openOverlay(set, 'newRegistryOpen') : set({ newRegistryOpen: false })),
  newWebhookOpen: false,
  setNewWebhookOpen: (open) => (open ? openOverlay(set, 'newWebhookOpen') : set({ newWebhookOpen: false })),
  newTokenOpen: false,
  setNewTokenOpen: (open) => (open ? openOverlay(set, 'newTokenOpen') : set({ newTokenOpen: false })),
  addServiceOpen: false,
  setAddServiceOpen: (open) => (open ? openOverlay(set, 'addServiceOpen') : set({ addServiceOpen: false })),

  closeAllDialogs: () => set(OVERLAY_FALSE),
  openDialog: (name) => {
    const map: Record<string, OverlayFlag> = {
      deployment: 'newDeploymentOpen',
      database: 'newDatabaseOpen',
      volume: 'newVolumeOpen',
      domain: 'newDomainOpen',
      backup: 'newBackupOpen',
      backupSchedule: 'newBackupScheduleOpen',
      preview: 'newPreviewOpen',
      server: 'newServerOpen',
      sshKey: 'newSshKeyOpen',
      registry: 'newRegistryOpen',
      webhook: 'newWebhookOpen',
      token: 'newTokenOpen',
      addService: 'addServiceOpen',
      command: 'commandOpen',
      notifications: 'notifOpen',
    }
    const key = map[name]
    if (key) openOverlay(set, key)
  },

  hydrate: async () => {
    // R9: single-flight. The old `if (hydrating||hydrated) return` guard is not
    // atomic — two concurrent callers both read hydrating=false and both fetch.
    // Store the in-flight promise and hand it to concurrent callers instead.
    if (get().hydrated) return
    if (hydrateInFlight) return hydrateInFlight
    set({ hydrating: true })
    hydrateInFlight = (async () => {
      try {
        await get().refetchAll()
        set({ hydrating: false, hydrated: true })
      } finally {
        hydrateInFlight = null
      }
    })()
    return hydrateInFlight
  },

  refetchAll: async () => {
    // ponytail: set each slice INDEPENDENTLY as its fetch resolves, not in one
    // atomic Promise.all. /api/metrics samples `docker stats` per container and
    // can take ~30s on a busy host; a single atomic set made it block the whole
    // dashboard (the "scanned items go missing on refresh then come back" bug).
    // Now projects/databases/volumes appear in ~50ms regardless of metrics.
    const s = get()
    await Promise.all([
      fetchOrKeep<Project[]>('/api/projects', s.projects).then((v) => set({ projects: v })),
      fetchOrKeep<Deployment[]>('/api/deployments', s.deployments).then((v) => set({ deployments: v })),
      fetchOrKeep<DatabaseInstance[]>('/api/databases', s.databases).then((v) => set({ databases: v })),
      fetchOrKeep<Volume[]>('/api/volumes', s.volumes).then((v) => set({ volumes: v })),
      fetchOrKeep<Server[]>('/api/servers', s.servers).then((v) => set({ servers: v })),
      fetchOrKeep<BackupRecord[]>('/api/backups', s.backups).then((v) => set({ backups: v })),
      fetchOrKeep<BackupSchedule[]>('/api/backups/schedules', s.backupSchedules).then((v) => set({ backupSchedules: v })),
      fetchOrKeep<Notification[]>('/api/notifications', s.notifications).then((v) => set({ notifications: v })),
      fetchOrKeep<ActivityEvent[]>('/api/activity', s.activity).then((v) => set({ activity: v })),
      fetchOrKeep<Metrics>('/api/metrics', s.metrics).then((v) => set({ metrics: v })),
      // ponytail: host-health is independent — disk/inodes/ENOSPC/Traefik must
      // appear even if metrics is slow (it samples `docker stats`). One source
      // of truth for the overview banner + disk gauges + routing/TLS panel.
      fetchOrKeep<HostHealth | null>('/api/host-health', s.hostHealth).then((v) => set({ hostHealth: v })),
    ])
  },

  refetch: async (keys) => {
    const s = get()
    const tasks: Promise<void>[] = []
    if (keys.includes('projects')) tasks.push(fetchOrKeep<Project[]>('/api/projects', s.projects).then((v) => set({ projects: v })))
    if (keys.includes('deployments')) tasks.push(fetchOrKeep<Deployment[]>('/api/deployments', s.deployments).then((v) => set({ deployments: v })))
    if (keys.includes('databases')) tasks.push(fetchOrKeep<DatabaseInstance[]>('/api/databases', s.databases).then((v) => set({ databases: v })))
    if (keys.includes('volumes')) tasks.push(fetchOrKeep<Volume[]>('/api/volumes', s.volumes).then((v) => set({ volumes: v })))
    if (keys.includes('servers')) tasks.push(fetchOrKeep<Server[]>('/api/servers', s.servers).then((v) => set({ servers: v })))
    if (keys.includes('backups')) tasks.push(fetchOrKeep<BackupRecord[]>('/api/backups', s.backups).then((v) => set({ backups: v })))
    if (keys.includes('schedules')) tasks.push(fetchOrKeep<BackupSchedule[]>('/api/backups/schedules', s.backupSchedules).then((v) => set({ backupSchedules: v })))
    if (keys.includes('notifications')) tasks.push(fetchOrKeep<Notification[]>('/api/notifications', s.notifications).then((v) => set({ notifications: v })))
    if (keys.includes('activity')) tasks.push(fetchOrKeep<ActivityEvent[]>('/api/activity', s.activity).then((v) => set({ activity: v })))
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
    // ponytail: refetch deployments too — a DB provision now creates a
    // Deployment row (kind=database), so it appears in the Deployments view.
    await get().refetch(['databases', 'deployments', 'activity', 'notifications'])
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

  updateVolume: async (id, patch) => {
    await api.patch(`/api/volumes/${id}`, patch)
    await get().refetch(['volumes', 'activity', 'notifications'])
  },

  deleteVolume: async (id, removeData) => {
    await api.del(`/api/volumes/${id}?removeData=${removeData ? 'true' : 'false'}`)
    await get().refetch(['volumes', 'activity', 'notifications'])
  },

  addDomain: async (projectId, hostname, type, ssl) => {
    await api.post(`/api/projects/${projectId}/domains`, { hostname, type, ssl })
    await get().refetch(['projects', 'activity', 'notifications'])
  },

  deleteDomain: async (projectId, domainId) => {
    await api.del(`/api/projects/${projectId}/domains/${domainId}`)
    await get().refetch(['projects', 'activity', 'notifications'])
  },

  restartDatabase: async (id) => {
    await api.post(`/api/databases/${id}/restart`)
    await get().refetch(['databases', 'activity', 'notifications'])
  },

  reconcileProject: async (projectId) => {
    await api.post(`/api/projects/${projectId}/reconcile`)
    await get().refetch(['projects', 'activity', 'notifications'])
  },

  runBackup: async (target, targetKind) => {
    await api.post('/api/backups', { target, targetKind })
    await get().refetch(['backups', 'activity'])
  },

  deleteBackupSchedule: async (id) => {
    await api.del(`/api/backups/schedules?id=${encodeURIComponent(id)}`)
    await get().refetch(['schedules', 'activity'])
  },

  addBackupSchedule: async (target, schedule, retentionDays) => {
    await api.post('/api/backups/schedules', { target, schedule, retentionDays })
    await get().refetch(['schedules', 'activity', 'notifications'])
  },

  scanHost: async () => {
    const result = await api.post<{ projects: number; databases: number; volumes: number; domains: number; skipped: number }>('/api/cluster/scan')
    // ponytail: refetch projects (domains are nested on the serialized project)
    // so newly-discovered + re-scanned domains render in the Domains view.
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

  stopService: async (projectId, serviceId) => {
    const url = serviceId
      ? `/api/projects/${projectId}/services/${serviceId}/stop`
      : `/api/projects/${projectId}/pause`
    await api.post(url)
    await get().refetch(['projects', 'activity'])
  },

  removeService: async (projectId, serviceId) => {
    await api.del(`/api/projects/${projectId}/services/${serviceId}`)
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
  }
})

// helpers
// ponytail: single derived "is any store-level overlay open" flag. The local
// topbar dropdowns (UserMenu, EnvToggle) subscribe to this and auto-close when
// a dialog / command palette / notifications panel opens — so only one overlay
// is ever on screen. One selector = one re-render source, no prop drilling.
export function useAnyOverlayOpen(): boolean {
  return useSlipway(
    (s) =>
      s.newDeploymentOpen ||
      s.newDatabaseOpen ||
      s.newVolumeOpen ||
      s.newDomainOpen ||
      s.newBackupOpen ||
      s.newBackupScheduleOpen ||
      s.newPreviewOpen ||
      s.newServerOpen ||
      s.newSshKeyOpen ||
      s.newRegistryOpen ||
      s.newWebhookOpen ||
      s.newTokenOpen ||
      s.addServiceOpen ||
      s.notifOpen ||
      s.commandOpen,
  )
}

export function useProject(id: string | null) {
  return useSlipway((s) => (id ? s.projects.find((p) => p.id === id) ?? null : null))
}

export function useDeploymentsFor(projectId: string | null) {
  return useSlipway((s) => (projectId ? s.deployments.filter((d) => d.projectId === projectId) : s.deployments))
}