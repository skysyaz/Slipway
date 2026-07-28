/**
 * Deployment pipeline types.
 *
 * ponytail: the last simulation in this file is gone. `simulateRollback` lived
 * here and was wired up as the app's ONLY rollback: it inserted a Deployment
 * row with status "healthy" and hardcoded step durations, emitted "Rollback
 * complete. Health checks passed.", and never went near Docker — the container
 * carried on running the image it was already running. Rollback is now
 * realRollback() in src/lib/docker-ops.ts, which recreates the container from
 * the target deployment's recorded image.
 *
 * All that remains here is the shared `DeployOptions` type. The file is kept
 * (rather than deleted) because it is the type's established import site.
 */

export interface DeployOptions {
  branch?: string
  commitMessage?: string
  /** Real git commit id, when the caller knows one. Never fabricated. */
  commitSha?: string
  source?: string
  repoUrl?: string
  folderPath?: string
  composePath?: string
  environment?: string
  stack?: string
  domain?: string
  ssl?: boolean
  buildCmd?: string
  startCmd?: string
}
