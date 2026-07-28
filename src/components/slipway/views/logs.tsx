'use client'

import * as React from 'react'
import { ScrollText, Pause, Play, Download, Search, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSlipway } from '@/lib/slipway/store'
import { cn } from '@/lib/utils'

export function LogsView() {
  const logs = useSlipway((s) => s.logs)
  const appendLogLine = useSlipway((s) => s.appendLogLine)
  const [paused, setPaused] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [levelFilter, setLevelFilter] = React.useState<string>('all')
  const [serviceFilter, setServiceFilter] = React.useState<string>('all')
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Stream real container logs from /api/logs/stream (Docker-backed, no fake data).
  React.useEffect(() => {
    const es = new EventSource('/api/logs/stream')
    es.onmessage = (ev) => {
      try {
        const line = JSON.parse(ev.data)
        appendLogLine({
          id: String(line.id),
          ts: new Date(line.ts).toISOString(),
          level: line.level,
          service: String(line.service),
          message: String(line.message),
        })
      } catch {
        /* ignore malformed frame */
      }
    }
    return () => es.close()
  }, [appendLogLine])

  React.useEffect(() => {
    if (containerRef.current && !paused) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, paused])

  const exportLogs = () => {
    const blob = new Blob(
      [logs.map((l) => `${l.ts} ${l.level.toUpperCase()} ${l.service} ${l.message}`).join('\n')],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'slipway-logs.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = logs.filter((l) => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false
    if (serviceFilter !== 'all' && l.service !== serviceFilter) return false
    if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  const levelColor: Record<string, string> = {
    critical: 'text-rose-600',
    info: 'text-emerald-500',
    warn: 'text-amber-500',
    error: 'text-rose-500',
    debug: 'text-sky-500',
    system: 'text-muted-foreground',
  }

  // ponytail: collapse a crash-loop into ONE row. The real Postgres ENOSPC
  // crash-loop is INTERLEAVED — each cycle repeats the same ~7 lines but with a
  // new [PID] + timestamp, so byte-identical / pure-consecutive grouping never
  // collapses it. We normalize the message (dates/times/[PID]/`PID n` → tokens)
  // and bucket the WHOLE filtered list by service+level+normalizedKey, so all
  // 30 PANIC lines fold into one ×30 critical row. Map preserves first-seen
  // order; the row shows the first line's original text + ×N + first→last span;
  // expand to see every original line.
  const normKey = (s: string): string =>
    s
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?\s*(UTC|Z)?/g, '<ts>')
      .replace(/\b\d{2}:\d{2}:\d{2}(\.\d+)?\b/g, '<ts>')
      .replace(/\[\d+\]/g, '[#]')
      .replace(/PID \d+/gi, 'PID #')
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const grouped = React.useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        level: string
        service: string
        message: string
        count: number
        firstTs: string
        lastTs: string
        lines: typeof filtered
      }
    >()
    for (const l of filtered) {
      const k = l.service + '|' + l.level + '|' + normKey(l.message)
      const g = map.get(k)
      if (g) {
        g.count++
        g.lastTs = l.ts
        g.lines.push(l)
      } else {
        map.set(k, {
          key: l.id,
          level: l.level,
          service: l.service,
          message: l.message,
          count: 1,
          firstTs: l.ts,
          lastTs: l.ts,
          lines: [l],
        })
      }
    }
    return [...map.values()]
  }, [filtered])

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const timeSpan = (first: string, last: string) => {
    const ms = new Date(last).getTime() - new Date(first).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight flex items-center gap-2">
            <ScrollText size={18} className="text-primary" />
            Live logs
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Streaming from all services in the cluster · <span className="font-mono">{logs.length} lines buffered</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={paused ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-2"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportLogs}>
            <Download size={13} />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter logs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-[13px] font-mono"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 h-9">
          {['all', 'info', 'warn', 'error', 'debug'].map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={cn(
                'px-2.5 h-8 rounded text-[11px] uppercase font-mono transition-colors',
                levelFilter === l ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 h-9 overflow-x-auto max-w-full">
          {['all', ...Array.from(new Set(logs.map((l) => l.service))).sort()].slice(0, 12).map((s) => (
            <button
              key={s}
              onClick={() => setServiceFilter(s)}
              className={cn(
                'px-2.5 h-8 rounded text-[11px] font-mono whitespace-nowrap transition-colors',
                serviceFilter === s ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Log viewer */}
      <div
        ref={containerRef}
        className="rounded-xl border border-border bg-[oklch(0.12_0.005_240)] font-mono text-[12px] h-[560px] overflow-y-auto"
      >
        <div className="grid grid-cols-[80px_60px_120px_minmax(0,1fr)] gap-3 px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold sticky top-0 bg-[oklch(0.12_0.005_240)] z-10">
          <div>Time</div>
          <div>Level</div>
          <div>Service</div>
          <div>Message</div>
        </div>
        {grouped.map((g) => (
          <React.Fragment key={g.key}>
            <button
              type="button"
              onClick={() => g.count > 1 && toggleGroup(g.key)}
              className={cn(
                'log-line w-full text-left grid grid-cols-[80px_60px_120px_minmax(0,1fr)] gap-3 px-3 py-1 hover:bg-white/5',
                g.level === 'critical' && 'bg-rose-500/10',
                g.count === 1 && 'cursor-default',
              )}
            >
              <span className="text-muted-foreground/60 whitespace-nowrap tabular-nums">
                {new Date(g.firstTs).toISOString().slice(11, 23)}
              </span>
              <span className={cn('uppercase font-medium whitespace-nowrap', levelColor[g.level])}>{g.level}</span>
              <span className="text-muted-foreground/80 whitespace-nowrap truncate" title={g.service}>{g.service}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                {g.message}
                {g.count > 1 && (
                  <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    ×{g.count} <span className="text-muted-foreground/70">over {timeSpan(g.firstTs, g.lastTs)}</span>
                    <span className="text-muted-foreground/50">{expanded.has(g.key) ? '▾' : '▸'}</span>
                  </span>
                )}
              </span>
            </button>
            {g.count > 1 && expanded.has(g.key) && (
              <div className="border-l-2 border-rose-500/30 ml-[80px]">
                {g.lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[60px_120px_minmax(0,1fr)] gap-3 px-3 py-0.5 text-[11px] text-muted-foreground/70">
                    <span className="whitespace-nowrap tabular-nums">{new Date(l.ts).toISOString().slice(11, 23)}</span>
                    <span className="whitespace-nowrap truncate">{l.service}</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div>
          {paused ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Stream paused · {filtered.length} lines shown
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
              Streaming · {filtered.length} lines
            </span>
          )}
        </div>
        <div className="font-mono">retention: 30 days · stored in <code className="text-foreground">/var/log/slipway</code></div>
      </div>
    </div>
  )
}
