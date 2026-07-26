'use client'

import * as React from 'react'
import { Sidebar } from '@/components/slipway/sidebar'
import { Topbar } from '@/components/slipway/topbar'
import { NewDeploymentDialog } from '@/components/slipway/new-deployment-dialog'
import { RollbackDialog } from '@/components/slipway/rollback-dialog'
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
import { SlipwayMark } from '@/components/slipway/icons'

function AppShell() {
  const view = useSlipway((s) => s.view)

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
            <span className="font-mono">Slipway v1.4.2 · self-hosted</span>
            <span className="text-border">·</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">Docs</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground transition-colors">Apache 2.0</a>
          </div>
          <div className="font-mono">
            cluster: helix-eu · region: eu-fra1 · uptime 99.98%
          </div>
        </footer>
      </div>
      <NewDeploymentDialog />
      <RollbackDialog />
      <CommandPalette />
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <SlipwayMark size={36} />
        <div className="text-[13px] text-muted-foreground font-mono">Booting Slipway…</div>
        <div className="w-32 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()
  // Avoid hydration mismatches: the seed data uses Math.random / Date.now,
  // so we render a static shell on the server and swap in the live UI after mount.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || loading) return <LoadingShell />
  if (!user) return <LoginView />
  return <AppShell />
}
