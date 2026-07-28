'use client'

import * as React from 'react'
import { HardDrive, Plus, Search, Server, Lock, MoreHorizontal, Download, Archive, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useSlipway } from '@/lib/slipway/store'
import { api } from '@/lib/api'
import { BytesShort } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Volume, Project } from '@/lib/slipway/types'

export function StorageView() {
  const volumes = useSlipway((s) => s.volumes)
  const projects = useSlipway((s) => s.projects)
  const setNewVolumeOpen = useSlipway((s) => s.setNewVolumeOpen)
  const { toast } = useToast()
  const [query, setQuery] = React.useState('')
  // ponytail: real host-disk total/used via a `df` container (see
  // /api/storage/host). Replaces the old header that summed a 20 GB-per-volume
  // fiction ("240.0 GB"). Null until the first fetch resolves.
  const [host, setHost] = React.useState<{ totalGb: number | null; usedGb: number | null } | null>(null)
  React.useEffect(() => {
    api.get<{ totalGb: number | null; usedGb: number | null }>('/api/storage/host')
      .then(setHost)
      .catch(() => setHost({ totalGb: null, usedGb: null }))
  }, [])

  const filtered = volumes.filter((v) => !query || v.name.includes(query) || v.server.includes(query))

  const totalUsed = volumes.reduce((a, v) => a + v.usedGb, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Storage</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {volumes.length} volumes ·{' '}
            {host?.usedGb !== null && host?.usedGb !== undefined ? (
              <><BytesShort gb={host.usedGb} /> of <BytesShort gb={host.totalGb ?? 0} /> used on host</>
            ) : (
              <><BytesShort gb={totalUsed} /> in volumes</>
            )}
            {' · '}
            {volumes.filter((v) => v.encrypted).length} encrypted
          </p>
        </div>
        <Button size="sm" className="h-9 gap-2" onClick={() => setNewVolumeOpen(true)}>
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
          // ponytail: volumes have no size cap; the bar is this volume's share of
          // the host disk (sizeGb = host total from the live snapshot). When the
          // snapshot didn't supply a total, fall back to the stored sizeGb.
          const cap = host?.totalGb ?? v.sizeGb
          const pct = cap > 0 ? Math.min(100, Math.round((v.usedGb / cap) * 100)) : 0
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
                  <BytesShort gb={v.usedGb} /> used
                </div>
              </div>
              <div className="col-span-1">
                <Badge variant="outline" className="text-[9px] uppercase">{v.type}</Badge>
              </div>
              <div className="col-span-1 flex items-center justify-end gap-0.5">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Backup" onClick={() => toast({ title: 'Backup started', description: `${v.name} backup is running.` })}>
                  <Archive size={12} />
                </Button>
                <VolumeActions vol={v} projects={projects} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Real per-volume actions: link/unlink to a project, delete (with the option
// to also remove the real Docker volume). Replaces the stub "⋯" toast.
function VolumeActions({ vol, projects }: { vol: Volume; projects: Project[] }) {
  const { toast } = useToast()
  const updateVolume = useSlipway((s) => s.updateVolume)
  const deleteVolume = useSlipway((s) => s.deleteVolume)
  const [busy, setBusy] = React.useState(false)

  const link = async (projectId: string | null) => {
    try {
      await updateVolume(vol.id, { projectId })
      toast({ title: projectId ? 'Volume linked' : 'Volume unlinked' })
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const del = async () => {
    // OK = delete the Docker volume + row; Cancel = forget in Slipway only.
    const removeData = window.confirm(
      `Delete volume "${vol.name}"?\n\nOK — delete the real Docker volume AND its data (irreversible).\nCancel — forget it in Slipway only, keep the Docker volume.`
    )
    setBusy(true)
    try {
      await deleteVolume(vol.id, removeData)
      toast({ title: 'Volume removed', description: removeData ? `${vol.name} and its data deleted.` : `${vol.name} forgotten (Docker volume kept).` })
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <MoreHorizontal size={12} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Link to project</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void link(null)}>
          {vol.projectId ? 'Unlink (shared)' : '— (shared)'}
        </DropdownMenuItem>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => void link(p.id)}>{p.name}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => void del()}>
          <Trash2 size={12} className="mr-2" /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
