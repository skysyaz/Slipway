import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"
import { redactSecretValue } from "@/lib/sanitize-fields"

export const dynamic = "force-dynamic"

// ponytail: this route's own docstring promises "no secrets", but it dumped
// every Setting row verbatim — and Settings is exactly where per-server SSH
// passwords live (`server:<id>:password`, see the server-join route). Exporting
// the config therefore handed out plaintext SSH credentials in a file people
// paste into issues and share with support.

// Exports a redacted configuration snapshot (no secrets). The client triggers
// a file download from this JSON.
export const GET = route(async (_req, _params, _auth) => {
  const [projects, databases, volumes, servers, domains, registries, webhooks, integrations, schedules, settings] =
    await Promise.all([
      db.project.findMany({ select: { name: true, slug: true, source: true, stack: true, environment: true, status: true, url: true } }),
      db.databaseInstance.findMany({ select: { name: true, kind: true, version: true, status: true, host: true, port: true } }),
      db.volume.findMany({ select: { name: true, mountPath: true, sizeGb: true, type: true, encrypted: true } }),
      db.server.findMany({ select: { name: true, hostname: true, ip: true, role: true, status: true, os: true } }),
      db.domain.findMany({ select: { hostname: true, type: true, ssl: true, https: true, status: true } }),
      db.registry.findMany({ select: { name: true, url: true, auth: true } }),
      db.webhook.findMany({ select: { url: true, events: true, active: true } }),
      db.integration.findMany({ select: { kind: true, active: true } }),
      db.backupSchedule.findMany({ select: { target: true, targetKind: true, schedule: true, retentionDays: true, active: true } }),
      db.setting.findMany(),
    ])

  const config = {
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
    projects,
    databases,
    volumes,
    servers,
    domains,
    registries,
    webhooks,
    integrations,
    backupSchedules: schedules,
    settings: Object.fromEntries(settings.map((s) => [s.key, redactSecretValue(s.key, s.value)])),
  }

  return NextResponse.json(config, {
    headers: { "content-disposition": 'attachment; filename="slipway-config.json"' },
  })
})