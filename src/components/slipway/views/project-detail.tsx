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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useSlipway } from '@/lib/slipway/store'
import { StackGlyph, DbGlyph, StatusDot } from '../icons'
import { TimeAgo, Duration, Memory, Cpu as CpuFmt, Sparkline, BytesShort } from '../format'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
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
                  {latest.commitSha} · {latest.branch} · by {latest.author}
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
                    {d.commitSha} · {d.branch}
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
            {Math.round(metrics.requestsPerSec.data[metrics.requestsPerSec.data.length - 1].v)}
            <span className="text-[12px] text-muted-foreground ml-1.5 font-normal">req/s</span>
          </div>
          <div className="mt-2">
            <Sparkline data={metrics.requestsPerSec.data.map((p) => p.v)} color="oklch(0.7 0.17 158)" width={260} height={48} />
          </div>
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-muted-foreground">p95 latency</div>
              <div className="font-mono mt-0.5">
                {Math.round(metrics.p95Latency.data[metrics.p95Latency.data.length - 1].v)}ms
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Error rate</div>
              <div className="font-mono mt-0.5 text-amber-500">
                {metrics.errorRate.data[metrics.errorRate.data.length - 1].v.toFixed(2)}%
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
                  {d.commitSha} · {d.branch} · by {d.author}
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
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]">
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
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Domains & SSL</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Slipway provisions TLS certificates via Let’s Encrypt and renews them automatically. Add custom domains or route preview branches.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onAddDomain}>
          <Plus size={13} />
          Add domain
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
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
          </div>
        ))}
      </div>
    </div>
  )
}

