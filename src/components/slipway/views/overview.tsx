'use client'

import * as React from 'react'
import {
  Rocket,
  Boxes,
  Database,
  HardDrive,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  CircleDot,
  Zap,
  GitCommit,
  History,
  Globe,
  Server,
  ScanLine,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { useAuth } from '../auth-provider'
import { StackGlyph, StatusDot } from '../icons'
import { TimeAgo, Duration, Sparkline, BytesShort, lastV } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Deployment, Project } from '@/lib/slipway/types'

export function OverviewView() {
  const projects = useSlipway((s) => s.projects)
  const deployments = useSlipway((s) => s.deployments)
  const databases = useSlipway((s) => s.databases)
  const volumes = useSlipway((s) => s.volumes)
  const servers = useSlipway((s) => s.servers)
  const activity = useSlipway((s) => s.activity)
  const metrics = useSlipway((s) => s.metrics)
  const selectProject = useSlipway((s) => s.selectProject)
  const setNewDeploymentOpen = useSlipway((s) => s.setNewDeploymentOpen)
  const setView = useSlipway((s) => s.setView)
  const scanHost = useSlipway((s) => s.scanHost)
  const { user } = useAuth()
  const { toast } = useToast()
  const [scanning, setScanning] = React.useState(false)

  const runScan = async () => {
    setScanning(true)
    try {
      const r = await scanHost()
      toast({
        title: 'Host scan complete',
        description: `Imported ${r.projects} app(s), ${r.databases} database(s), ${r.volumes} volume(s) — ${r.skipped} already managed.`,
      })
    } catch (e) {
      toast({ title: 'Scan failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  const healthyProjects = projects.filter((p) => p.status === 'running' && p.environment === 'production').length
  const totalReplicas = projects.reduce((a, p) => a + p.replicas, 0)
  const totalMemory = projects.reduce((a, p) => a + p.memoryMb * p.replicas, 0)
  const monthlyDeploys = projects.reduce((a, p) => a + p.monthlyDeploys, 0)
  const avgSuccess = Math.round(projects.reduce((a, p) => a + p.successRate, 0) / projects.length * 10) / 10

  const inFlightDeploy = deployments.find((d) => d.status === 'building' || d.status === 'deploying')
  const p95 = lastV(metrics.p95Latency.data)

  return (
    <div className="space-y-6">
      {/* Hero / greeting */}
      <section className="rounded-xl border border-border bg-gradient-to-br from-primary/8 via-background to-background p-5 sm:p-6 relative overflow-hidden bg-grid">
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-1">
              <CircleDot size={11} className="text-emerald-500 pulse-dot" />
              {servers.length ? (
                <>cluster healthy · {servers.filter((s) => s.status === 'online').length}/{servers.length} servers online</>
              ) : (
                <>no servers registered yet</>
              )}
            </div>
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">
              Welcome back, {user?.username ?? 'admin'}.
            </h1>
            <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed">
              <strong className="text-foreground font-medium">{healthyProjects} production app{healthyProjects === 1 ? '' : 's'}</strong> running across{' '}
              <strong className="text-foreground font-medium">{servers.length} server{servers.length === 1 ? '' : 's'}</strong>.{' '}
              {inFlightDeploy ? (
                <>A deployment of <strong className="text-foreground font-medium">{inFlightDeploy.projectName}</strong> is in flight.</>
              ) : deployments[0] ? (
                <>Last deploy was <TimeAgo ts={deployments[0]?.createdAt} />.</>
              ) : (
                <>No deployments yet — create one to get started.</>
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9" onClick={runScan} disabled={scanning}>
              {scanning ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ScanLine size={14} className="mr-1.5" />}
              Scan host
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setView('cli')}>
              <Zap size={14} className="mr-1.5" />
              Install CLI
            </Button>
            <Button size="sm" className="h-9 gap-2" onClick={() => setNewDeploymentOpen(true)}>
              <Plus size={14} />
              New deployment
            </Button>
          </div>
        </div>
      </section>

      {/* Top stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Active deployments"
          value={deployments.filter((d) => d.status === 'building' || d.status === 'deploying').length}
          sub={`${monthlyDeploys} deploys this month`}
          icon={Rocket}
          spark={metrics.deployFrequency.data.map((p) => p.v)}
          color="oklch(0.7 0.17 158)"
        />
        <StatCard
          label="Avg success rate"
          value={projects.length ? `${avgSuccess}%` : '—'}
          sub="across all projects"
          icon={ShieldCheck}
          spark={metrics.errorRate.data.map((p) => 100 - p.v)}
          color="oklch(0.7 0.17 158)"
        />
        <StatCard
          label="Running replicas"
          value={totalReplicas}
          sub={`${(totalMemory / 1024).toFixed(1)} GB memory`}
          icon={Boxes}
          trend={`${projects.length} projects`}
          spark={metrics.memory.data.map((p) => p.v)}
          color="oklch(0.65 0.18 250)"
        />
        <StatCard
          label="p95 latency"
          value={p95 != null ? `${Math.round(p95)}ms` : '—'}
          sub="across production services"
          icon={Activity}
          spark={metrics.p95Latency.data.map((p) => p.v)}
          color="oklch(0.78 0.16 70)"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — recent deployments + in-flight pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {inFlightDeploy && <InFlightPipeline deploy={inFlightDeploy} />}
          <RecentDeployments
            deployments={deployments.slice(0, 6)}
            onProjectClick={selectProject}
            onViewAll={() => setView('deployments')}
          />
          <ProjectsStrip projects={projects.slice(0, 6)} onProjectClick={selectProject} onViewAll={() => setView('projects')} />
        </div>

        {/* Right column — activity + cluster health */}
        <div className="space-y-6">
          <ClusterHealth servers={servers} databases={databases} volumes={volumes} />
          <ActivityFeed activity={activity.slice(0, 8)} />
          <UpcomingMaintenance />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendUp,
  spark,
  color,
}: {
  label: string
  value: string | number
  sub: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  trend?: string
  trendUp?: boolean
  spark: number[]
  color: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          <Icon size={12} />
          {label}
        </div>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-medium',
              trendUp ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          >
            {trendUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {trend}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-[22px] font-semibold tabular-nums leading-none">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
        </div>
        <div className="shrink-0">
          <Sparkline data={spark.slice(-24)} color={color} width={88} height={32} />
        </div>
      </div>
    </div>
  )
}

function InFlightPipeline({ deploy }: { deploy: Deployment }) {
  const activeStep = deploy.steps.find((s) => s.status === 'building' || s.status === 'deploying')
  const completedSteps = deploy.steps.filter((s) => s.status === 'healthy').length
  const totalSteps = deploy.steps.length
  const pct = Math.round((completedSteps / totalSteps) * 100)

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 pulse-dot" />
            Deployment in flight
          </div>
          <div className="text-[15px] font-medium mt-1 truncate">{deploy.projectName}</div>
          <div className="text-[12px] text-muted-foreground font-mono mt-0.5 truncate">
            {deploy.commitSha} · {deploy.commitMessage}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-semibold tabular-nums">{pct}%</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {completedSteps}/{totalSteps} steps
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {deploy.steps.map((s) => (
          <div
            key={s.stage}
            className={cn(
              'h-1.5 flex-1 rounded-full overflow-hidden',
              s.status === 'healthy' ? 'bg-emerald-500' : s.status === 'building' || s.status === 'deploying' ? 'bg-amber-500/30' : 'bg-border',
            )}
          >
            {(s.status === 'building' || s.status === 'deploying') && <div className="h-full w-full shimmer" />}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span>{activeStep ? activeStep.label : 'Releasing…'}</span>
        <span>started <TimeAgo ts={deploy.createdAt} /></span>
      </div>
    </div>
  )
}

function RecentDeployments({
  deployments,
  onProjectClick,
  onViewAll,
}: {
  deployments: Deployment[]
  onProjectClick: (id: string) => void
  onViewAll: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="h-11 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Rocket size={14} className="text-primary" />
          Recent deployments
        </div>
        <button onClick={onViewAll} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
          View all
          <ChevronRight size={12} />
        </button>
      </div>
      <div className="divide-y divide-border">
        {deployments.map((d) => {
          const project = useSlipway.getState().projects.find((p) => p.id === d.projectId)
          return (
            <button
              key={d.id}
              onClick={() => onProjectClick(d.projectId)}
              className="w-full text-left px-4 py-2.5 hover:bg-accent/40 transition-colors flex items-center gap-3"
            >
              <StackGlyph stack={project?.stack ?? 'node'} size={26} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{d.projectName}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize hidden sm:inline-flex">
                    {d.environment}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                  {d.commitSha} · {d.commitMessage}
                </div>
              </div>
              <div className="hidden md:flex flex-col items-end shrink-0 w-32">
                <StatusDot status={d.status} />
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {d.author} · <TimeAgo ts={d.createdAt} className="text-[10px]" />
                </span>
              </div>
              <div className="shrink-0 hidden lg:block w-16 text-right">
                <Duration ms={d.durationMs} className="text-[11px]" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ProjectsStrip({
  projects,
  onProjectClick,
  onViewAll,
}: {
  projects: Project[]
  onProjectClick: (id: string) => void
  onViewAll: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="h-11 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Boxes size={14} className="text-primary" />
          Projects
        </div>
        <button onClick={onViewAll} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
          View all
          <ChevronRight size={12} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border">
        {projects.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onProjectClick(p.id)}
            className={cn(
              'text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3',
              i % 2 === 0 && 'sm:border-r border-border',
              i >= 2 && 'sm:border-t border-border',
            )}
          >
            <StackGlyph stack={p.stack} size={28} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium truncate">{p.name}</span>
                <StatusDot status={p.status} />
              </div>
              <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                {p.stackLabel}
              </div>
            </div>
            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}

function ClusterHealth({
  servers,
  databases,
  volumes,
}: {
  servers: any[]
  databases: any[]
  volumes: any[]
}) {
  const online = servers.filter((s) => s.status === 'online').length
  const totalDiskUsed = servers.reduce((a, s) => a + s.diskUsedGb, 0)
  const totalDisk = servers.reduce((a, s) => a + s.diskGb, 0)
  const diskPct = totalDisk ? Math.round((totalDiskUsed / totalDisk) * 100) : 0
  const dbRunning = databases.filter((d) => d.status === 'running').length

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="h-11 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Server size={14} className="text-primary" />
          Cluster health
        </div>
        <Badge variant="outline" className="text-[10px] h-5">
          {servers.length} node{servers.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className="p-4 space-y-3">
        <HealthRow label="Servers online" value={`${online}/${servers.length}`} status={online === servers.length ? 'healthy' : 'degraded'} />
        <HealthRow label="Databases running" value={`${dbRunning}/${databases.length}`} status={dbRunning === databases.length ? 'healthy' : 'degraded'} />
        <HealthRow label="Volumes attached" value={`${volumes.length}`} status="healthy" />
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-muted-foreground">Cluster disk usage</span>
            <span className="font-mono">{diskPct}% · <BytesShort gb={totalDiskUsed} /> / <BytesShort gb={totalDisk} /></span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${diskPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthRow({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{value}</span>
        <StatusDot status={status} />
      </div>
    </div>
  )
}

function ActivityFeed({ activity }: { activity: any[] }) {
  const iconFor = (kind: string) => {
    const map: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
      deploy: Rocket,
      rollback: History,
      scale: Boxes,
      domain: Globe,
      database: Database,
      backup: HardDrive,
      env: GitCommit,
      server: Server,
    }
    const Icon = map[kind] ?? Activity
    return <Icon size={12} className="text-muted-foreground" />
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="h-11 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Activity size={14} className="text-primary" />
          Activity
        </div>
      </div>
      <div className="p-3 space-y-0.5 max-h-[320px] overflow-y-auto">
        {activity.map((a) => (
          <div key={a.id} className="flex gap-2.5 px-1 py-1.5 hover:bg-accent/40 rounded transition-colors">
            <div className="mt-1 shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              {iconFor(a.kind)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] leading-snug">
                <span className="font-medium">{a.actor}</span>{' '}
                <span className="text-muted-foreground">{a.message}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                <TimeAgo ts={a.ts} className="text-[10px]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpcomingMaintenance() {
  // ponytail: was a hardcoded list of fake maintenance items. No scheduled-job
  // model exists yet, so show an honest empty state instead of invented data.
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="h-11 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <TrendingUp size={14} className="text-primary" />
          Upcoming
        </div>
      </div>
      <div className="p-4">
        <p className="text-[12px] text-muted-foreground leading-snug">
          No scheduled maintenance. Backup schedules run automatically — see Backups.
        </p>
      </div>
    </div>
  )
}
