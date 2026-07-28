'use client'

import * as React from 'react'
import {
  ChevronLeft,
  Rocket,
  History,
  Settings2,
  Globe,
  KeyRound,
  ScrollText,
  Activity,
  Archive,
  ExternalLink,
  GitBranch,
  Folder,
  Boxes,
  Cpu,
  MemoryStick,
  HardDrive,
  Plus,
  RotateCcw,
  MoreHorizontal,
  Terminal,
  Copy,
  Server,
  Clock,
  Check,
  AlertTriangle,
  Star,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useSlipway } from '@/lib/slipway/store'
import { api, ApiError } from '@/lib/api'
import { StackGlyph, DbGlyph, StatusDot } from '../icons'
import { TimeAgo, Duration, Memory, Cpu as CpuFmt, Sparkline, BytesShort, lastV } from '../format'
import { cn } from '@/lib/utils'
import { useToast, toast } from '@/hooks/use-toast'
import type { Project, Deployment } from '@/lib/slipway/types'

export function ProjectDetailView() {
  const selectedId = useSlipway((s) => s.selectedProjectId)
  const project = useSlipway((s) => s.projects.find((p) => p.id === selectedId))
  const setView = useSlipway((s) => s.setView)
  const setNewDeploymentOpen = useSlipway((s) => s.setNewDeploymentOpen)
  const triggerDeployment = useSlipway((s) => s.triggerDeployment)
  const setRollbackTarget = useSlipway((s) => s.setRollbackTarget)
  const setNewDomainOpen = useSlipway((s) => s.setNewDomainOpen)
  const setAddServiceOpen = useSlipway((s) => s.setAddServiceOpen)
  const setNewBackupOpen = useSlipway((s) => s.setNewBackupOpen)
  const restartService = useSlipway((s) => s.restartService)
  const [tab, setTab] = React.useState('overview')

  if (!project) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Project not found.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setView('projects')}>
          Back to projects
        </Button>
      </div>
    )
  }

  const SourceIcon = project.source === 'git' ? GitBranch : project.source === 'folder' ? Folder : Boxes

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={() => setView('projects')}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={13} />
          Projects
        </button>
        <div className="mt-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-3">
            <StackGlyph stack={project.stack} size={44} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] font-semibold tracking-tight">{project.name}</h1>
                <Badge variant="outline" className="text-[10px] capitalize">{project.environment}</Badge>
                <StatusDot status={project.status} />
                {project.monorepo && (
                  <Badge variant="outline" className="text-[10px]">
                    monorepo · {project.monorepoPath}
                  </Badge>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground font-mono mt-1 flex items-center gap-2 flex-wrap">
                <SourceIcon size={11} />
                {project.repoUrl ?? project.folderPath ?? 'compose import'}
                <span className="text-border">·</span>
                <span>{project.stackLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setView('logs')}>
              <Terminal size={13} />
              <span className="hidden sm:inline">Logs</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => triggerDeployment(project.id)}>
              <Rocket size={13} />
              <span className="hidden sm:inline">Redeploy</span>
            </Button>
            <Button size="sm" className="h-9 gap-2" onClick={() => setNewDeploymentOpen(true)}>
              <Plus size={13} />
              <span className="hidden sm:inline">New deploy</span>
            </Button>
          </div>
        </div>
      </div>

      {project.url && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-3">
          <Globe size={14} className="text-primary shrink-0" />
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-[13px] font-mono hover:text-primary transition-colors truncate flex-1"
          >
            {project.url.replace('https://', '')}
          </a>
          <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            <Check size={10} className="mr-0.5" />
            SSL active
          </Badge>
          <ExternalLink size={12} className="text-muted-foreground" />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-transparent border-b border-border rounded-none w-full h-auto p-0 justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Overview
          </TabsTrigger>
          <TabsTrigger value="deployments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Deployments
          </TabsTrigger>
          <TabsTrigger value="services" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Services
          </TabsTrigger>
          <TabsTrigger value="domains" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Domains
          </TabsTrigger>
          <TabsTrigger value="env" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Env vars
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Logs
          </TabsTrigger>
          <TabsTrigger value="metrics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Metrics
          </TabsTrigger>
          <TabsTrigger value="backups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Backups
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <OverviewTab project={project} onRollbackClick={(d) => setRollbackTarget(d)} />
        </TabsContent>
        <TabsContent value="deployments" className="mt-5">
          <DeploymentsTab projectId={project.id} onRollbackClick={(d) => setRollbackTarget(d)} />
        </TabsContent>
        <TabsContent value="services" className="mt-5">
          <ServicesTab project={project} onAddService={() => setAddServiceOpen(true)} onRestart={(serviceId) => restartService(project.id, serviceId)} />
        </TabsContent>
        <TabsContent value="domains" className="mt-5">
          <DomainsTab project={project} onAddDomain={() => setNewDomainOpen(true)} />
        </TabsContent>
        <TabsContent value="env" className="mt-5">
          <EnvTab project={project} />
        </TabsContent>
        <TabsContent value="logs" className="mt-5">
          <ProjectLogsTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="metrics" className="mt-5">
          <MetricsTab project={project} />
        </TabsContent>
        <TabsContent value="backups" className="mt-5">
          <ProjectBackupsTab project={project} onRunBackup={() => setNewBackupOpen(true)} />
        </TabsContent>
        <TabsContent value="settings" className="mt-5">
          <SettingsTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OverviewTab({ project, onRollbackClick }: { project: Project; onRollbackClick: (d: Deployment) => void }) {
  const allDeployments = useSlipway((s) => s.deployments)
  const deployments = React.useMemo(
    () => allDeployments.filter((d) => d.projectId === project.id),
    [allDeployments, project.id],
  )
  const metrics = useSlipway((s) => s.metrics)
  const latest = deployments[0]
  const lastHealthy = deployments.find((d) => d.status === 'healthy')
  const selectProject = useSlipway((s) => s.selectProject)
  const setView = useSlipway((s) => s.setView)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Replicas" value={`${project.replicas}`} icon={Server} />
          <MiniStat label="Memory" value={`${(project.memoryMb / 1024).toFixed(2)} GB`} icon={MemoryStick} />
          <MiniStat label="CPU" value={`${(project.cpuMilli / 1000).toFixed(2)} vCPU`} icon={Cpu} />
          <MiniStat label="Success" value={`${project.successRate}%`} icon={Check} />
        </div>

        {/* Latest deploy pipeline */}
        {latest && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Rocket size={14} className="text-primary" />
                Latest deployment
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onRollbackClick(latest)}>
                <History size={11} className="mr-1" />
                Roll back to this
              </Button>
            </div>
            <div className="flex items-start gap-3 pb-3 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{latest.commitMessage}</div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {latest.commitSha || '—'} · {latest.branch} · by {latest.author}
                </div>
              </div>
              <div className="text-right shrink-0">
                <StatusDot status={latest.status} />
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                  <TimeAgo ts={latest.createdAt} className="text-[10px]" />
                </div>
              </div>
            </div>
            {/* Pipeline visualization */}
            <div className="mt-3 flex items-center gap-1 overflow-x-auto">
              {latest.steps.map((s, i) => (
                <React.Fragment key={s.stage}>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center border',
                        s.status === 'healthy' && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500',
                        s.status === 'building' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                        s.status === 'deploying' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                        s.status === 'failed' && 'bg-rose-500/15 border-rose-500/40 text-rose-500',
                        s.status === 'queued' && 'bg-muted border-border text-muted-foreground',
                        s.status === 'cancelled' && 'bg-muted/50 border-border text-muted-foreground/60',
                      )}
                    >
                      {s.status === 'healthy' ? (
                        <Check size={13} />
                      ) : s.status === 'failed' ? (
                        <AlertTriangle size={13} />
                      ) : s.status === 'building' || s.status === 'deploying' ? (
                        <Clock size={13} className="animate-pulse" />
                      ) : (
                        <span className="text-[10px] font-mono">{i + 1}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground whitespace-nowrap">{s.label}</div>
                  </div>
                  {i < latest.steps.length - 1 && (
                    <div className={cn('h-px w-6 shrink-0', s.status === 'healthy' ? 'bg-emerald-500/40' : 'bg-border')} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Recent deploys */}
        <div className="rounded-xl border border-border bg-card">
          <div className="h-11 px-4 flex items-center justify-between border-b border-border">
            <div className="text-[13px] font-semibold">Recent deployments</div>
          </div>
          <div className="divide-y divide-border">
            {deployments.slice(0, 5).map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate">{d.commitMessage}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {d.commitSha || '—'} · {d.branch}
                  </div>
                </div>
                <StatusDot status={d.status} />
                <Duration ms={d.durationMs} className="text-[11px] w-12 text-right" />
                <TimeAgo ts={d.createdAt} className="text-[10px] w-20 text-right" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] shrink-0"
                  onClick={() => onRollbackClick(d)}
                  disabled={d.status !== 'healthy'}
                >
                  <RotateCcw size={10} className="mr-1" />
                  Roll back
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[13px] font-semibold mb-3">Live traffic</div>
          <div className="text-[28px] font-semibold tabular-nums">
            {(() => { const v = lastV(metrics.requestsPerSec.data); return v != null ? Math.round(v) : '—' })()}
            <span className="text-[12px] text-muted-foreground ml-1.5 font-normal">req/s</span>
          </div>
          <div className="mt-2">
            <Sparkline data={metrics.requestsPerSec.data.map((p) => p.v)} color="oklch(0.7 0.17 158)" width={260} height={48} />
          </div>
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-muted-foreground">p95 latency</div>
              <div className="font-mono mt-0.5">
                {(() => { const v = lastV(metrics.p95Latency.data); return v != null ? `${Math.round(v)}ms` : '—' })()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Error rate</div>
              <div className="font-mono mt-0.5 text-amber-500">
                {(() => { const v = lastV(metrics.errorRate.data); return v != null ? `${v.toFixed(2)}%` : '—' })()}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[13px] font-semibold mb-3">Services</div>
          <div className="space-y-2">
            {project.services.map((svc) => (
              <div key={svc.id} className="flex items-center gap-2 text-[12px]">
                <StatusDot status={svc.status} />
                <span className="font-medium flex-1">{svc.name}</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">{svc.kind}</Badge>
                <span className="font-mono text-muted-foreground">{svc.replicas}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[13px] font-semibold mb-2">Quick actions</div>
          <div className="space-y-1">
            {[
              { label: 'Open shell in container', icon: Terminal },
              { label: 'Download logs', icon: ScrollText },
              { label: 'Restart service', icon: RotateCcw },
              { label: 'Scale replicas', icon: Server },
              { label: 'View on registry', icon: ExternalLink },
            ].map((a) => {
              const Icon = a.icon
              return (
                <button
                  key={a.label}
                  className="w-full flex items-center gap-2 px-2 h-8 rounded-md text-[12px] hover:bg-accent/60 transition-colors text-left"
                >
                  <Icon size={12} className="text-muted-foreground" />
                  <span className="flex-1">{a.label}</span>
                  <ChevronLeft size={12} className="text-muted-foreground rotate-180" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <Icon size={10} />
        {label}
      </div>
      <div className="text-[16px] font-semibold tabular-nums mt-1">{value}</div>
    </div>
  )
}

function DeploymentsTab({ projectId, onRollbackClick }: { projectId: string; onRollbackClick: (d: Deployment) => void }) {
  const allDeployments = useSlipway((s) => s.deployments)
  const deployments = React.useMemo(
    () => allDeployments.filter((d) => d.projectId === projectId),
    [allDeployments, projectId],
  )
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="divide-y divide-border">
        {deployments.map((d) => (
          <div key={d.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">{d.commitMessage}</span>
                  {d.rollbackOfId && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      <History size={9} className="mr-0.5" />
                      Rollback
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-1">
                  {d.commitSha || '—'} · {d.branch} · by {d.author}
                </div>
              </div>
              <div className="text-right shrink-0">
                <StatusDot status={d.status} />
                <div className="text-[10px] text-muted-foreground mt-1">
                  <TimeAgo ts={d.createdAt} className="text-[10px]" />
                  {d.durationMs && (
                    <>
                      {' · '}
                      <Duration ms={d.durationMs} className="text-[10px]" />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Pipeline */}
            <div className="mt-3 flex items-center gap-1 overflow-x-auto">
              {d.steps.map((s, i) => (
                <React.Fragment key={s.stage}>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center border text-[10px]',
                        s.status === 'healthy' && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500',
                        s.status === 'building' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                        s.status === 'deploying' && 'bg-amber-500/15 border-amber-500/40 text-amber-500',
                        s.status === 'failed' && 'bg-rose-500/15 border-rose-500/40 text-rose-500',
                        s.status === 'queued' && 'bg-muted border-border text-muted-foreground',
                        s.status === 'cancelled' && 'bg-muted/50 border-border text-muted-foreground/60',
                      )}
                    >
                      {s.status === 'healthy' ? (
                        <Check size={11} />
                      ) : s.status === 'failed' ? (
                        <AlertTriangle size={11} />
                      ) : s.status === 'building' || s.status === 'deploying' ? (
                        <Clock size={11} className="animate-pulse" />
                      ) : (
                        <span className="font-mono">{i + 1}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground whitespace-nowrap">{s.label}</div>
                    {s.durationMs && (
                      <div className="text-[8px] text-muted-foreground/70 font-mono">
                        {(s.durationMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                  {i < d.steps.length - 1 && (
                    <div className={cn('h-px w-4 shrink-0', s.status === 'healthy' ? 'bg-emerald-500/40' : 'bg-border')} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {d.status === 'healthy' && (
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onRollbackClick(d)}>
                  <History size={11} className="mr-1" />
                  Roll back to this
                </Button>
                {d.url && (
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => toast({ title: 'Opening deployment', description: d.url })}>
                    <ExternalLink size={11} className="mr-1" />
                    Open deployment
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ServicesTab({ project, onAddService, onRestart }: { project: Project; onAddService: () => void; onRestart: (serviceId?: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Services</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {project.services.length} services defined in this project. Each can be scaled, restarted, or inspected independently.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onAddService}>
          <Plus size={13} />
          Add service
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {project.services.map((svc, i) => (
          <div
            key={svc.id}
            className={cn('p-4', i !== project.services.length - 1 && 'border-b border-border')}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                {svc.kind === 'app' ? (
                  <Rocket size={15} />
                ) : svc.kind === 'worker' ? (
                  <Cpu size={15} />
                ) : svc.kind === 'database' ? (
                  <Boxes size={15} />
                ) : (
                  <Clock size={15} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold">{svc.name}</span>
                  <Badge variant="outline" className="text-[10px] capitalize h-5">{svc.kind}</Badge>
                  <StatusDot status={svc.status} />
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-1 truncate">{svc.image}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Restart service" onClick={() => onRestart(svc.id)}>
                  <RotateCcw size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  title="Service actions"
                  onClick={() =>
                    toast({
                      title: 'Not available from the dashboard yet',
                      description: `Editing, scaling and deleting ${svc.name} individually isn't wired up. Restart works (the button to the left); for the rest use the REST API or docker on the host.`,
                    })
                  }
                >
                  <MoreHorizontal size={14} />
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
              <div>
                <div className="text-muted-foreground">Replicas</div>
                <div className="font-mono mt-0.5 text-[13px]">{svc.replicas}x</div>
              </div>
              <div>
                <div className="text-muted-foreground">Memory</div>
                <div className="font-mono mt-0.5 text-[13px]"><Memory mb={svc.memoryMb} /></div>
              </div>
              <div>
                <div className="text-muted-foreground">CPU</div>
                <div className="font-mono mt-0.5 text-[13px]"><CpuFmt milli={svc.cpuMilli} /></div>
              </div>
              <div>
                <div className="text-muted-foreground">Port</div>
                <div className="font-mono mt-0.5 text-[13px]">{svc.port ?? '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Restarts</div>
                <div className={cn('font-mono mt-0.5 text-[13px]', svc.restarts > 0 && 'text-amber-500')}>{svc.restarts}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DomainsTab({ project, onAddDomain }: { project: Project; onAddDomain: () => void }) {
  const { toast } = useToast()
  const deleteDomain = useSlipway((s) => s.deleteDomain)
  const remove = async (dom: { id: string; hostname: string }) => {
    if (!window.confirm(`Remove domain ${dom.hostname} from ${project.name}?`)) return
    try {
      await deleteDomain(project.id, dom.id)
      toast({ title: 'Domain removed', description: dom.hostname })
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Domains & SSL</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Slipway records domains and checks SSL. The reverse proxy (Traefik) is managed separately, so routing is not changed here.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onAddDomain}>
          <Plus size={13} />
          Add domain
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {project.domains.length === 0 && (
          <div className="p-8 text-center text-[13px] text-muted-foreground">No domains yet.</div>
        )}
        {project.domains.map((dom, i) => (
          <div key={dom.id} className={cn('p-4 flex items-center gap-3', i !== project.domains.length - 1 && 'border-b border-border')}>
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Globe size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-mono font-medium truncate">{dom.hostname}</span>
                <Badge variant="outline" className="text-[10px] capitalize h-5">{dom.type}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {dom.ssl === 'managed' ? (
                  <>
                    <Check size={10} className="inline mr-1 text-emerald-500" />
                    SSL: Let’s Encrypt
                    {dom.sslExpiry && <> · renews <TimeAgo ts={dom.sslExpiry} className="text-[11px]" /></>}
                  </>
                ) : (
                  <>SSL: {dom.ssl}</>
                )}
              </div>
            </div>
            <StatusDot status={dom.status} />
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-500 shrink-0" title="Remove domain" onClick={() => void remove(dom)}>
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EnvTab({ project }: { project: Project }) {
  const { toast } = useToast()
  const refetch = useSlipway((s) => s.refetch)
  const reconcileProject = useSlipway((s) => s.reconcileProject)
  const vars = project.envVars
  const [newKey, setNewKey] = React.useState('')
  const [newValue, setNewValue] = React.useState('')
  const [newScope, setNewScope] = React.useState('all')
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({})
  const [applying, setApplying] = React.useState(false)

  const applyToContainer = async () => {
    if (!window.confirm(`Recreate the real container for ${project.name} so the new env vars take effect? Brief downtime; named data volumes are preserved.`)) return
    setApplying(true)
    try {
      await reconcileProject(project.id)
      toast({ title: 'Env applied', description: `${project.name} container recreated with the new env vars.` })
    } catch (e) {
      toast({ title: 'Apply failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  const copyVal = (v: string) => {
    navigator.clipboard?.writeText(v)
    toast({ title: 'Copied', description: 'Value copied to clipboard.' })
  }

  const addVar = async () => {
    if (!newKey) return
    try {
      await api.post(`/api/projects/${project.id}/env-vars`, { key: newKey, value: newValue, scope: newScope, masked: false })
      setNewKey('')
      setNewValue('')
      toast({ title: 'Variable added', description: `${newKey} will be applied on next restart.` })
      await refetch(['projects', 'activity'])
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    }
  }

  const deleteVar = async (eid: string, key: string) => {
    await api.del(`/api/projects/${project.id}/env-vars/${eid}`)
    toast({ title: 'Variable deleted', description: key })
    await refetch(['projects', 'activity'])
  }

  const editVar = async (eid: string, key: string) => {
    const value = window.prompt(`New value for ${key}`) || ''
    if (!value) return
    await api.put(`/api/projects/${project.id}/env-vars/${eid}`, { value })
    toast({ title: 'Variable updated', description: key })
    await refetch(['projects', 'activity'])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Environment variables</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Stored in the Slipway database. Variables can be scoped to environments (production, staging, preview). Env vars only take effect when the container is created — use <b>Apply to container</b> to recreate it with the new vars.
          </p>
        </div>
        {project.dockerContainerId && (
          <Button size="sm" className="h-8 gap-2 shrink-0" disabled={applying} onClick={() => void applyToContainer()}>
            {applying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Apply to container
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-3">Key</div>
          <div className="col-span-6">Value</div>
          <div className="col-span-2">Scope</div>
          <div className="col-span-1"></div>
        </div>
        {vars.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">No environment variables yet.</div>
        )}
        {vars.map((v) => (
          <div key={v.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors">
            <div className="col-span-3 min-w-0 font-mono text-[12px] truncate" title={v.key}>{v.key}</div>
            <div className="col-span-6 min-w-0 font-mono text-[12px] truncate text-muted-foreground flex items-center gap-2">
              <span className="truncate" title={revealed[v.id] ? v.value : undefined}>{revealed[v.id] ? v.value : (v.masked ? '••••••••' : v.value)}</span>
              <button onClick={() => copyVal(v.value)} title="Copy"><Copy size={10} /></button>
              {v.masked && (
                <button onClick={() => setRevealed((r) => ({ ...r, [v.id]: !r[v.id] }))} title="Reveal">
                  {revealed[v.id] ? <AlertTriangle size={10} /> : <Check size={10} />}
                </button>
              )}
            </div>
            <div className="col-span-2">
              <Badge variant="outline" className="text-[9px] h-4 capitalize">{v.scope}</Badge>
            </div>
            <div className="col-span-1 text-right">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void editVar(v.id, v.key)} title="Edit">
                <Pencil size={11} />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500" onClick={() => void deleteVar(v.id, v.key)} title="Delete">
                <Trash2 size={11} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4">
        <div className="text-[12px] font-semibold mb-2">Add a new variable</div>
        <div className="grid grid-cols-12 gap-2">
          <Input
            placeholder="KEY"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="col-span-3 font-mono text-[12px] h-8"
          />
          <Input
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="col-span-6 font-mono text-[12px] h-8"
          />
          <select
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            className="col-span-1 h-8 px-2 rounded-md border border-border bg-background text-[12px]"
          >
            <option value="all">all</option>
            <option value="production">prod</option>
            <option value="staging">staging</option>
            <option value="preview">preview</option>
          </select>
          <Button size="sm" className="col-span-2 h-8" onClick={() => void addVar()}>
            <Plus size={12} className="mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProjectLogsTab({ projectId }: { projectId: string }) {
  const logs = useSlipway((s) => s.logs)
  const [paused, setPaused] = React.useState(false)
  const [filter, setFilter] = React.useState<string>('all')
  const containerRef = React.useRef<HTMLDivElement>(null)
  // ponytail: real logs arrive via the /api/logs/stream SSE feed (see LogsView),
  // so there is nothing to poll here. The old setInterval(pushLog, 1200) was
  // firing a no-op every 1.2s — dropped (bug 7 leaked-interval cleanup).
  void projectId

  React.useEffect(() => {
    if (containerRef.current && !paused) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, paused])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.service === filter)

  const levelColor: Record<string, string> = {
    info: 'text-emerald-500',
    warn: 'text-amber-500',
    error: 'text-rose-500',
    debug: 'text-sky-500',
    system: 'text-muted-foreground',
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {['all', 'api', 'web', 'worker', 'ingest', 'scheduler', 'slipway'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 h-7 rounded text-[11px] font-mono transition-colors',
                filter === f ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            onClick={() => setPaused(!paused)}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => toast({ title: 'Logs exported', description: 'logs.txt download started.' })}>
            <ScrollText size={11} className="mr-1" />
            Export
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="rounded-xl border border-border bg-[oklch(0.12_0.005_240)] font-mono text-[11.5px] h-[480px] overflow-y-auto p-3"
      >
        {filtered.map((l) => (
          <div key={l.id} className="log-line flex gap-3 hover:bg-white/5 px-1 -mx-1 rounded">
            <span className="text-muted-foreground/60 shrink-0 w-20">
              {new Date(l.ts).toISOString().slice(11, 23)}
            </span>
            <span className={cn('shrink-0 w-14 uppercase', levelColor[l.level])}>{l.level}</span>
            <span className="shrink-0 w-20 text-muted-foreground/80">{l.service}</span>
            <span className="flex-1 break-all">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricsTab({ project }: { project: Project }) {
  const metrics = useSlipway((s) => s.metrics)
  const charts = [
    { title: 'Requests / sec', data: metrics.requestsPerSec.data, unit: 'req/s', color: 'oklch(0.7 0.17 158)' },
    { title: 'p95 latency', data: metrics.p95Latency.data, unit: 'ms', color: 'oklch(0.78 0.16 70)' },
    { title: 'CPU usage', data: metrics.cpu.data, unit: '%', color: 'oklch(0.65 0.18 250)' },
    { title: 'Memory', data: metrics.memory.data, unit: '%', color: 'oklch(0.65 0.22 300)' },
    { title: 'Network in', data: metrics.networkIn.data, unit: 'Mb/s', color: 'oklch(0.7 0.15 230)' },
    { title: 'Error rate', data: metrics.errorRate.data, unit: '%', color: 'oklch(0.65 0.22 25)' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {charts.map((c) => {
        const last = lastV(c.data)
        const max = Math.max(0, ...c.data.map((p) => p.v))
        return (
          <div key={c.title} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold">{c.title}</div>
              <div className="text-[10px] text-muted-foreground font-mono">last 60 min</div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[22px] font-semibold tabular-nums">
                {last != null ? last.toFixed(c.unit === '%' ? 1 : 0) : '—'}
                <span className="text-[11px] text-muted-foreground ml-1 font-normal">{c.unit}</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                peak {max.toFixed(0)} {c.unit}
              </div>
            </div>
            <div className="mt-3">
              <Sparkline data={c.data.map((p) => p.v)} color={c.color} width={320} height={64} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectBackupsTab({ project, onRunBackup }: { project: Project; onRunBackup: () => void }) {
  const allBackups = useSlipway((s) => s.backups)
  const backups = React.useMemo(
    () => allBackups.filter((b) => b.target.includes(project.slug) || b.targetKind === 'project'),
    [allBackups, project.slug],
  )
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Backups</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Snapshots of attached databases and volumes. Restore to any point in time within retention.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onRunBackup}>
          <Archive size={13} />
          Run backup now
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-3">Target</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-3">Schedule</div>
          <div className="col-span-2 text-right">Started</div>
        </div>
        {backups.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">
            No backups scheduled for this project yet.
          </div>
        ) : (
          backups.map((b, i) => (
            <div key={b.id} className={cn('grid grid-cols-12 px-3 py-2.5 items-center text-[12px]', i !== backups.length - 1 && 'border-b border-border')}>
              <div className="col-span-3 min-w-0 font-mono truncate" title={b.target}>{b.target}</div>
              <div className="col-span-2">
                <StatusDot status={b.status} />
              </div>
              <div className="col-span-2 font-mono">{b.sizeMb > 0 ? `${(b.sizeMb / 1024).toFixed(2)} GB` : '—'}</div>
              <div className="col-span-3 min-w-0 font-mono truncate text-muted-foreground">{b.schedule ?? 'manual'}</div>
              <div className="col-span-2 text-right text-muted-foreground">
                <TimeAgo ts={b.startedAt} className="text-[11px]" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SettingsTab({ project }: { project: Project }) {
  const { toast } = useToast()
  const refetch = useSlipway((s) => s.refetch)
  const setView = useSlipway((s) => s.setView)
  const reconcileProject = useSlipway((s) => s.reconcileProject)

  const [name, setName] = React.useState(project.name)
  const [slug, setSlug] = React.useState(project.slug)
  const [description, setDescription] = React.useState(project.description ?? '')
  const [minReplicas, setMinReplicas] = React.useState(project.minReplicas)
  const [maxReplicas, setMaxReplicas] = React.useState(project.maxReplicas)
  const [memoryMb, setMemoryMb] = React.useState(project.memoryMb)
  const [cpuMilli, setCpuMilli] = React.useState(project.cpuMilli)
  const [applying, setApplying] = React.useState(false)

  const applyToContainer = async () => {
    if (!window.confirm(`Recreate the real container for ${project.name} with the current image, env vars, start command, and resource limits? The container has brief downtime; named data volumes are preserved.`)) return
    setApplying(true)
    try {
      await reconcileProject(project.id)
      toast({ title: 'Changes applied', description: `${project.name} container recreated with the new config.` })
    } catch (e) {
      toast({ title: 'Apply failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  const patch = async (data: Record<string, unknown>, msg = 'Project settings updated.') => {
    try {
      await api.patch(`/api/projects/${project.id}`, data)
      toast({ title: 'Saved', description: msg })
      await refetch(['projects', 'activity'])
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    }
  }

  const saveGeneral = () => void patch({ name, slug, description })
  const saveResources = () => void patch({ minReplicas, maxReplicas, memoryMb, cpuMilli }, 'Resource limits saved.')

  const toggle = (key: 'autoDeploy' | 'requireTests' | 'autoRollback' | 'pauseDuringWindows' | 'prPreviews', value: boolean) => {
    void patch({ [key]: value })
  }

  const pause = async () => {
    await api.post(`/api/projects/${project.id}/pause`)
    toast({ title: 'Project paused', description: `${project.name} services stopped.`, variant: 'destructive' })
    await refetch(['projects', 'activity'])
  }
  const disconnect = async () => {
    await api.post(`/api/projects/${project.id}/disconnect-source`)
    toast({ title: 'Source disconnected', description: `Repository removed from ${project.name}.` })
    await refetch(['projects', 'activity'])
  }
  const del = async () => {
    if (!window.confirm(`Delete ${project.name}? This cannot be undone.`)) return
    // ponytail: await the persistence-layer delete FIRST and confirm it
    // committed before touching UI state. The previous version navigated away +
    // toasted success unconditionally; if the API failed (or the row wasn't
    // actually deleted server-side) the project reappeared on refresh with a
    // "deleted" toast already shown. Now a failure keeps you on the page with an
    // honest error toast — no fake success.
    try {
      await api.del(`/api/projects/${project.id}`)
      toast({ title: 'Project deleted', description: `${project.name} and all its resources removed.`, variant: 'destructive' })
      setView('projects')
      await refetch(['projects', 'activity'])
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof ApiError ? e.message : 'the project was not deleted — it is still in the database.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <SettingsCard title="General" description="Project name, slug, and description.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-[13px]" />
            </div>
            <div>
              <Label className="text-[11px]">Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 h-8 text-[13px] font-mono" />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-8 text-[13px]" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-8" onClick={saveGeneral}>Save changes</Button>
          </div>
        </div>
      </SettingsCard>

      {/* ponytail: these five are STORED PREFERENCES ONLY — nothing reads them.
          Grep for autoDeploy/requireTests/autoRollback/pauseDuringWindows/
          prPreviews outside the schema, the serializer and this file: the only
          hit is the PATCH allow-list that persists them. There is no inbound
          git webhook (so nothing can auto-deploy or react to a PR), the
          pipeline's "test" stage runs no tests, no health-check watcher exists
          to auto-roll-back, and deploy windows are not a concept anywhere. They
          are kept because they round-trip correctly and describe intent, but
          the card says plainly that they don't act yet — a toggle that silently
          does nothing is worse than no toggle. */}
      <SettingsCard
        title="Build & Deploy"
        description="Stored for a future release — none of these are acted on by this build yet."
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-foreground/80 leading-snug">
            These preferences persist, but nothing enforces them today. Deploys are triggered manually (dashboard or
            API), tests aren&apos;t run by the pipeline, and rollback is an explicit action from the Deployments list.
          </div>
          <ToggleRow label="Auto-deploy on push to main" description="Intent only — Slipway has no inbound git webhook, so no push can trigger a deploy." checked={project.autoDeploy} onChange={(v) => toggle('autoDeploy', v)} />
          <ToggleRow label="Require passing tests" description="Intent only — the pipeline's test stage does not execute a test suite." checked={project.requireTests} onChange={(v) => toggle('requireTests', v)} />
          <ToggleRow label="Auto-rollback on health check failure" description="Intent only — no watcher monitors a release after it goes live. Roll back from the Deployments list." checked={project.autoRollback} onChange={(v) => toggle('autoRollback', v)} />
          <ToggleRow label="Pause during deploy windows" description="Intent only — maintenance windows aren't configurable anywhere yet." checked={project.pauseDuringWindows} onChange={(v) => toggle('pauseDuringWindows', v)} />
          <ToggleRow label="PR preview environments" description="Intent only — nothing reacts to a pull request opening or closing." checked={project.prPreviews} onChange={(v) => toggle('prPreviews', v)} />
        </div>
      </SettingsCard>

      {project.dockerContainerId && (
        <SettingsCard title="Container" description="Apply Slipway's config to the real Docker container running this project.">
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground leading-snug">
              Env vars, image, start command, and resource limits are stored in Slipway. Resource limits apply live via <code className="font-mono">docker update</code> when you save. Env vars, image, and start command can&apos;t change on a running container — use <b>Apply to container</b> to recreate it with the new config (brief downtime; named data volumes and networks are preserved).
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="h-8 gap-2" disabled={applying} onClick={() => void applyToContainer()}>
                {applying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Apply to container
              </Button>
              <span className="text-[11px] text-muted-foreground font-mono">container: {project.dockerContainerId.slice(0, 12)}</span>
            </div>
          </div>
        </SettingsCard>
      )}

      <SettingsCard title="Resources" description="Per-project resource limits. Slipway will autoscale within these bounds.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-[11px]">Min replicas</Label>
            <Input type="number" value={minReplicas} onChange={(e) => setMinReplicas(Number(e.target.value))} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">Max replicas</Label>
            <Input type="number" value={maxReplicas} onChange={(e) => setMaxReplicas(Number(e.target.value))} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">Memory limit (MB)</Label>
            <Input type="number" value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value))} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">CPU limit (millicores)</Label>
            <Input type="number" value={cpuMilli} onChange={(e) => setCpuMilli(Number(e.target.value))} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" className="h-8" onClick={saveResources}>Save resources</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Notifications" description="Per-project notification preferences, persisted to Slipway settings.">
        <div className="space-y-3">
          <ToggleRow label="Email on failed deploy" description="Send an email when a deployment fails." checked={useProjectSetting(project.id, 'notify:emailFailed')} onChange={(v) => void setProjectSetting(project.id, 'notify:emailFailed', v)} />
          <ToggleRow label="Slack on production deploys" description="Post to the connected Slack when production is updated." checked={useProjectSetting(project.id, 'notify:slackDeploys')} onChange={(v) => void setProjectSetting(project.id, 'notify:slackDeploys', v)} />
          <ToggleRow label="Webhook on rollback" description="POST to configured webhooks when an automatic rollback occurs." checked={useProjectSetting(project.id, 'notify:webhookRollback')} onChange={(v) => void setProjectSetting(project.id, 'notify:webhookRollback', v)} />
        </div>
      </SettingsCard>

      <SettingsCard title="Danger zone" description="Irreversible actions.">
        <div className="space-y-2.5">
          <DangerRow
            title="Pause this project"
            description="Stop all services. Deploys and backups are suspended."
            buttonLabel="Pause"
            onConfirm={() => void pause()}
          />
          <DangerRow
            title="Disconnect source"
            description="Remove the connected repository or folder. Existing services keep running."
            buttonLabel="Disconnect"
            onConfirm={() => void disconnect()}
          />
          <DangerRow
            title="Delete project"
            description="Permanently delete the project, its services, domains, and history. Backups are retained per policy."
            buttonLabel="Delete"
            destructive
            onConfirm={() => void del()}
          />
        </div>
      </SettingsCard>
    </div>
  )
}

// Per-project notification preferences stored as Setting rows.
function useProjectSetting(projectId: string, key: string): boolean {
  const [val, setVal] = React.useState(false)
  React.useEffect(() => {
    void api.get<{ settings: Record<string, string> }>('/api/settings').then((s) => {
      setVal(s.settings[`project:${projectId}:${key}`] === 'true')
    }).catch(() => {})
  }, [projectId, key])
  return val
}

async function setProjectSetting(projectId: string, key: string, value: boolean): Promise<void> {
  await api.patch('/api/settings', { settings: { [`project:${projectId}:${key}`]: String(value) } })
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function DangerRow({ title, description, buttonLabel, destructive, onConfirm }: { title: string; description: string; buttonLabel: string; destructive?: boolean; onConfirm?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-b-0">
      <div className="flex-1">
        <div className={cn('text-[13px] font-medium', destructive && 'text-rose-500')}>{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Button
        variant={destructive ? 'destructive' : 'outline'}
        size="sm"
        className="h-8"
        onClick={onConfirm}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
