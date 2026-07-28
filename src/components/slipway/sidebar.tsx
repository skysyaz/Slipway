'use client'

import * as React from 'react'
import {
  LayoutDashboard,
  FolderGit2,
  Rocket,
  Database,
  HardDrive,
  Globe,
  Activity,
  ScrollText,
  Archive,
  GitBranch,
  Settings,
  TerminalSquare,
  Server,
  CircleDot,
  LifeBuoy,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSlipway } from '@/lib/slipway/store'
import { SlipwayMark } from './icons'
import { APP_LABEL } from '@/config/app'
import type { NavView } from '@/lib/slipway/types'

const nav: Array<{ id: NavView; label: string; icon: React.ComponentType<{ className?: string; size?: number }>; group: 'build' | 'infra' | 'observe' | 'system' }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'build' },
  { id: 'projects', label: 'Projects', icon: FolderGit2, group: 'build' },
  { id: 'deployments', label: 'Deployments', icon: Rocket, group: 'build' },
  { id: 'previews', label: 'Preview envs', icon: GitBranch, group: 'build' },
  { id: 'databases', label: 'Databases', icon: Database, group: 'infra' },
  { id: 'storage', label: 'Storage', icon: HardDrive, group: 'infra' },
  { id: 'domains', label: 'Domains & SSL', icon: Globe, group: 'infra' },
  { id: 'backups', label: 'Backups', icon: Archive, group: 'infra' },
  { id: 'metrics', label: 'Metrics', icon: Activity, group: 'observe' },
  { id: 'logs', label: 'Live logs', icon: ScrollText, group: 'observe' },
  { id: 'cli', label: 'CLI & Desktop', icon: TerminalSquare, group: 'system' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'system' },
]

const groupLabels: Record<string, string> = {
  build: 'Build & Deploy',
  infra: 'Infrastructure',
  observe: 'Observe',
  system: 'System',
}

export function Sidebar() {
  const view = useSlipway((s) => s.view)
  const setView = useSlipway((s) => s.setView)
  const servers = useSlipway((s) => s.servers)
  const onlineCount = servers.filter((s) => s.status === 'online').length

  const groups = React.useMemo(() => {
    const g: Record<string, typeof nav> = {}
    nav.forEach((item) => {
      ;(g[item.group] = g[item.group] || []).push(item)
    })
    return g
  }, [])

  return (
    <aside className="hidden md:flex w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground h-screen sticky top-0">
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
        <SlipwayMark size={26} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Slipway</span>
          <span className="text-[10px] text-muted-foreground font-mono">{APP_LABEL}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {groupLabels[group]}
            </div>
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon
                const active = view === item.id || (item.id === 'projects' && view === 'project-detail')
                return (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon size={15} className={active ? 'text-primary' : ''} />
                    <span>{item.label}</span>
                    {item.id === 'deployments' && (
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 rounded">
                        3
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2.5 space-y-1">
        <button
          onClick={() => setView('settings')}
          className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] hover:bg-sidebar-accent/60 transition-colors"
        >
          <Server size={15} className="text-muted-foreground" />
          <div className="flex-1 text-left leading-tight">
            <div className="font-medium">Cluster: helix-eu</div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {onlineCount}/{servers.length} servers online
            </div>
          </div>
          <CircleDot size={10} className="text-emerald-500 pulse-dot" />
        </button>
        <div className="flex items-center gap-1 px-1">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 transition-colors"
            title="Documentation"
          >
            <BookOpen size={12} />
            Docs
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 transition-colors"
            title="Community"
          >
            <LifeBuoy size={12} />
            Support
          </a>
        </div>
      </div>
    </aside>
  )
}
