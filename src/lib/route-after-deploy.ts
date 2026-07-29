/**
 * Copyright contributors of Openship (https://github.com/oblien/openship).
 * Licensed under the Apache License, Version 2.0.
 * Modifications © Slipway — route-after-up + action-required semantics adapted
 * from packages/adapters/src/runtime/route-registration.ts and
 * deploy-pipeline.ts. See THIRD-PARTY/NOTICES.
 *
 * Domains are OPTIONAL and routing runs AFTER the container is healthy, so a
 * routing/TLS failure must NEVER fail the deploy. Warnings become
 * "action-required" on the domain row for the operator to fix.
 */

export type DomainActionState =
  | "active"
  | "pending"
  | "failed"
  | "action-required"

export interface RouteDomainResult {
  hostname: string
  ok: boolean
  /** Persisted Domain.status */
  status: DomainActionState
  warning?: string
}

/**
 * Map a best-effort route attempt onto an honest domain status.
 * - ok + letsencrypt → pending (ACME may still be in flight)
 * - ok + http/selfsigned → active
 * - !ok → action-required (app is up; operator must fix DNS/proxy)
 */
export function domainStatusAfterRoute(opts: {
  routed: boolean
  tlsMode: "letsencrypt" | "selfsigned" | "http"
  error?: string
}): RouteDomainResult["status"] {
  if (!opts.routed) return "action-required"
  if (opts.tlsMode === "letsencrypt") return "pending"
  return "active"
}

export function formatRouteWarning(hostname: string, error: string): string {
  const msg = (error || "routing failed").trim().slice(0, 400)
  return `${hostname}: ${msg}`
}

/**
 * Aggregate per-domain warnings for storage on Deployment.routeWarnings
 * (JSON string array). Empty → undefined (no column noise).
 */
export function serializeRouteWarnings(warnings: string[]): string | null {
  const cleaned = warnings.map((w) => w.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  return JSON.stringify(cleaned.slice(0, 50))
}

export function parseRouteWarnings(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/**
 * Derive an operator-facing action-required chip from domain row + warnings.
 * Pure — used by status.ts / UI.
 */
export function deriveRoutingAction(opts: {
  status: string
  routeWarnings?: string[]
  hostname?: string
}): { actionRequired: boolean; label: string; reason?: string } {
  if (opts.status === "action-required" || opts.status === "failed") {
    const hit = (opts.routeWarnings || []).find((w) =>
      opts.hostname ? w.startsWith(opts.hostname) : true
    )
    return {
      actionRequired: true,
      label: "Action required",
      reason: hit || "Routing/TLS needs attention — the app may still be up.",
    }
  }
  return { actionRequired: false, label: "" }
}
