'use client'

import * as React from 'react'
import { Rocket, History, Filter, Search, Check, AlertTriangle, Clock, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StackGlyph, StatusDot } from '../icons'
import { TimeAgo, Duration } from '../format'
import { cn } from '@/lib/utils'

export function DeploymentsView() {
  const deployments = useSlipway((s) => s.deployments)
  const projects = useSlipway((s) => s.projects)
  const selectProject = useSlipway((s) => s.selectProject)
  const setRollbackTarget = useSlipway((s) => s.setRollbackTarget)
  const [query, setQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'building' | 'healthy' | 'failed' | 'rolled_back'>('all')

  const filtered = deployments.filter((d) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'building' && d.status !== 'building' && d.status !== 'deploying' && d.status !== 'queued') return false
      if (statusFilter === 'healthy' && d.status !== 'healthy') return false
      if (statusFilter === 'failed' && d.status !== 'failed' && d.status !== 'cancelled') return false
      if (statusFilter === 'rolled_back' && d.status !== 'rolled_back') return false
    }
    if (!query) return true
    return (
      d.projectName.toLowerCase().includes(query.toLowerCase()) ||
      d.commitMessage.toLowerCase().includes(query.toLowerCase()) ||
      d.commitSha.includes(query.toLowerCase()) ||
      d.author.toLowerCase().includes(query.toLowerCase())
    )
  })

  const stats = {
    total: deployments.length,
    healthy: deployments.filter((d) => d.status === 'healthy').length,
    failed: deployments.filter((d) => d.status === 'failed' || d.status === 'cancelled').length,
    inFlight: deployments.filter((d) => d.status === 'building' || d.status === 'deploying').length,
    rolled: deployments.filter((d) => d.status === 'rolled_back' || d.rollbackOfId).length,
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Deployments</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {stats.total} deploys · {stats.healthy} healthy · {stats.failed} failed · {stats.inFlight} in flight · {stats.rolled} rollbacks
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by commit, project, author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 h-9">
          {(['all', 'building', 'healthy', 'failed', 'rolled_back'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 h-8 rounded text-[12px] capitalize transition-colors',
                statusFilter === s ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'rolled_back' ? 'rollbacks' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.map((d, i) => {
          const project = projects.find((p) => p.id === d.projectId)
          return (
            <div
              key={d.id}
              className={cn('p-4 hover:bg-accent/30 transition-colors', i !== filtered.length - 1 && 'border-b border-border')}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => selectProject(d.projectId)}
                  className="shrink-0 hover:opacity-80 transition-opacity"
                  title={d.projectName}
                >
                  <StackGlyph stack={project?.stack ?? 'node'} size={32} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => selectProject(d.projectId)}
                      className="text-[14px] font-semibold hover:text-primary transition-colors"
                    >
                      {d.projectName}
                    </button>
                    <Badge variant="outline" className="text-[10px] capitalize h-5">{d.environment}</Badge>
                    {d.rollbackOfId && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        <History size={9} className="mr-0.5" />
                        Rollback
                      </Badge>
                    )}
                  </div>
                  <div className="text-[12px] mt-0.5">{d.commitMessage}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-1 flex items-center gap-2 flex-wrap">
                    <span>{d.commitSha}</span>
                    <span className="text-border">·</span>
                    <span>{d.branch}</span>
                    <span className="text-border">·</span>
                    <span>by {d.author}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <StatusDot status={d.status} />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    <TimeAgo ts={d.createdAt} className="text-[10px]" />
                  </div>
                  {d.durationMs && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      <Duration ms={d.durationMs} className="text-[10px]" />
                    </div>
                  )}
                </div>
              </div>

              {/* Pipeline */}
              <div className="mt-3 flex items-center gap-1 overflow-x-auto">
                {d.steps.map((s, idx) => (
                  <React.Fragment key={s.stage}>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center border text-[9px]',
                          s.status === 'healthy' && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500',
                          s.status === 'building' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                          s.status === 'deploying' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                          s.status === 'failed' && 'bg-rose-500/15 border-rose-500/40 text-rose-500',
                          s.status === 'queued' && 'bg-muted border-border text-muted-foreground',
                          s.status === 'cancelled' && 'bg-muted/50 border-border text-muted-foreground/60',
                        )}
                      >
                        {s.status === 'healthy' ? (
                          <Check size={10} />
                        ) : s.status === 'failed' ? (
                          <AlertTriangle size={10} />
                        ) : s.status === 'building' || s.status === 'deploying' ? (
                          <Clock size={10} className="animate-pulse" />
                        ) : (
                          <span className="font-mono">{idx + 1}</span>
                        )}
                      </div>
                      <div className="text-[8px] text-muted-foreground whitespace-nowrap">{s.label}</div>
                    </div>
                    {idx < d.steps.length - 1 && (
                      <div className={cn('h-px w-3 shrink-0', s.status === 'healthy' ? 'bg-emerald-500/40' : 'bg-border')} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {d.status === 'healthy' && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setRollbackTarget(d)}
                  >
                    <History size={11} className="mr-1" />
                    Roll back
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => selectProject(d.projectId)}>
                    View project →
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-[13px] text-muted-foreground">
            No deployments match your filters.
          </div>
        )}
      </div>
    </div>
  )
}
