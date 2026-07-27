/**
 * Log-line generation for simulated/runtime log streaming (SSE).
 * Phase 2 streams real `docker logs` for deployed containers; this generator
 * powers the fallback and the generic logs view.
 */
const TEMPLATES: Array<{ level: "info" | "warn" | "error" | "debug" | "system"; service: string; msg: string }> = [
  { level: "info", service: "api", msg: "GET /v2/customers 200 in 14ms" },
  { level: "info", service: "api", msg: "POST /v2/webhooks/stripe 200 in 38ms" },
  { level: "debug", service: "api", msg: "cache hit: customer:42" },
  { level: "info", service: "api", msg: "GET /v2/health 200 in 1ms" },
  { level: "warn", service: "worker", msg: "retrying job invoice:generate:8842 (attempt 2/5)" },
  { level: "info", service: "worker", msg: "processed job billing:dunning:run in 412ms" },
  { level: "debug", service: "api", msg: "pg query: SELECT id, email FROM customers WHERE id = $1" },
  { level: "info", service: "web", msg: "rendered /pricing in 86ms (ISR cache HIT)" },
  { level: "info", service: "web", msg: "GET / 200 in 22ms" },
  { level: "info", service: "ingest", msg: "batched 1,204 events to store in 18ms" },
  { level: "system", service: "slipway", msg: "health check passed for api (200 OK)" },
  { level: "system", service: "slipway", msg: "rolling deployment — replicas ready" },
  { level: "info", service: "api", msg: "POST /auth/login 200 in 84ms" },
  { level: "warn", service: "api", msg: "rate limit hit for ip (429)" },
  { level: "info", service: "scheduler", msg: "cron job cleanup:sessions completed in 1.4s" },
]

let counter = 0
export function genLogLine(serviceOverride?: string) {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
  counter += 1
  return {
    id: `log-${counter}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    level: t.level,
    service: serviceOverride || t.service,
    message: t.msg,
  }
}