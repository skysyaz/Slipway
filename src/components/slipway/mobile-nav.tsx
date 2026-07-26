'use client'

import * as React from 'react'
import { Menu, X, LayoutDashboard, FolderGit2, Rocket, Database, HardDrive, Globe, Activity, ScrollText, Archive, GitBranch, Settings, TerminalSquare } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useSlipway } from '@/lib/slipway/store'
import { SlipwayMark } from './icons'
import { cn } from '@/lib/utils'
import type { NavView } from '@/lib/slipway/types'

const nav: Array<{ id: NavView; label: string; icon: React.ComponentType<{ className?: string; size?: number }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'previews', label: 'Preview envs', icon: GitBranch },
  { id: 'databases', label: 'Databases', icon: Database },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'domains', label: 'Domains & SSL', icon: Globe },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'metrics', label: 'Metrics', icon: Activity },
  { id: 'logs', label: 'Live logs', icon: ScrollText },
  { id: 'cli', label: 'CLI & Desktop', icon: TerminalSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const view = useSlipway((s) => s.view)
  const setView = useSlipway((s) => s.setView)
  const servers = useSlipway((s) => s.servers)

  const navigate = (v: NavView) => {
    setView(v)
    setOpen(false)
  }

  return (
    <>
      <div className="md:hidden h-12 px-4 flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setOpen(true)}
          className="h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>
        <div className="flex items-center gap-2">
          <SlipwayMark size={20} />
          <span className="text-[13px] font-semibold">Slipway</span>
        </div>
        <div className="ml-auto text-[10px] text-muted-foreground font-mono">
          {servers.filter((s) => s.status === 'online').length}/{servers.length} online
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SheetHeader className="h-14 px-4 flex flex-row items-center gap-2 border-b border-border space-y-0">
            <SlipwayMark size={22} />
            <SheetTitle className="text-[14px] font-semibold">Slipway</SheetTitle>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={14} />
            </button>
          </SheetHeader>
          <nav className="p-2.5 space-y-0.5 overflow-y-auto h-[calc(100vh-56px)]">
            {nav.map((item) => {
              const Icon = item.icon
              const active = view === item.id || (item.id === 'projects' && view === 'project-detail')
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-colors',
                    active ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon size={15} className={active ? 'text-primary' : ''} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
