'use client'

import * as React from 'react'
import { Archive, Plus, RotateCcw, Download, Trash2, Clock, Check, AlertTriangle, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StatusDot, DbGlyph } from '../icons'
import { TimeAgo, Duration, BytesShort } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function BackupsView() {
  const backups = useSlipway((s) => s.backups)
  const schedules = useSlipway((s) => s.backupSchedules)
  const setNewBackupOpen = useSlipway((s) => s.setNewBackupOpen)
  const setNewBackupScheduleOpen = useSlipway((s) => s.setNewBackupScheduleOpen)
  const runBackup = useSlipway((s) => s.runBackup)
  const deleteBackupSchedule = useSlipway((s) => s.deleteBackupSchedule)
  const { toast } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)

  // ponytail: these controls used to be pure theatre — every one of them fired
  // a toast ("Backup started", "Retry queued", "Download started") and called
  // nothing. Retry and schedule-delete have real endpoints, so they now use
  // them; download/restore genuinely have no backend, so they report where the
  // archive actually is instead of claiming an action that never happens.
  const retry = async (target: string, targetKind: 'database' | 'volume' | 'project') => {
    setBusy(target)
    try {
      await runBackup(target, targetKind)
      toast({ title: 'Backup finished', description: `${target} was backed up.` })
    } catch (e) {
      toast({
        title: 'Backup failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  const removeSchedule = async (id: string, target: string) => {
    try {
      await deleteBackupSchedule(id)
      toast({ title: 'Schedule removed', description: `${target} will no longer be backed up on a cron.` })
    } catch (e) {
      toast({
        title: 'Could not remove schedule',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

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
          {schedules.length === 0 ? (
            <div className="text-[12px] text-muted-foreground py-3 px-1">No backup schedules yet. Create one to back up a database or volume on a cron.</div>
          ) : (
            schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Archive size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium font-mono truncate">{s.target}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-mono">{s.schedule}</span> · keep {s.retentionDays} days · <span className="font-mono">{s.targetKind}</span>
                    {!s.active && <span className="ml-1 text-amber-500">· paused</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500"
                  title="Remove schedule"
                  onClick={() => void removeSchedule(s.id, s.target)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))
          )}
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
            <div className="col-span-3 min-w-0">
              <div className="font-mono truncate" title={b.target}>{b.target}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{b.server}</div>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Where is this archive?"
                    onClick={() =>
                      toast({
                        title: b.fileName ? 'Archive location' : 'No archive recorded',
                        description: b.fileName
                          ? `${b.fileName} — in the slipway-backups Docker volume. Copy it off the host with: docker run --rm -v slipway-backups:/b -v "$PWD":/out alpine cp /b/${b.fileName} /out/`
                          : 'This record predates archive tracking, so Slipway does not know its filename. Look in the slipway-backups Docker volume.',
                      })
                    }
                  >
                    <Download size={11} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Restore"
                    onClick={() =>
                      toast({
                        title: 'Restore is not automated',
                        description: b.fileName
                          ? `Restore ${b.fileName} yourself: copy it out of the slipway-backups volume and pipe it into the engine (e.g. gunzip -c … | psql). Slipway does not overwrite live data on your behalf.`
                          : 'Slipway does not automate restores — it will not overwrite live data on your behalf.',
                      })
                    }
                  >
                    <RotateCcw size={11} />
                  </Button>
                </>
              )}
              {b.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="Retry"
                  disabled={busy === b.target}
                  onClick={() => void retry(b.target, b.targetKind)}
                >
                  <RotateCcw size={11} className={cn(busy === b.target && 'animate-spin')} />
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
