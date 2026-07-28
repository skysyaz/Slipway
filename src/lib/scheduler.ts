/**
 * In-process cron scheduler. Runs active BackupSchedule entries on their cron
 * expressions and periodic housekeeping (SSL expiry checks).
 *
 * ponytail: single-instance only — this runs inside the Next.js server
 * process. If you scale Slipway horizontally, move scheduling to an external
 * worker/queue to avoid duplicate firings. The ceiling is noted here.
 *
 * ponytail: node-cron OWNS the schedule matching now. This used to tick every
 * minute and decide whether each expression matched using a hand-rolled
 * field matcher, which ANDed day-of-month with day-of-week. Cron ORs them when
 * both are restricted, so a perfectly valid `0 0 1 * 1` ("1st of the month or
 * any Monday") fired only in months whose 1st happens to be a Monday — roughly
 * one time in seven, silently. Rather than reimplement cron correctly, we let
 * the library we already depend on do it: one real ScheduledTask per active
 * schedule, reconciled every minute so rows added, edited, paused or deleted in
 * the UI take effect without a restart.
 */
import * as cron from "node-cron"
import { db } from "./db"
import { realBackup } from "./docker-ops"
import { emit } from "./notify"

let started = false

/** Housekeeping jobs that live for the process lifetime. */
const systemJobs: cron.ScheduledTask[] = []

/**
 * Live backup jobs, keyed by BackupSchedule id. `expression` is retained so a
 * reconcile can tell an edited schedule from an unchanged one and only rebuild
 * what actually changed.
 */
const backupJobs = new Map<string, { expression: string; task: cron.ScheduledTask }>()

function stopTask(task: cron.ScheduledTask): void {
  // stop()/destroy() may return a promise in node-cron 4; we never await them
  // (nothing depends on the teardown completing) but we must not let a
  // rejection escape as an unhandled rejection.
  try {
    void Promise.resolve(task.stop()).catch(() => {})
    void Promise.resolve(task.destroy?.()).catch(() => {})
  } catch {
    /* already stopped */
  }
}

/**
 * Bring the running cron tasks in line with the active BackupSchedule rows:
 * start jobs that are new, rebuild jobs whose expression changed, and stop
 * jobs whose row was paused or deleted.
 */
async function reconcileBackupJobs(): Promise<void> {
  const rows = await db.backupSchedule.findMany({ where: { active: true } }).catch(() => null)
  if (rows === null) return // DB unavailable — keep the current jobs running

  const seen = new Set<string>()
  for (const row of rows) {
    seen.add(row.id)
    // An invalid expression can reach the table (the API stores what it is
    // given); skip it loudly-once rather than crashing the scheduler.
    if (!cron.validate(row.schedule)) {
      if (!invalidWarned.has(row.id)) {
        invalidWarned.add(row.id)
        console.error(`[scheduler] ignoring backup schedule ${row.id}: "${row.schedule}" is not a valid cron expression`)
      }
      continue
    }
    invalidWarned.delete(row.id)

    const existing = backupJobs.get(row.id)
    if (existing && existing.expression === row.schedule) continue
    if (existing) stopTask(existing.task)

    const task = cron.schedule(row.schedule, () => {
      realBackup(row.target, row.targetKind, row.schedule, "scheduler").catch((e) => {
        // realBackup already records the failed BackupRecord and notifies; this
        // keeps the rejection from escaping the cron callback.
        console.error("[scheduler] backup failed:", e instanceof Error ? e.message : e)
      })
    })
    backupJobs.set(row.id, { expression: row.schedule, task })
  }

  for (const [id, job] of backupJobs) {
    if (!seen.has(id)) {
      stopTask(job.task)
      backupJobs.delete(id)
    }
  }
}

/** Schedule ids already reported as invalid, so the log isn't spammed each tick. */
const invalidWarned = new Set<string>()

/** Start the scheduler once per process. Safe to call repeatedly. */
export function startScheduler(): void {
  if (started) return
  started = true

  // Pick up schedule changes without a restart. Cheap: one indexed query.
  const reconcile = cron.schedule("* * * * *", () => {
    void reconcileBackupJobs()
  })

  // Daily SSL-expiry scan: warn on domains expiring within 14 days.
  const sslScan = cron.schedule("0 6 * * *", async () => {
    const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    const domains = await db.domain
      .findMany({ where: { sslExpiry: { lte: soon }, ssl: { not: "disabled" } } })
      .catch(() => [])
    for (const d of domains) {
      await emit("ssl.expiring", "ssl", `SSL for ${d.hostname} expiring soon`, {
        title: "SSL certificate expiring",
        body: `${d.hostname} expires ${d.sslExpiry?.toISOString()}.`,
        level: "warning",
        kind: "ssl",
      }).catch(() => {})
    }
  })

  systemJobs.push(reconcile, sslScan)
  // Load existing schedules immediately rather than waiting for the first tick.
  void reconcileBackupJobs()
  console.log("[scheduler] started (backup schedules + SSL scan)")
}

export function stopScheduler(): void {
  for (const j of systemJobs) stopTask(j)
  systemJobs.length = 0
  for (const [, job] of backupJobs) stopTask(job.task)
  backupJobs.clear()
  invalidWarned.clear()
  started = false
}
