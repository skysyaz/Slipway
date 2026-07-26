'use client'

import * as React from 'react'
import {
  Database as DatabaseIcon,
  Plus,
  Search,
  HardDrive,
  Activity,
  Archive,
  Server,
  ChevronRight,
  RotateCcw,
  Copy,
  MoreHorizontal,
  Boxes,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useSlipway } from '@/lib/slipway/store'
import { DbGlyph, StatusDot } from '../icons'
import { TimeAgo, BytesShort } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function DatabasesView() {
  const databases = useSlipway((s) => s.databases)
  const projects = useSlipway((s) => s.projects)
  const [query, setQuery] = React.useState('')

  const filtered = databases.filter((d) => !query || d.name.includes(query) || d.kind.includes(query))

  const totalStorage = databases.reduce((a, d) => a + d.storageGb, 0)
  const usedStorage = databases.reduce((a, d) => a + d.usedGb, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Databases</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {databases.length} managed databases ·{' '}
            <BytesShort gb={usedStorage} /> of <BytesShort gb={totalStorage} /> used ·{' '}
            {databases.filter((d) => d.backupsEnabled).length} with backups enabled
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Boxes size={13} />
            Import compose DB
          </Button>
          <Button size="sm" className="h-9 gap-2">
            <Plus size={13} />
            New database
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat label="Postgres" value={databases.filter((d) => d.kind === 'postgres').length} icon={DatabaseIcon} color="oklch(0.65 0.18 250)" />
        <QuickStat label="Redis / Valkey" value={databases.filter((d) => d.kind === 'redis' || d.kind === 'valkey').length} icon={Activity} color="oklch(0.65 0.22 25)" />
        <QuickStat label="MongoDB" value={databases.filter((d) => d.kind === 'mongodb').length} icon={DatabaseIcon} color="oklch(0.7 0.18 140)" />
        <QuickStat label="MySQL / MariaDB" value={databases.filter((d) => d.kind === 'mysql' || d.kind === 'mariadb').length} icon={DatabaseIcon} color="oklch(0.7 0.15 230)" />
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search databases…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-9 text-[13px]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map((db) => {
          const project = projects.find((p) => p.id === db.projectId)
          const usagePct = Math.round((db.usedGb / db.storageGb) * 100)
          return (
            <div key={db.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <DbGlyph kind={db.kind} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold truncate">{db.name}</span>
                    <StatusDot status={db.status} />
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {db.kind} {db.version} · {db.host}:{db.port}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal size={13} />
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {project ? (
                  <Badge variant="outline" className="text-[10px]">linked: {project.name}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">shared</Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{db.region}</Badge>
                {db.backupsEnabled ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    <Archive size={9} className="mr-0.5" />
                    Backups on
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Backups off</Badge>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Storage</span>
                    <span className="font-mono">{usagePct}%</span>
                  </div>
                  <Progress value={usagePct} className="h-1.5" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    <BytesShort gb={db.usedGb} /> / <BytesShort gb={db.storageGb} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Connections</span>
                    <span className="font-mono">{Math.round((db.connections / db.maxConnections) * 100)}%</span>
                  </div>
                  <Progress value={(db.connections / db.maxConnections) * 100} className="h-1.5" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {db.connections} / {db.maxConnections}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground font-mono">
                  created <TimeAgo ts={db.createdAt} className="text-[10px]" />
                </div>
                <div className="flex items-center gap-1">
                  <CopyButton text={`postgres://••••@${db.host}:${db.port}/${db.name}`} />
                  <Button variant="outline" size="sm" className="h-7 text-[11px]">
                    <RotateCcw size={10} className="mr-1" />
                    Restart
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]">
                    <Archive size={10} className="mr-1" />
                    Backup
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuickStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `oklch(from ${color} l c h / 0.15)`, color }}
      >
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      onClick={() => {
        navigator.clipboard?.writeText(text)
        toast({ title: 'Connection string copied' })
      }}
    >
      <Copy size={11} />
    </Button>
  )
}
