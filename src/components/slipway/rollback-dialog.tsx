'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, History } from 'lucide-react'
import { useSlipway } from '@/lib/slipway/store'
import { TimeAgo } from './format'

export function RollbackDialog() {
  const target = useSlipway((s) => s.rollbackTarget)
  const setTarget = useSlipway((s) => s.setRollbackTarget)
  const rollback = useSlipway((s) => s.rollback)

  if (!target) return null

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <History size={16} className="text-primary" />
            Roll back to {target.commitSha}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <span>
              This will redeploy commit <code className="font-mono text-[12px] bg-muted px-1.5 py-0.5 rounded">{target.commitSha}</code>{' '}
              ({target.commitMessage}) for{' '}
              <strong className="text-foreground font-medium">{target.projectName}</strong> on the{' '}
              <strong className="text-foreground font-medium capitalize">{target.environment}</strong> environment.
              <br />
              <br />
              Deployed <TimeAgo ts={target.createdAt} />. The current release will be retained for instant roll-forward.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[12px] text-foreground/80 leading-snug">
            Slipway performs an instant rollback by repointing the service to the previous image tag — no rebuild needed.
            If health checks fail, the rollback is aborted automatically.
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => rollback(target.id)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Roll back now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
