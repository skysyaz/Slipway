/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * We use it to start the in-process cron scheduler (backup schedules +
 * SSL-expiry scans). See src/lib/scheduler.ts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // Lazy import so the edge runtime / build never evaluates node-cron.
  const { startScheduler } = await import("./lib/scheduler")
  startScheduler()
}