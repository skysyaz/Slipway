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
    info: 'text-emerald-500',
    warn: 'text-amber-500',
    error: 'text-rose-500',
    debug: 'text-sky-500',
    system: 'text-muted-foreground',
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
        <div className="grid grid-cols-[80px_60px_120px_1fr] gap-3 px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold sticky top-0 bg-[oklch(0.12_0.005_240)] z-10">
          <div>Time</div>
          <div>Level</div>
          <div>Service</div>
          <div>Message</div>
        </div>
        {filtered.map((l) => (
          <div key={l.id} className="log-line grid grid-cols-[80px_60px_120px_1fr] gap-3 px-3 py-1 hover:bg-white/5">
            <span className="text-muted-foreground/60">
              {new Date(l.ts).toISOString().slice(11, 23)}
            </span>
            <span className={cn('uppercase font-medium', levelColor[l.level])}>{l.level}</span>
            <span className="text-muted-foreground/80">{l.service}</span>
            <span className="break-all">{l.message}</span>
          </div>
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
