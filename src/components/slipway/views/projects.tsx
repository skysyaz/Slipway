'use client'

import * as React from 'react'
import {
  Plus,
  Search,
  Filter,
  GitBranch,
  Folder,
  Boxes,
  ChevronRight,
  LayoutGrid,
  List,
  CircleDot,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StackGlyph, StatusDot } from '../icons'
import { TimeAgo, Memory, Cpu } from '../format'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/slipway/types'
import { envKey } from '@/lib/slipway/types'

export function ProjectsView() {
  const projects = useSlipway((s) => s.projects)
  const selectProject = useSlipway((s) => s.selectProject)
  const setNewDeploymentOpen = useSlipway((s) => s.setNewDeploymentOpen)
  // ponytail: the env filter is the GLOBAL one (topbar EnvToggle + the pills
  // below), so clicking Production/Staging/Preview in either place actually
  // filters the list. Previously the topbar set a global `env` that nothing
  // consumed — clicking it did nothing.
  const env = useSlipway((s) => s.env)
  const setEnv = useSlipway((s) => s.setEnv)

  const [query, setQuery] = React.useState('')
  const [view, setView] = React.useState<'grid' | 'list'>('grid')

  // ponytail: memoize the filtered list — without this the whole list re-filters
  // on every 5s poll (new projects array ref) even when env/query are unchanged.
  const filtered = React.useMemo(
    () =>
      projects.filter((p) => {
        if (env !== 'all' && envKey(p.environment) !== envKey(env)) return false
        if (!query) return true
        return (
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.stackLabel.toLowerCase().includes(query.toLowerCase()) ||
          p.slug.includes(query.toLowerCase())
        )
      }),
    [projects, env, query],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Projects</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {projects.length} projects · {projects.filter((p) => p.status === 'running').length} healthy ·{' '}
            {projects.filter((p) => p.status === 'degraded').length} degraded
          </p>
        </div>
        <Button size="sm" className="h-9 gap-2" onClick={() => setNewDeploymentOpen(true)}>
          <Plus size={14} />
          New project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 h-9">
          {(['all', 'production', 'staging', 'preview'] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={cn(
                'px-2.5 h-8 rounded text-[12px] capitalize transition-colors',
                env === e ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 h-9">
          <button
            onClick={() => setView('grid')}
            className={cn('w-8 h-8 rounded flex items-center justify-center transition-colors', view === 'grid' ? 'bg-accent' : 'hover:bg-accent/50')}
            aria-label="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('w-8 h-8 rounded flex items-center justify-center transition-colors', view === 'list' ? 'bg-accent' : 'hover:bg-accent/50')}
            aria-label="List view"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground text-[13px]">
          No projects match your filters.
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => selectProject(p.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {filtered.map((p, i) => (
            <ProjectRow key={p.id} project={p} onClick={() => selectProject(p.id)} last={i === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const SourceIcon = project.source === 'git' ? GitBranch : project.source === 'folder' ? Folder : Boxes
  return (
    <button
      onClick={onClick}
      // ponytail: bug 3 — scope the transition to shadow + border-color only.
      // `transition-all` animates layout-affecting properties on a big card grid
      // (a re-render storm source); transform/opacity-style props are all we keep.
      className="text-left rounded-xl border border-border bg-card hover:border-muted-foreground/40 hover:shadow-md transition-[box-shadow,border-color] p-4 group"
    >
      <div className="flex items-start gap-3">
        <StackGlyph stack={project.stack} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold truncate">{project.name}</span>
            {project.monorepo && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                monorepo
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{project.stackLabel}</div>
        </div>
        <StatusDot status={project.status} />
      </div>

      <p className="text-[12px] text-muted-foreground mt-3 line-clamp-2 leading-snug">{project.description}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-muted-foreground">Replicas</div>
          <div className="font-mono mt-0.5">{project.replicas}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Memory</div>
          <div className="font-mono mt-0.5"><Memory mb={project.memoryMb} /></div>
        </div>
        <div>
          <div className="text-muted-foreground">Deploys</div>
          <div className="font-mono mt-0.5">{project.monthlyDeploys}/mo</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <SourceIcon size={11} />
          <span className="font-mono truncate max-w-[140px]">{project.repoUrl ?? project.folderPath ?? 'compose'}</span>
        </div>
        <TimeAgo ts={project.lastDeployedAt} className="text-[11px]" />
      </div>
    </button>
  )
}

function ProjectRow({ project, onClick, last }: { project: Project; onClick: () => void; last: boolean }) {
  const SourceIcon = project.source === 'git' ? GitBranch : project.source === 'folder' ? Folder : Boxes
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3',
        !last && 'border-b border-border',
      )}
    >
      <StackGlyph stack={project.stack} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium truncate">{project.name}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">{project.environment}</Badge>
          {project.monorepo && <Badge variant="outline" className="text-[9px] h-4 px-1">monorepo</Badge>}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
          {project.stackLabel} · <SourceIcon size={9} className="inline" /> {project.repoUrl ?? project.folderPath ?? 'compose'}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-6 text-[11px] text-muted-foreground shrink-0">
        <div className="w-16 text-right">
          <div className="font-mono text-foreground">{project.replicas}x</div>
          <div>replicas</div>
        </div>
        <div className="w-20 text-right">
          <div className="font-mono text-foreground">{project.successRate}%</div>
          <div>success</div>
        </div>
        <div className="w-24 text-right">
          <div className="font-mono text-foreground">{project.monthlyDeploys}</div>
          <div>deploys/mo</div>
        </div>
      </div>
      <StatusDot status={project.status} />
      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
    </button>
  )
}
