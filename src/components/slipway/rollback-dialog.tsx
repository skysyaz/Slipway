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
import { toast } from 'sonner'
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
            Roll back {target.projectName}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {/* ponytail: describe the deployment by what is actually recorded.
                commitSha is empty for image deploys and for git builds whose
                SHA Slipway never learns — it used to be a random hex string, so
                this dialog confidently quoted a commit that never existed. */}
            <span>
              This re-runs the image released by{' '}
              {target.commitSha ? (
                <>
                  commit <code className="font-mono text-[12px] bg-muted px-1.5 py-0.5 rounded">{target.commitSha}</code>
                </>
              ) : (
                <>this deployment</>
              )}
              {target.commitMessage ? ` (${target.commitMessage})` : ''} for{' '}
              <strong className="text-foreground font-medium">{target.projectName}</strong> on the{' '}
              <strong className="text-foreground font-medium capitalize">{target.environment}</strong> environment.
              <br />
              <br />
              Deployed <TimeAgo ts={target.createdAt} />. The current container is kept until the rolled-back one is
              confirmed running.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[12px] text-foreground/80 leading-snug">
            Slipway recreates the container from that deployment's recorded image — no rebuild. The current container is
            renamed aside first and restored automatically if the rolled-back one fails to start. Deployments with no
            recorded image (and compose deploys) can&apos;t be rolled back this way.
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // ponytail: a rollback can genuinely fail (image pruned off the
              // host, previous image won't start under the current config) and
              // the API says so with a 500. This used to call rollback() bare,
              // so the rejection went unhandled: the dialog closed and the
              // operator was told nothing at all. Keep the dialog open and
              // surface the real message.
              e.preventDefault()
              void rollback(target.id)
                .then(() => {
                  toast.success('Rollback complete', {
                    description: `${target.projectName} is running the previous release again.`,
                  })
                })
                .catch((err: unknown) => {
                  toast.error('Rollback failed', {
                    description: err instanceof Error ? err.message : 'Unknown error',
                  })
                  setTarget(null)
                })
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Roll back now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