function EnvTab({ project }: { project: Project }) {
  const { toast } = useToast()
  const [vars, setVars] = React.useState([
    { key: 'DATABASE_URL', value: 'postgres://helix:•••••@pg-1.internal.slipway.run:5432/helix', scope: 'all', masked: true },
    { key: 'REDIS_URL', value: 'redis://redis-1.internal.slipway.run:6379', scope: 'all', masked: false },
    { key: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', scope: 'production', masked: true },
    { key: 'STRIPE_WEBHOOK_SECRET', value: 'whsec_•••••••••••••', scope: 'all', masked: true },
    { key: 'NEXT_PUBLIC_APP_URL', value: project.url ?? 'https://app.example.com', scope: 'all', masked: false },
    { key: 'LOG_LEVEL', value: 'info', scope: 'all', masked: false },
    { key: 'SENTRY_DSN', value: 'https://•••••@sentry.io/1234', scope: 'all', masked: true },
    { key: 'SMTP_URL', value: 'smtp://postmark@smtp.postmarkapp.com:587', scope: 'all', masked: true },
  ])
  const [newKey, setNewKey] = React.useState('')
  const [newValue, setNewValue] = React.useState('')

  const copyVal = (v: string) => {
    navigator.clipboard?.writeText(v)
    toast({ title: 'Copied', description: 'Value copied to clipboard.' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Environment variables</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Encrypted at rest. Variables can be scoped to environments (production, staging, preview). Changes trigger a rolling restart.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => toast({ title: 'Pull from .env', description: 'Upload a .env file dialog would open here.' })}>
          <KeyRound size={13} />
          Pull from .env
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-3">Key</div>
          <div className="col-span-6">Value</div>
          <div className="col-span-2">Scope</div>
          <div className="col-span-1"></div>
        </div>
        {vars.map((v, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors">
            <div className="col-span-3 font-mono text-[12px] truncate">{v.key}</div>
            <div className="col-span-6 font-mono text-[12px] truncate text-muted-foreground">
              {v.masked ? v.value : v.value}
              <button
                onClick={() => copyVal(v.value)}
                className="ml-2 inline-flex opacity-0 hover:opacity-100 group-hover:opacity-100"
                title="Copy"
              >
                <Copy size={10} />
              </button>
            </div>
            <div className="col-span-2">
              <Badge variant="outline" className="text-[9px] h-4 capitalize">{v.scope}</Badge>
            </div>
            <div className="col-span-1 text-right">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal size={12} />
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
            className="col-span-7 font-mono text-[12px] h-8"
          />
          <Button
            size="sm"
            className="col-span-2 h-8"
            onClick={() => {
              if (!newKey) return
              setVars([...vars, { key: newKey, value: newValue, scope: 'all', masked: false }])
              setNewKey('')
              setNewValue('')
              toast({ title: 'Variable added', description: `${newKey} will be applied on next restart.` })
            }}
          >
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
  const pushLog = useSlipway((s) => s.pushLog)
  const [paused, setPaused] = React.useState(false)
  const [filter, setFilter] = React.useState<string>('all')
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (paused) return
    const id = setInterval(() => pushLog(), 1200)
    return () => clearInterval(id)
  }, [paused, pushLog])

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
          <Button variant="outline" size="sm" className="h-8 text-[11px]">
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
        const last = c.data[c.data.length - 1].v
        const max = Math.max(...c.data.map((p) => p.v))
        return (
          <div key={c.title} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold">{c.title}</div>
              <div className="text-[10px] text-muted-foreground font-mono">last 60 min</div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[22px] font-semibold tabular-nums">
                {last.toFixed(c.unit === '%' ? 1 : 0)}
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
              <div className="col-span-3 font-mono truncate">{b.target}</div>
              <div className="col-span-2">
                <StatusDot status={b.status} />
              </div>
              <div className="col-span-2 font-mono">{b.sizeMb > 0 ? `${(b.sizeMb / 1024).toFixed(2)} GB` : '—'}</div>
              <div className="col-span-3 font-mono text-muted-foreground">{b.schedule ?? 'manual'}</div>
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
  return (
    <div className="space-y-5 max-w-3xl">
      <SettingsCard title="General" description="Project name, slug, and description.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Name</Label>
              <Input defaultValue={project.name} className="mt-1 h-8 text-[13px]" />
            </div>
            <div>
              <Label className="text-[11px]">Slug</Label>
              <Input defaultValue={project.slug} className="mt-1 h-8 text-[13px] font-mono" />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Description</Label>
            <Input defaultValue={project.description} className="mt-1 h-8 text-[13px]" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-8" onClick={() => toast({ title: 'Saved', description: 'Project settings updated.' })}>
              Save changes
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Build & Deploy" description="Configure how this project is built and released.">
        <div className="space-y-3">
          <ToggleRow label="Auto-deploy on push to main" description="Trigger a new deployment when commits land on the main branch." defaultChecked />
          <ToggleRow label="Require passing tests" description="Block deploys if any test step fails." defaultChecked />
          <ToggleRow label="Auto-rollback on health check failure" description="If the new release fails health checks within 60s, automatically roll back." defaultChecked />
          <ToggleRow label="Pause during deploy windows" description="Skip deploys during configured maintenance windows." />
          <ToggleRow label="PR preview environments" description="Spin up a temporary environment for every pull request." defaultChecked={project.environment === 'preview'} />
        </div>
      </SettingsCard>

      <SettingsCard title="Resources" description="Per-project resource limits. Slipway will autoscale within these bounds.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-[11px]">Min replicas</Label>
            <Input type="number" defaultValue={1} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">Max replicas</Label>
            <Input type="number" defaultValue={6} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">Memory limit (MB)</Label>
            <Input type="number" defaultValue={project.memoryMb} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">CPU limit (millicores)</Label>
            <Input type="number" defaultValue={project.cpuMilli} className="mt-1 h-8 text-[13px] font-mono" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Notifications" description="Where Slipway sends deployment, backup, and alert notifications.">
        <div className="space-y-3">
          <ToggleRow label="Email on failed deploy" description="Send an email when a deployment fails." defaultChecked />
          <ToggleRow label="Slack on production deploys" description="Post to #deploys when production is updated." defaultChecked />
          <ToggleRow label="Webhook on rollback" description="POST to a configured webhook URL when an automatic rollback occurs." />
        </div>
      </SettingsCard>

      <SettingsCard title="Danger zone" description="Irreversible actions.">
        <div className="space-y-2.5">
          <DangerRow
            title="Pause this project"
            description="Stop all services. Deploys and backups are suspended."
            buttonLabel="Pause"
            onConfirm={() => toast({ title: 'Project paused', description: `${project.name} services stopped.`, variant: 'destructive' })}
          />
          <DangerRow
            title="Disconnect source"
            description="Remove the connected repository or folder. Existing services keep running."
            buttonLabel="Disconnect"
            onConfirm={() => toast({ title: 'Source disconnected', description: `Repository removed from ${project.name}.` })}
          />
          <DangerRow
            title="Delete project"
            description="Permanently delete the project, its services, domains, and history. Backups are retained per policy."
            buttonLabel="Delete"
            destructive
            onConfirm={() => toast({ title: 'Project deleted', description: `${project.name} and all its resources removed.`, variant: 'destructive' })}
          />
        </div>
      </SettingsCard>
    </div>
  )
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

function ToggleRow({ label, description, defaultChecked }: { label: string; description: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch defaultChecked={defaultChecked} />
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
