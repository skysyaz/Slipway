'use client'

import * as React from 'react'
import {
  Activity,
  Cpu,
  MemoryStick,
  Network,
  AlertTriangle,
  Server,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useSlipway } from '@/lib/slipway/store'
import { Sparkline, BytesShort, lastN } from '../format'
import { cn } from '@/lib/utils'

export function MetricsView() {
  const metrics = useSlipway((s) => s.metrics)
  const servers = useSlipway((s) => s.servers)

  const charts = [
    {
      title: 'Requests / sec',
      series: [{ name: 'req/s', data: metrics.requestsPerSec.data.map((p) => p.v) }],
      unit: 'req/s',
      color: 'oklch(0.7 0.17 158)',
      icon: Activity,
      trend: '+12%',
      trendUp: true,
      big: true,
    },
    {
      title: 'p95 latency',
      series: [{ name: 'ms', data: metrics.p95Latency.data.map((p) => p.v) }],
      unit: 'ms',
      color: 'oklch(0.78 0.16 70)',
      icon: Activity,
      trend: '-8ms',
      trendUp: true,
      big: true,
    },
    {
      title: 'Error rate',
      series: [{ name: '%', data: metrics.errorRate.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.22 25)',
      icon: AlertTriangle,
      trend: '+0.1%',
      trendUp: false,
    },
    {
      title: 'CPU usage',
      series: [{ name: '%', data: metrics.cpu.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.18 250)',
      icon: Cpu,
      trend: '+4%',
      trendUp: false,
    },
    {
      title: 'Memory',
      series: [{ name: '%', data: metrics.memory.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.22 300)',
      icon: MemoryStick,
      trend: '+2%',
      trendUp: false,
    },
    {
      title: 'Network in',
      series: [{ name: 'Mb/s', data: metrics.networkIn.data.map((p) => p.v) }],
      unit: 'Mb/s',
      color: 'oklch(0.7 0.15 230)',
      icon: Network,
      trend: '+18%',
      trendUp: true,
    },
    {
      title: 'Network out',
      series: [{ name: 'Mb/s', data: metrics.networkOut.data.map((p) => p.v) }],
      unit: 'Mb/s',
      color: 'oklch(0.65 0.18 250)',
      icon: Network,
      trend: '+11%',
      trendUp: true,
    },
    {
      title: 'Deploys / day',
      series: [{ name: 'deploys', data: metrics.deployFrequency.data.map((p) => p.v) }],
      unit: '/day',
      color: 'oklch(0.7 0.17 158)',
      icon: TrendingUp,
      trend: '+12%',
      trendUp: true,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Metrics</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Aggregated across all services in the cluster. Last 60 minutes shown ·{' '}
            <span className="font-mono">scrape interval: 15s</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 h-9">
          {['1h', '6h', '24h', '7d', '30d'].map((r, i) => (
            <button
              key={r}
              className={cn(
                'px-2.5 h-8 rounded text-[12px] font-mono transition-colors',
                i === 0 ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Top charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {charts
          .filter((c) => c.big)
          .map((c) => {
            const Icon = c.icon
            const last = lastN(c.series[0].data)
            const max = Math.max(0, ...c.series[0].data)
            return (
              <div key={c.title} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <Icon size={13} style={{ color: c.color }} />
                      {c.title}
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[28px] font-semibold tabular-nums">
                        {last != null ? last.toFixed(c.unit === '%' || c.unit === 'ms' ? 1 : 0) : '—'}
                      </span>
                      <span className="text-[12px] text-muted-foreground">{c.unit}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[11px] font-medium',
                      c.trendUp ? 'text-emerald-500' : 'text-rose-500',
                    )}
                  >
                    {c.trendUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {c.trend}
                  </span>
                </div>
                <div className="mt-3">
                  <Sparkline data={c.series[0].data} color={c.color} width={460} height={80} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>peak: {max.toFixed(0)} {c.unit}</span>
                  <span>last 60 min</span>
                </div>
              </div>
            )
          })}
      </div>

      {/* Smaller charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {charts
          .filter((c) => !c.big)
          .map((c) => {
            const Icon = c.icon
            const last = lastN(c.series[0].data)
            const max = Math.max(0, ...c.series[0].data)
            return (
              <div key={c.title} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-[12px] font-semibold">
                    <Icon size={13} style={{ color: c.color }} />
                    {c.title}
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[10px] font-medium',
                      c.trendUp ? 'text-emerald-500' : 'text-rose-500',
                    )}
                  >
                    {c.trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {c.trend}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-[20px] font-semibold tabular-nums">
                    {last != null ? last.toFixed(c.unit === '%' ? 1 : 0) : '—'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{c.unit}</span>
                </div>
                <div className="mt-2">
                  <Sparkline data={c.series[0].data} color={c.color} width={300} height={48} />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground font-mono">peak {max.toFixed(0)} {c.unit}</div>
              </div>
            )
          })}
      </div>

      {/* Per-server usage */}
      <div className="rounded-xl border border-border bg-card">
        <div className="h-11 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Server size={14} className="text-primary" />
            Per-server resource usage
          </div>
          <Badge variant="outline" className="text-[10px]">{servers.length} servers</Badge>
        </div>
        <div className="divide-y divide-border">
          {servers.map((s) => {
            const diskPct = Math.round((s.diskUsedGb / s.diskGb) * 100)
            const memPct = Math.round(40 + Math.random() * 30)
            const cpuPct = Math.round(20 + Math.random() * 40)
            return (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Server size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium font-mono">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{s.ip}</span>
                      <Badge variant="outline" className="text-[9px] capitalize">{s.role}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {s.os} · Docker {s.dockerVersion} · uptime {s.uptimeHours}h
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{s.region}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <ResourceBar label="CPU" pct={cpuPct} value={`${cpuPct}% of ${s.cpuCores} cores`} color="oklch(0.65 0.18 250)" />
                  <ResourceBar label="Memory" pct={memPct} value={`${Math.round((memPct / 100) * s.memoryGb)} / ${s.memoryGb} GB`} color="oklch(0.65 0.22 300)" />
                  <ResourceBar label="Disk" pct={diskPct} value={`${diskPct}% · ${s.diskUsedGb.toFixed(1)}/${s.diskGb.toFixed(1)} GB`} color={diskPct > 80 ? 'oklch(0.65 0.22 25)' : 'oklch(0.7 0.17 158)'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ResourceBar({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
