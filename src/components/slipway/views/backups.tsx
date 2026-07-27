'use client'

import * as React from 'react'
import { Archive, Plus, RotateCcw, Download, MoreHorizontal, Clock, Check, AlertTriangle, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StatusDot, DbGlyph } from '../icons'
import { TimeAgo, Duration, BytesShort } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function BackupsView() {
  const backups = useSlipway((s) => s.backups)
  const setNewBackupOpen = useSlipway((s) => s.setNewBackupOpen)
  const setNewBackupScheduleOpen = useSlipway((s) => s.setNewBackupScheduleOpen)
  const { toast } = useToast()

  const stats = {
    total: backups.length,
    completed: backups.filter((b) => b.status === 'completed').length,
    running: backups.filter((b) => b.status === 'running').length,
    failed: backups.filter((b) => b.status === 'failed').length,
    scheduled: backups.filter((b) => b.status === 'scheduled').length,
  }

  const totalSize = backups.filter((b) => b.status === 'completed').reduce((a, b) => a + b.sizeMb, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Backups</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {stats.completed} completed · {stats.running} running · {stats.scheduled} scheduled · {stats.failed} failed ·{' '}
            <BytesShort gb={totalSize / 1024} /> stored
          </p>
        </div>
        <Button size="sm" className="h-9 gap-2" onClick={() => setNewBackupOpen(true)}>
          <Plus size={13} />
          New backup
        </Button>
      </div>

      {/* Schedules */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold">Backup schedules</div>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setNewBackupScheduleOpen(true)}>
            <Plus size={10} className="mr-1" />
            New schedule
          </Button>
        </div>
        <div className="space-y-2">
          {[
            { name: 'helix-postgres', schedule: 'Every 6 hours', retention: '14 days', target: 'fra1-manager:/backups/pg' },
            { name: 'helix-redis', schedule: 'Every 6 hours', retention: '7 days', target: 'fra1-manager:/backups/redis' },
            { name: 'analytics-clickhouse', schedule: 'Daily at 03:00 UTC', retention: '30 days', target: 'fra1-manager:/backups/ch' },
            { name: 'legacy-mysql', schedule: 'Daily at 02:00 UTC', retention: '30 days', target: 'sg1-standalone:/backups/mysql' },
            { name: 'helix-uploads (volume)', schedule: 'Weekly on Sun at 01:00', retention: '90 days', target: 'fra1-manager:/backups/vol' },
          ].map((s) => (
            <div key={s.name} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-accent/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Archive size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium font-mono truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  <span className="font-mono">{s.schedule}</span> · keep {s.retention} · <span className="font-mono">{s.target}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal size={12} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-11 px-4 flex items-center justify-between border-b border-border">
          <div className="text-[13px] font-semibold">Backup history</div>
          <div className="text-[10px] text-muted-foreground font-mono">last 30 days</div>
        </div>
        <div className="grid grid-cols-12 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <div className="col-span-3">Target</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Started</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {backups.map((b, i) => (
          <div key={b.id} className={cn('grid grid-cols-12 px-4 py-2.5 items-center text-[12px] hover:bg-accent/30 transition-colors', i !== backups.length - 1 && 'border-b border-border')}>
            <div className="col-span-3">
              <div className="font-mono truncate">{b.target}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{b.server}</div>
            </div>
            <div className="col-span-2">
              <Badge variant="outline" className="text-[10px] capitalize">{b.targetKind}</Badge>
            </div>
            <div className="col-span-2">
              <StatusDot status={b.status} />
            </div>
            <div className="col-span-2 font-mono">
              {b.sizeMb > 0 ? <BytesShort gb={b.sizeMb / 1024} /> : '—'}
              {b.durationMs && <div className="text-[10px] text-muted-foreground"><Duration ms={b.durationMs} className="text-[10px]" /></div>}
            </div>
            <div className="col-span-2 text-muted-foreground">
              <TimeAgo ts={b.startedAt} className="text-[11px]" />
            </div>
            <div className="col-span-1 flex items-center justify-end gap-0.5">
              {b.status === 'completed' && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download" onClick={() => toast({ title: 'Download started', description: `${b.target} backup is downloading.` })}>
                    <Download size={11} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Restore" onClick={() => toast({ title: 'Restore initiated', description: `${b.target} restore dialog would open here.` })}>
                    <RotateCcw size={11} />
                  </Button>
                </>
              )}
              {b.status === 'failed' && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Retry" onClick={() => toast({ title: 'Retry queued', description: `${b.target} backup will retry.` })}>
                  <RotateCcw size={11} />
                </Button>
              )}
              {b.status === 'running' && (
                <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1">
                  <Clock size={10} className="animate-pulse" />
                  running
                </span>
              )}
              {b.status === 'scheduled' && (
                <span className="text-[10px] text-muted-foreground font-mono">scheduled</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Restore info */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[13px] font-semibold mb-2">Point-in-time recovery</div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Slipway writes continuous WAL/streaming backups for supported databases. Restore to any second within the retention window
          — perfect for “oops I dropped a table” moments. Snapshots are stored on-disk on the manager node, with optional mirroring
          to S3, B2, or any S3-compatible target.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">S3-compatible</Badge>
          <Badge variant="outline" className="text-[10px]">Backblaze B2</Badge>
          <Badge variant="outline" className="text-[10px]">Local disk</Badge>
          <Badge variant="outline" className="text-[10px]">NFS share</Badge>
          <Badge variant="outline" className="text-[10px]">Encrypted at rest</Badge>
        </div>
      </div>
    </div>
  )
}
