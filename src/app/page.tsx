'use client'

import * as React from 'react'
import { Sidebar } from '@/components/slipway/sidebar'
import { Topbar } from '@/components/slipway/topbar'
import { NewDeploymentDialog } from '@/components/slipway/new-deployment-dialog'
import { RollbackDialog } from '@/components/slipway/rollback-dialog'
import { AllDialogs, AddServiceDialog } from '@/components/slipway/action-dialogs'
import { OverviewView } from '@/components/slipway/views/overview'
import { ProjectsView } from '@/components/slipway/views/projects'
import { DatabasesView } from '@/components/slipway/views/databases'
import { LoginView } from '@/components/slipway/views/login'
// ponytail: bug 3 — code-split the heavy secondary views. Overview / projects /
// databases stay eager (first paint + where most fixes live); the rest are
// React.lazy chunks fetched on first visit. Suspense sits on the view switch
// only, so the shell (sidebar/topbar/dialogs) stays mounted outside it and the
// transition into a lazy view doesn't re-mount the whole app.
const ProjectDetailView = React.lazy(() => import('@/components/slipway/views/project-detail').then((m) => ({ default: m.ProjectDetailView })))
const DeploymentsView = React.lazy(() => import('@/components/slipway/views/deployments').then((m) => ({ default: m.DeploymentsView })))
const StorageView = React.lazy(() => import('@/components/slipway/views/storage').then((m) => ({ default: m.StorageView })))
const DomainsView = React.lazy(() => import('@/components/slipway/views/domains').then((m) => ({ default: m.DomainsView })))
const MetricsView = React.lazy(() => import('@/components/slipway/views/metrics').then((m) => ({ default: m.MetricsView })))
const LogsView = React.lazy(() => import('@/components/slipway/views/logs').then((m) => ({ default: m.LogsView })))
const BackupsView = React.lazy(() => import('@/components/slipway/views/backups').then((m) => ({ default: m.BackupsView })))
const PreviewsView = React.lazy(() => import('@/components/slipway/views/previews').then((m) => ({ default: m.PreviewsView })))
const SettingsView = React.lazy(() => import('@/components/slipway/views/settings').then((m) => ({ default: m.SettingsView })))
const CliDesktopView = React.lazy(() => import('@/components/slipway/views/cli-desktop').then((m) => ({ default: m.CliDesktopView })))
import { useSlipway } from '@/lib/slipway/store'
import { useAuth } from '@/components/slipway/auth-provider'
import { CommandPalette } from '@/components/slipway/command-palette'
import { MobileNav } from '@/components/slipway/mobile-nav'

function AppShell() {
  const view = useSlipway((s) => s.view)
  const selectedProjectId = useSlipway((s) => s.selectedProjectId)
  const hydrate = useSlipway((s) => s.hydrate)
  const refetchAll = useSlipway((s) => s.refetchAll)

  // Hydrate from the API on mount, then poll for server-side progress (deploy
  // progression, backups completing, notifications) every 5s.
  // ponytail: PAUSE the poll when the tab is hidden (visibilitychange) — a
  // backgrounded dashboard sampling `docker stats` + `du` every few seconds is
  // pure waste on the host (and the source of the "dashboard feels heavy"
  // symptom). Resumes on focus. The interval is cleared + recreated, not
  // no-op'd, so no leaked timer fires while hidden.
  React.useEffect(() => {
    void hydrate()
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id === null) id = setInterval(() => void refetchAll(), 5000)
    }
    const stop = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const onVis = () => {
      if (document.hidden) stop()
      else start()
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [hydrate, refetchAll])

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <MobileNav />
        <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1600px] w-full mx-auto">
          {view === 'overview' && <OverviewView />}
          {view === 'projects' && <ProjectsView />}
          {view === 'databases' && <DatabasesView />}
          <React.Suspense fallback={<div className="flex items-center justify-center py-12"><span className="text-[12px] text-muted-foreground">Loading…</span></div>}>
            {view === 'project-detail' && <ProjectDetailView />}
            {view === 'deployments' && <DeploymentsView />}
            {view === 'storage' && <StorageView />}
            {view === 'domains' && <DomainsView />}
            {view === 'metrics' && <MetricsView />}
            {view === 'logs' && <LogsView />}
            {view === 'backups' && <BackupsView />}
            {view === 'previews' && <PreviewsView />}
            {view === 'settings' && <SettingsView />}
            {view === 'cli' && <CliDesktopView />}
          </React.Suspense>
        </main>
        <footer className="mt-auto border-t border-border py-4 px-6 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="font-mono">Slipway · self-hosted</span>
            <span className="text-border">·</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">Docs</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">Apache 2.0</a>
          </div>
          <div className="font-mono">
            self-hosted deployment platform
          </div>
        </footer>
      </div>
      <NewDeploymentDialog />
      <RollbackDialog />
      {selectedProjectId && <AddServiceDialog projectId={selectedProjectId} />}
      <AllDialogs />
      <CommandPalette />
    </div>
  )
}

export default function Home() {
  // useAuth() returns immediately — no loading state.
  // On the server and initial client render, user is null → LoginView.
  // After mount, if a session exists in localStorage, user is set → AppShell.
  // This avoids any "stuck on loading" issue in restricted iframe environments.
  const { user } = useAuth()

  // The store data uses Math.random/Date.now, which differ between server
  // and client. To avoid hydration mismatches, we render LoginView (which is
  // deterministic) on the server, then let the client take over.
  // Since LoginView has no random data, SSR and client match perfectly.
  if (!user) return <LoginView />
  return <AppShell />
}
