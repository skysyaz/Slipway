'use client'

import * as React from 'react'
import { formatDistanceToNowStrict, format } from 'date-fns'
import { cn } from '@/lib/utils'

export function TimeAgo({ ts, className }: { ts: string; className?: string }) {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  let label = '—'
  let title: string | undefined
  try {
    const d = new Date(ts)
    label = formatDistanceToNowStrict(d, { addSuffix: true })
    title = format(d, 'PPpp')
  } catch {
    // leave defaults
  }
  return (
    <time dateTime={ts} className={cn('text-muted-foreground', className)} title={title}>
      {label}
    </time>
  )
}

export function Clock({ ts, className }: { ts: string; className?: string }) {
  let label = '—'
  try {
    label = format(new Date(ts), 'MMM d, HH:mm:ss')
  } catch {
    // leave default
  }
  return <time className={cn('text-muted-foreground', className)}>{label}</time>
}

export function Duration({ ms, className }: { ms?: number; className?: string }) {
  if (!ms || ms < 0) return <span className={cn('text-muted-foreground', className)}>—</span>
  if (ms < 1000) return <span className={cn('text-muted-foreground', className)}>{ms}ms</span>
  const s = ms / 1000
  if (s < 60) return <span className={cn('text-muted-foreground', className)}>{s.toFixed(1)}s</span>
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return <span className={cn('text-muted-foreground', className)}>{m}m {rem}s</span>
}

export function Bytes({ mb, className }: { mb: number; className?: string }) {
  if (mb < 1) return <span className={cn('text-muted-foreground', className)}>{Math.round(mb * 1024)} KB</span>
  if (mb < 1024) return <span className={cn('text-muted-foreground', className)}>{mb.toFixed(1)} MB</span>
  return <span className={cn('text-muted-foreground', className)}>{(mb / 1024).toFixed(2)} GB</span>
}

export function BytesShort({ gb, className }: { gb: number; className?: string }) {
  if (gb < 1) return <span className={cn('text-muted-foreground', className)}>{Math.round(gb * 1024)} MB</span>
  if (gb < 1024) return <span className={cn('text-muted-foreground', className)}>{gb.toFixed(1)} GB</span>
  return <span className={cn('text-muted-foreground', className)}>{(gb / 1024).toFixed(2)} TB</span>
}

export function Percent({ value, className }: { value: number; className?: string }) {
  return <span className={cn('text-muted-foreground', className)}>{value.toFixed(1)}%</span>
}

// ponytail: metric buffers are empty until Docker samples arrive; guard the
// "last point" read so empty series render "—" instead of crashing on undefined.
export function lastV(data: { v: number }[] | undefined | null): number | undefined {
  return data && data.length ? data[data.length - 1].v : undefined
}
export function lastN(data: number[] | undefined | null): number | undefined {
  return data && data.length ? data[data.length - 1] : undefined
}

export function Sparkline({ data, color = 'oklch(0.7 0.17 158)', height = 32, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const id = React.useId()
  if (!data || data.length === 0) return null
  // ponytail: guard the single-sample case. `i / (data.length - 1)` is 0/0 with
  // one point, so every x became NaN and the whole polyline silently failed to
  // render — and one point is exactly what the metrics buffer holds after the
  // first poll, i.e. every fresh page load. Draw a flat line across instead.
  const span = data.length > 1 ? data.length - 1 : 1
  // Non-finite samples would poison min/max and blank the chart; drop them.
  const clean = data.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null
  const max = Math.max(...clean)
  const min = Math.min(...clean)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const safe = Number.isFinite(v) ? v : min
      const x = (i / span) * width
      const y = height - ((safe - min) / range) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const area = `0,${height} ${points} ${width},${height}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#grad-${id})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Memory({ mb }: { mb: number }) {
  if (mb < 1024) return <span>{mb} MB</span>
  return <span>{(mb / 1024).toFixed(2)} GB</span>
}

export function Cpu({ milli }: { milli: number }) {
  return <span>{(milli / 1000).toFixed(2)} vCPU</span>
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-border bg-muted/60 text-[10px] font-mono font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}
