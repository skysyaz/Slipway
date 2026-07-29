/**
 * Copyright contributors of Openship (https://github.com/oblien/openship).
 * Licensed under the Apache License, Version 2.0.
 * Modifications © Slipway — frozen per-deploy config snapshot adapted from
 * Openship apps/api/src/modules/deployments/build-config.ts.
 * See THIRD-PARTY/NOTICES.
 *
 * Resolved build/start/port/env config is frozen onto each Deployment so
 * redeploys and rollbacks re-run exactly what shipped (not whatever the
 * Project row says later).
 */

import { encryptSecret, scrub } from "./security"

export interface DeployConfigSnapshot {
  version: 1
  frozenAt: string
  repoUrl?: string
  branch: string
  source: string
  stack?: string
  framework?: string
  buildCmd?: string
  startCmd?: string
  port?: number
  rootDirectory?: string
  monorepo?: boolean
  monorepoPath?: string
  /** Non-secret env keys as plaintext; secret/masked values stored encrypted. */
  env?: Record<string, string>
  /** Keys whose values in `env` are AES-GCM ciphertext (v1:…). */
  encryptedEnvKeys?: string[]
}

export interface SnapshotProjectInput {
  source: string
  repoUrl?: string | null
  stack?: string | null
  framework?: string | null
  buildCmd?: string | null
  startCmd?: string | null
  monorepo?: boolean
  monorepoPath?: string | null
  environment?: string
  envVars?: Array<{ key: string; value: string; scope: string; masked: boolean }>
}

export interface SnapshotDeployOpts {
  branch?: string
  source?: string
  repoUrl?: string
  buildCmd?: string
  startCmd?: string
  stack?: string
  port?: number
}

/** Build a snapshot from the project row + effective deploy opts. */
export function buildDeploySnapshot(
  project: SnapshotProjectInput,
  opts: SnapshotDeployOpts,
  resolvedPort?: number
): DeployConfigSnapshot {
  const env: Record<string, string> = {}
  const encryptedEnvKeys: string[] = []
  const scope = project.environment || "production"
  for (const e of project.envVars || []) {
    if (e.scope !== "all" && e.scope !== scope) continue
    if (e.masked) {
      try {
        env[e.key] = encryptSecret(e.value)
        encryptedEnvKeys.push(e.key)
      } catch {
        // Fail closed for the secret: omit rather than store plaintext when
        // the master key is missing. Non-masked vars still snapshot.
      }
    } else {
      env[e.key] = e.value
    }
  }
  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    repoUrl: opts.repoUrl || project.repoUrl || undefined,
    branch: opts.branch || "main",
    source: opts.source || project.source,
    stack: opts.stack || project.stack || undefined,
    framework: project.framework || undefined,
    buildCmd: opts.buildCmd ?? project.buildCmd ?? undefined,
    startCmd: opts.startCmd ?? project.startCmd ?? undefined,
    port: resolvedPort,
    rootDirectory: project.monorepoPath || undefined,
    monorepo: Boolean(project.monorepo),
    monorepoPath: project.monorepoPath || undefined,
    ...(Object.keys(env).length ? { env } : {}),
    ...(encryptedEnvKeys.length ? { encryptedEnvKeys } : {}),
  }
}

export function serializeSnapshot(snapshot: DeployConfigSnapshot): string {
  return JSON.stringify(snapshot)
}

export function parseSnapshot(raw: string | null | undefined): DeployConfigSnapshot | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as DeployConfigSnapshot
    if (v?.version !== 1) return null
    return v
  } catch {
    return null
  }
}

/** API/export-safe view — secrets scrubbed. */
export function snapshotForApi(raw: string | null | undefined): unknown {
  const s = parseSnapshot(raw)
  if (!s) return undefined
  return scrub(s)
}
