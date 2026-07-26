'use client'

import * as React from 'react'
import { HardDrive, Plus, Search, Server, Lock, MoreHorizontal, Download, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useSlipway } from '@/lib/slipway/store'
import { BytesShort } from '../format'
import { cn } from '@/lib/utils'

export function StorageView() {
  const volumes = useSlipway((s) => s.volumes)
  const projects = useSlipway((s) => s.projects)
  const [query, setQuery] = React.useState('')

  const filtered = volumes.filter((v) => !query || v.name.includes(query) || v.server.includes(query))

  const totalSize = volumes.reduce((a, v) => a + v.sizeGb, 0)
  const totalUsed = volumes.reduce((a, v) => a + v.usedGb, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Storage</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {volumes.length} volumes · <BytesShort gb={totalUsed} /> of <BytesShort gb={totalSize} /> used ·{' '}
            {volumes.filter((v) => v.encrypted).length} encrypted
          </p>
        </div>
        <Button size="sm" className="h-9 gap-2">
          <Plus size={13} />
          New volume
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="SSD" value={`${volumes.filter((v) => v.type === 'ssd').length}`} color="oklch(0.7 0.17 158)" />
        <StatTile label="HDD" value={`${volumes.filter((v) => v.type === 'hdd').length}`} color="oklch(0.78 0.16 70)" />
        <StatTile label="NFS (shared)" value={`${volumes.filter((v) => v.type === 'nfs').length}`} color="oklch(0.65 0.18 250)" />
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search volumes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-9 text-[13px]"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Mount path</div>
          <div className="col-span-2">Server</div>
          <div className="col-span-2">Usage</div>
          <div className="col-span-1">Type</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {filtered.map((v, i) => {
          const project = projects.find((p) => p.id === v.projectId)
          const pct = Math.round((v.usedGb / v.sizeGb) * 100)
          return (
            <div key={v.id} className={cn('grid grid-cols-12 px-4 py-3 items-center text-[12px] hover:bg-accent/30 transition-colors', i !== filtered.length - 1 && 'border-b border-border')}>
              <div className="col-span-3">
                <div className="font-medium">{v.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {project ? `linked: ${project.name}` : 'shared volume'}
                  {v.encrypted && <Lock size={9} className="inline ml-1.5 text-emerald-500" />}
                </div>
              </div>
              <div className="col-span-3 font-mono text-[11px] truncate text-muted-foreground">{v.mountPath}</div>
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Server size={11} className="text-muted-foreground" />
                  <span className="font-mono">{v.server}</span>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <Progress value={pct} className="h-1.5 flex-1" />
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{pct}%</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                  <BytesShort gb={v.usedGb} /> / <BytesShort gb={v.sizeGb} />
                </div>
              </div>
              <div className="col-span-1">
                <Badge variant="outline" className="text-[9px] uppercase">{v.type}</Badge>
              </div>
              <div className="col-span-1 flex items-center justify-end gap-0.5">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download snapshot">
                  <Download size={12} />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="More">
                  <MoreHorizontal size={12} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="text-[20px] font-semibold tabular-nums mt-1">{value}</div>
    </div>
  )
}
