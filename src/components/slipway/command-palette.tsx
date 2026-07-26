'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Search, Rocket, FolderGit2, Database, HardDrive, Globe, Activity, ScrollText, Archive, GitBranch, Settings, TerminalSquare, LayoutDashboard, ArrowRight, Server } from 'lucide-react'
import { useSlipway } from '@/lib/slipway/store'
import { cn } from '@/lib/utils'
import type { NavView } from '@/lib/slipway/types'

type Cmd = {
  id: string
  label: string
  hint: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  action: () => void
  group: 'navigate' | 'action' | 'project'
}

export function CommandPalette() {
  const open = useSlipway((s) => s.commandOpen)
  const setOpen = useSlipway((s) => s.setCommandOpen)
  const setView = useSlipway((s) => s.setView)
  const setNewDeploymentOpen = useSlipway((s) => s.setNewDeploymentOpen)
  const selectProject = useSlipway((s) => s.selectProject)
  const projects = useSlipway((s) => s.projects)
  const [query, setQuery] = React.useState('')
  const [activeIdx, setActiveIdx] = React.useState(0)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
    }
  }, [open])

  const navCommands: Cmd[] = [
    { id: 'nav-overview', label: 'Overview', hint: 'Dashboard home', icon: LayoutDashboard, action: () => setView('overview'), group: 'navigate' },
    { id: 'nav-projects', label: 'Projects', hint: 'All projects', icon: FolderGit2, action: () => setView('projects'), group: 'navigate' },
    { id: 'nav-deployments', label: 'Deployments', hint: 'All deployments', icon: Rocket, action: () => setView('deployments'), group: 'navigate' },
    { id: 'nav-previews', label: 'Preview environments', hint: 'PR environments', icon: GitBranch, action: () => setView('previews'), group: 'navigate' },
    { id: 'nav-databases', label: 'Databases', hint: 'Managed databases', icon: Database, action: () => setView('databases'), group: 'navigate' },
    { id: 'nav-storage', label: 'Storage', hint: 'Volumes', icon: HardDrive, action: () => setView('storage'), group: 'navigate' },
    { id: 'nav-domains', label: 'Domains & SSL', hint: 'TLS certificates', icon: Globe, action: () => setView('domains'), group: 'navigate' },
    { id: 'nav-backups', label: 'Backups', hint: 'Backup schedules & history', icon: Archive, action: () => setView('backups'), group: 'navigate' },
    { id: 'nav-metrics', label: 'Metrics', hint: 'Cluster-wide charts', icon: Activity, action: () => setView('metrics'), group: 'navigate' },
    { id: 'nav-logs', label: 'Live logs', hint: 'Streaming logs', icon: ScrollText, action: () => setView('logs'), group: 'navigate' },
    { id: 'nav-cli', label: 'CLI & Desktop app', hint: 'Install commands', icon: TerminalSquare, action: () => setView('cli'), group: 'navigate' },
    { id: 'nav-settings', label: 'Settings', hint: 'Cluster & account', icon: Settings, action: () => setView('settings'), group: 'navigate' },
  ]

  const actionCommands: Cmd[] = [
    { id: 'act-deploy', label: 'New deployment…', hint: 'Connect a repo or folder', icon: Rocket, action: () => setNewDeploymentOpen(true), group: 'action' },
    { id: 'act-add-server', label: 'Add a server to the cluster…', hint: 'SSH into a new node', icon: Server, action: () => setView('settings'), group: 'action' },
  ]

  const projectCommands: Cmd[] = projects.slice(0, 8).map((p) => ({
    id: `proj-${p.id}`,
    label: p.name,
    hint: p.stackLabel,
    icon: FolderGit2,
    action: () => selectProject(p.id),
    group: 'project' as const,
  }))

  const all = [...actionCommands, ...navCommands, ...projectCommands]
  const filtered = query
    ? all.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()) || c.hint.toLowerCase().includes(query.toLowerCase()))
    : all

  React.useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const execute = (c: Cmd) => {
    c.action()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden top-[20%] translate-y-0" style={{ position: 'fixed' }}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search and run Slipway commands.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 px-3 h-12 border-b border-border">
          <Search size={15} className="text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter' && filtered[activeIdx]) {
                e.preventDefault()
                execute(filtered[activeIdx])
              }
            }}
            placeholder="Search projects, deploys, services, commands…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-muted-foreground">No results.</div>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon
              const active = i === activeIdx
              return (
                <button
                  key={c.id}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => execute(c)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{c.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.hint}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                    {c.group}
                  </span>
                  {active && <ArrowRight size={12} className="text-muted-foreground" />}
                </button>
              )
            })
          )}
        </div>
        <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-mono">↑↓ navigate</span>
            <span className="font-mono">↵ select</span>
            <span className="font-mono">esc close</span>
          </div>
          <div className="font-mono">Slipway command palette</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
