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

/**
 * ponytail: REAL trend, computed from the series.
 *
 * Every chart on this page used to carry a hardcoded badge — `trend: '+12%'`,
 * `trendUp: true` and so on — rendered next to a live sparkline as though it
 * had been measured. Requests/sec and p95 latency are not instrumented at all,
 * so their series are flat zero while the badge cheerfully claimed "+12% ▲".
 *
 * Compare the mean of the most recent third of the window against the mean of
 * the first third. Returns null when there isn't enough data (or no movement)
 * so the badge is omitted rather than invented.
 */
function trendOf(data: number[]): { label: string; up: boolean } | null {
  if (data.length < 6) return null
  const bucket = Math.floor(data.length / 3)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
  const before = mean(data.slice(0, bucket))
  const after = mean(data.slice(-bucket))
  if (before === 0 && after === 0) return null
  const deltaPct = before === 0 ? 100 : ((after - before) / Math.abs(before)) * 100
  if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < 1) return null
  const rounded = Math.round(deltaPct)
  return { label: `${rounded > 0 ? "+" : ""}${rounded}%`, up: rounded > 0 }
}

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
      big: true,
    },
    {
      title: 'p95 latency',
      series: [{ name: 'ms', data: metrics.p95Latency.data.map((p) => p.v) }],
      unit: 'ms',
      color: 'oklch(0.78 0.16 70)',
      icon: Activity,
      big: true,
    },
    {
      title: 'Error rate',
      series: [{ name: '%', data: metrics.errorRate.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.22 25)',
      icon: AlertTriangle,
    },
    {
      title: 'CPU usage',
      series: [{ name: '%', data: metrics.cpu.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.18 250)',
      icon: Cpu,
    },
    {
      title: 'Memory',
      series: [{ name: '%', data: metrics.memory.data.map((p) => p.v) }],
      unit: '%',
      color: 'oklch(0.65 0.22 300)',
      icon: MemoryStick,
    },
    {
      title: 'Network in',
      series: [{ name: 'Mb/s', data: metrics.networkIn.data.map((p) => p.v) }],
      unit: 'Mb/s',
      color: 'oklch(0.7 0.15 230)',
      icon: Network,
    },
    {
      title: 'Network out',
      series: [{ name: 'Mb/s', data: metrics.networkOut.data.map((p) => p.v) }],
      unit: 'Mb/s',
      color: 'oklch(0.65 0.18 250)',
      icon: Network,
    },
    {
      title: 'Deploys / day',
      series: [{ name: 'deploys', data: metrics.deployFrequency.data.map((p) => p.v) }],
      unit: '/day',
      color: 'oklch(0.7 0.17 158)',
      icon: TrendingUp,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Metrics</h1>
          {/* ponytail: describe the REAL window. This said "Last 60 minutes
              shown · scrape interval: 15s" next to a range picker offering
              1h/6h/24h/7d/30d — none of which was true or wired to anything.
              Samples come from an in-process ring buffer (src/lib/metrics.ts)
              that holds the last 60 samples, one per dashboard poll, and is
              lost on restart. There is no historical store to select a range
              from, so the picker is gone rather than decorative. */}
          <p className="text-[13px] text-muted-foreground mt-1">
            Aggregated across all running containers, sampled from{' '}
            <span className="font-mono">docker stats</span> on each dashboard poll.
            Up to 60 samples are held in memory and reset when Slipway restarts.
          </p>
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
            const trend = trendOf(c.series[0].data)
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
                  {trend && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 text-[11px] font-medium',
                        trend.up ? 'text-emerald-500' : 'text-rose-500',
                      )}
                    >
                      {trend.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {trend.label}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <Sparkline data={c.series[0].data} color={c.color} width={460} height={80} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>peak: {max.toFixed(0)} {c.unit}</span>
                  <span>{c.series[0].data.length} samples</span>
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
            const trend = trendOf(c.series[0].data)
            return (
              <div key={c.title} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-[12px] font-semibold">
                    <Icon size={13} style={{ color: c.color }} />
                    {c.title}
                  </div>
                  {trend && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 text-[10px] font-medium',
                        trend.up ? 'text-emerald-500' : 'text-rose-500',
                      )}
                    >
                      {trend.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {trend.label}
                    </span>
                  )}
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
            // ponytail: these two were `Math.round(40 + Math.random() * 30)` and
            // `Math.round(20 + Math.random() * 40)` — the CPU and Memory bars
            // were literally random numbers, redrawn on every render, and the
            // memory bar multiplied the random percentage by the machine's RAM
            // to print an equally invented "X / Y GB used".
            //
            // What is genuinely known: Slipway samples `docker stats` for the
            // host it runs on (src/lib/metrics.ts), so container CPU% and
            // memory bytes are real for the LOCAL server. Remote servers have
            // no agent reporting back, so they get no bar rather than a
            // fabricated one.
            const diskPct = s.diskGb > 0 ? Math.round((s.diskUsedGb / s.diskGb) * 100) : null
            const isLocal = s.ip === '127.0.0.1' || s.hostname === 'localhost' || s.name === 'local'
            const cpuPct = isLocal ? lastN(metrics.cpu.data.map((p) => p.v)) : undefined
            const memBytes = isLocal ? lastN(metrics.memory.data.map((p) => p.v)) : undefined
            const memPct =
              memBytes != null && s.memoryGb > 0
                ? Math.min(100, Math.round((memBytes / (s.memoryGb * 1e9)) * 100))
                : undefined
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
                  <ResourceBar
                    label="CPU"
                    pct={cpuPct != null ? Math.min(100, Math.round(cpuPct)) : null}
                    value={
                      cpuPct != null
                        ? `${Math.round(cpuPct)}% of ${s.cpuCores} cores`
                        : 'no agent'
                    }
                    color="oklch(0.65 0.18 250)"
                  />
                  <ResourceBar
                    label="Memory"
                    pct={memPct ?? null}
                    value={
                      memBytes != null
                        ? `${(memBytes / 1e9).toFixed(1)} / ${s.memoryGb} GB in containers`
                        : 'no agent'
                    }
                    color="oklch(0.65 0.22 300)"
                  />
                  <ResourceBar
                    label="Disk"
                    pct={diskPct}
                    value={
                      diskPct != null
                        ? `${diskPct}% · ${s.diskUsedGb.toFixed(1)}/${s.diskGb.toFixed(1)} GB`
                        : 'unknown'
                    }
                    color={diskPct != null && diskPct > 80 ? 'oklch(0.65 0.22 25)' : 'oklch(0.7 0.17 158)'}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// pct is null when the figure genuinely isn't known (no agent on a remote
// server, or a zero-size disk) — the bar then renders empty rather than
// implying 0% measured usage.
function ResourceBar({ label, pct, value, color }: { label: string; pct: number | null | undefined; value: string; color: string }) {
  const known = pct != null && Number.isFinite(pct)
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
        <span className={cn('font-mono', !known && 'text-muted-foreground/60')}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        {known && <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />}
      </div>
    </div>
  )
}
