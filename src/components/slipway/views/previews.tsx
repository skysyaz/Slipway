'use client'

import * as React from 'react'
import { GitBranch, GitPullRequest, Plus, ExternalLink, Clock, X, RefreshCw, Trash2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StackGlyph, StatusDot } from '../icons'
import { TimeAgo } from '../format'
import { cn } from '@/lib/utils'

export function PreviewsView() {
  const projects = useSlipway((s) => s.projects)
  const selectProject = useSlipway((s) => s.selectProject)

  const previews = projects.filter((p) => p.environment === 'preview')
  const stagingProjects = projects.filter((p) => p.environment === 'staging')

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Preview environments</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {previews.length} active previews · {stagingProjects.length} staging environments · auto-cleanup after PR close
          </p>
        </div>
        <Button size="sm" className="h-9 gap-2">
          <Plus size={13} />
          New preview
        </Button>
      </div>

      {/* Banner */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/8 via-background to-background p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <GitPullRequest size={16} className="text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">Every PR gets its own environment</div>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
            Slipway builds a disposable preview environment on every pull request — full app, isolated database,
            wildcard SSL. Branches <code className="font-mono text-[11px]">staging</code> and <code className="font-mono text-[11px]">main</code> promote to staging and production automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Active previews */}
        <div className="rounded-xl border border-border bg-card">
          <div className="h-11 px-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <GitBranch size={14} className="text-primary" />
              Active previews
            </div>
            <Badge variant="outline" className="text-[10px]">{previews.length}</Badge>
          </div>
          {previews.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors flex items-center gap-3 border-b border-border last:border-b-0"
            >
              <StackGlyph stack={p.stack} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{p.name}</span>
                  <StatusDot status={p.status} />
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  {p.url?.replace('https://', '')}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-muted-foreground">
                  <TimeAgo ts={p.lastDeployedAt} className="text-[10px]" />
                </div>
                <ExternalLink size={11} className="text-muted-foreground mt-1" />
              </div>
            </button>
          ))}
        </div>

        {/* Staging envs */}
        <div className="rounded-xl border border-border bg-card">
          <div className="h-11 px-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <GitBranch size={14} className="text-amber-500" />
              Staging environments
            </div>
            <Badge variant="outline" className="text-[10px]">{stagingProjects.length}</Badge>
          </div>
          {stagingProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors flex items-center gap-3 border-b border-border last:border-b-0"
            >
              <StackGlyph stack={p.stack} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{p.name}</span>
                  <StatusDot status={p.status} />
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  {p.url?.replace('https://', '')}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-muted-foreground">
                  <TimeAgo ts={p.lastDeployedAt} className="text-[10px]" />
                </div>
                <ExternalLink size={11} className="text-muted-foreground mt-1" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Promotion flow */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[13px] font-semibold mb-3">Promotion flow</div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { label: 'Pull request', detail: 'preview env spun up', color: 'oklch(0.65 0.18 250)' },
            { label: 'Merge to staging', detail: 'staging auto-deploys', color: 'oklch(0.78 0.16 70)' },
            { label: 'Merge to main', detail: 'production auto-deploys', color: 'oklch(0.7 0.17 158)' },
            { label: 'Tag a release', detail: 'snapshot retained for rollback', color: 'oklch(0.6 0.06 280)' },
          ].map((step, i) => (
            <React.Fragment key={step.label}>
              <div className="flex-1 min-w-[160px] rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: step.color }} />
                  <span className="text-[12px] font-medium">{step.label}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{step.detail}</div>
              </div>
              {i < 3 && <div className="text-muted-foreground">→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Cleanup settings */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold">Auto-cleanup policy</div>
          <Button variant="outline" size="sm" className="h-7 text-[11px]">Edit</Button>
        </div>
        <div className="space-y-2">
          {[
            { label: 'Close preview when PR is merged', on: true },
            { label: 'Close preview when PR is closed without merge', on: true },
            { label: 'Tear down stale previews after 7 days', on: true },
            { label: 'Keep preview database snapshots for 30 days after teardown', on: true },
            { label: 'Notify on Slack before tearing down a preview', on: false },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 py-1.5 text-[12px]">
              <span className={cn('w-4 h-4 rounded-full flex items-center justify-center', s.on ? 'bg-emerald-500 text-emerald-950' : 'bg-muted text-muted-foreground')}>
                {s.on ? <span className="text-[10px]">✓</span> : <span className="text-[10px]">×</span>}
              </span>
              <span className="flex-1">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
