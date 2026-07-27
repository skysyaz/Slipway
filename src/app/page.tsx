'use client'

import * as React from 'react'
import { Sidebar } from '@/components/slipway/sidebar'
import { Topbar } from '@/components/slipway/topbar'
import { NewDeploymentDialog } from '@/components/slipway/new-deployment-dialog'
import { RollbackDialog } from '@/components/slipway/rollback-dialog'
import { AllDialogs, AddServiceDialog } from '@/components/slipway/action-dialogs'
import { OverviewView } from '@/components/slipway/views/overview'
import { ProjectsView } from '@/components/slipway/views/projects'
import { ProjectDetailView } from '@/components/slipway/views/project-detail'
import { DeploymentsView } from '@/components/slipway/views/deployments'
import { DatabasesView } from '@/components/slipway/views/databases'
import { StorageView } from '@/components/slipway/views/storage'
import { DomainsView } from '@/components/slipway/views/domains'
import { MetricsView } from '@/components/slipway/views/metrics'
import { LogsView } from '@/components/slipway/views/logs'
import { BackupsView } from '@/components/slipway/views/backups'
import { PreviewsView } from '@/components/slipway/views/previews'
import { SettingsView } from '@/components/slipway/views/settings'
import { CliDesktopView } from '@/components/slipway/views/cli-desktop'
import { LoginView } from '@/components/slipway/views/login'
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
  // progression, backups completing, notifications) every 4s.
  React.useEffect(() => {
    void hydrate()
    const id = setInterval(() => {
      void refetchAll()
    }, 4000)
    return () => clearInterval(id)
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
          {view === 'project-detail' && <ProjectDetailView />}
          {view === 'deployments' && <DeploymentsView />}
          {view === 'databases' && <DatabasesView />}
          {view === 'storage' && <StorageView />}
          {view === 'domains' && <DomainsView />}
          {view === 'metrics' && <MetricsView />}
          {view === 'logs' && <LogsView />}
          {view === 'backups' && <BackupsView />}
          {view === 'previews' && <PreviewsView />}
          {view === 'settings' && <SettingsView />}
          {view === 'cli' && <CliDesktopView />}
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
