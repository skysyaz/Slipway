'use client'

import { create } from 'zustand'
import { nextLogLine } from './data'
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
  metrics: { cpu: number; memory: number; disk: number; network: { in: number; out: number }; uptime: number }

  // ui
  newDeploymentOpen: boolean
  setNewDeploymentOpen: (open: boolean) => void
  rollbackTarget: Deployment | null
  setRollbackTarget: (d: Deployment | null) => void
  notifOpen: boolean
  setNotifOpen: (open: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void

  // actions
  triggerDeployment: (projectId: string) => void
  rollback: (deploymentId: string) => void
  promoteToProduction: (projectId: string) => void
  markAllNotifsRead: () => void
  pushLog: () => void
  appendLogs: (n: number) => void
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
  notifications: [],
  activity: [],
  logs: [],
  metrics: { cpu: 0, memory: 0, disk: 0, network: { in: 0, out: 0 }, uptime: 0 },

  newDeploymentOpen: false,
  setNewDeploymentOpen: (open) => set({ newDeploymentOpen: open }),
  rollbackTarget: null,
  setRollbackTarget: (d) => set({ rollbackTarget: d }),
  notifOpen: false,
  setNotifOpen: (open) => set({ notifOpen: open }),
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),

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
    set((s) => ({ deployments: [newDep, ...s.deployments] }))
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
      activity: [
        {
          id: 'a-' + Math.random().toString(36).slice(2, 7),
          ts: new Date().toISOString(),
          actor: 'you',
          kind: 'rollback',
          message: `rolled back ${dep.projectName} to ${dep.commitSha}`,
          projectId: dep.projectId,
        },
        ...s.activity,
      ],
    }))
  },

  promoteToProduction: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    set((s) => ({
      activity: [
        {
          id: 'a-' + Math.random().toString(36).slice(2, 7),
          ts: new Date().toISOString(),
          actor: 'you',
          kind: 'deploy',
          message: `promoted ${project.name} to production`,
          projectId,
        },
        ...s.activity,
      ],
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
}))

// helpers
export function useProject(id: string | null) {
  return useSlipway((s) => (id ? s.projects.find((p) => p.id === id) ?? null : null))
}

export function useDeploymentsFor(projectId: string | null) {
  return useSlipway((s) => (projectId ? s.deployments.filter((d) => d.projectId === projectId) : s.deployments))
}
