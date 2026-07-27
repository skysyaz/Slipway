/**
 * In-process cron scheduler. Runs active BackupSchedule entries on their
 * cron expressions and periodic housekeeping (SSL expiry checks).
 *
 * ponytail: single-instance only — this runs inside the Next.js server
 * process. If you scale Slipway horizontally, move scheduling to an external
 * worker/queue to avoid duplicate firings. The ceiling is noted here.
 */
import * as cron from "node-cron"
import { db } from "./db"
import { realBackup } from "./docker-ops"
import { emit } from "./notify"

let started = false
const jobs: cron.ScheduledTask[] = []

/** Start the scheduler once per process. Safe to call repeatedly. */
export function startScheduler(): void {
  if (started) return
  started = true

  // Reconcile backup schedules every minute: cheap, and avoids storing cron
  // handles against rows that may be deleted. ponytail: O(n) rescan per tick;
  // fine for tens of schedules, swap to a map keyed by id if it grows.
  const reconcile = cron.schedule("* * * * *", async () => {
    const schedules = await db.backupSchedule.findMany({ where: { active: true } }).catch(() => [])
    const now = new Date()
    for (const s of schedules) {
      // ponytail: validate the expression; if invalid skip silently.
      if (!cron.validate(s.schedule)) continue
      // Fire when the current minute matches the cron expression.
      const parts = s.schedule.split(" ")
      if (matchesMinute(parts, now)) {
        realBackup(s.target, s.targetKind, s.schedule, "scheduler").catch((e) => {
          console.error("[scheduler] backup failed:", e instanceof Error ? e.message : e)
        })
      }
    }
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

  jobs.push(reconcile, sslScan)
  console.log("[scheduler] started (backup schedules + SSL scan)")
}

export function stopScheduler(): void {
  for (const j of jobs) j.stop()
  jobs.length = 0
  started = false
}

// Minimal cron minute matcher for the standard 5-field form. Only minute,
// hour, day-of-month, month, day-of-week are evaluated (no seconds/years).
function matchesMinute(parts: string[], d: Date): boolean {
  if (parts.length < 5) return false
  const [min, hour, dom, mon, dow] = parts
  const m = d.getMinutes()
  const h = d.getHours()
  return (
    fieldMatches(min, m) &&
    fieldMatches(hour, h) &&
    fieldMatches(dom, d.getDate()) &&
    fieldMatches(mon, d.getMonth() + 1) &&
    fieldMatches(dow, d.getDay())
  )
}

function fieldMatches(expr: string, value: number): boolean {
  if (expr === "*") return true
  for (const part of expr.split(",")) {
    if (part === "*") return true
    const stepMatch = part.match(/^(\*|\d+)-(\*|\d+)$/);
    void stepMatch
    if (part.includes("/")) {
      const [base, stepStr] = part.split("/")
      const step = Number(stepStr)
      if (!step) continue
      if (base === "*" || base === undefined) {
        if (value % step === 0) return true
      } else if (base.includes("-")) {
        const [lo, hi] = base.split("-").map(Number)
        if (value >= lo && value <= hi && (value - lo) % step === 0) return true
      }
      continue
    }
    if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number)
      if (value >= lo && value <= hi) return true
      continue
    }
    if (Number(part) === value) return true
  }
  return false
}