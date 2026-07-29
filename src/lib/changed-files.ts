/**
 * Copyright contributors of Openship (https://github.com/oblien/openship).
 * Licensed under the Apache License, Version 2.0.
 * Modifications © Slipway — adapted for Slipway's SQLite/Next architecture;
 * see THIRD-PARTY/NOTICES.
 *
 * Pure changed-files classifiers for smart monorepo / multi-service deploys.
 * Ported from Openship apps/api/src/modules/github/webhook-changed-files.ts
 * (logic only — no GitHub client, no network).
 */

export interface ChangedFilesResult {
  files: Set<string>
  forceAll: boolean
  reason?: string
  truncated?: boolean
}

export interface CommitFileDelta {
  added?: string[]
  modified?: string[]
  removed?: string[]
  message?: string
}

const FORCE_TOKEN_RE = /\[(force|force-deploy|redeploy-all)\]/i

const ROOT_CONFIG_FILES = new Set([
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".dockerignore",
  "package.json",
])

function normalizeSharedPrefix(p: string): string {
  let s = p.trim()
  if (!s) return ""
  s = s.replace(/\*+$/g, "")
  s = s.replace(/\*+\/?$/g, "")
  if (!s.endsWith("/")) s += "/"
  return s
}

export function unionCommitFiles(commits: CommitFileDelta[] = []): Set<string> {
  const out = new Set<string>()
  for (const c of commits) {
    for (const f of c.added ?? []) out.add(f)
    for (const f of c.modified ?? []) out.add(f)
    for (const f of c.removed ?? []) out.add(f)
  }
  return out
}

/**
 * Decide whether a changed-files set forces a full rebuild — root config
 * files or configured monorepo shared paths.
 */
export function classifyChangedFiles(
  files: Iterable<string>,
  opts: { isMonorepo?: boolean; monorepoSharedPaths?: string[] | null } = {}
): { forceAll: boolean; reason?: string } {
  for (const f of files) {
    if (ROOT_CONFIG_FILES.has(f)) {
      return { forceAll: true, reason: "root-config" }
    }
  }
  if (opts.isMonorepo && opts.monorepoSharedPaths && opts.monorepoSharedPaths.length > 0) {
    const prefixes = opts.monorepoSharedPaths.map(normalizeSharedPrefix).filter(Boolean)
    if (prefixes.length > 0) {
      for (const f of files) {
        if (prefixes.some((p) => f.startsWith(p))) {
          return { forceAll: true, reason: "shared-package" }
        }
      }
    }
  }
  return { forceAll: false }
}

/**
 * Route a changed-files set to affected services by rootDirectory prefix.
 *   - { mode: "all" }      → no routable services → rebuild the single app
 *   - { mode: "services" } → at least one service root matched
 *   - { mode: "skip" }     → services exist but none matched
 */
export function routeServicesByChanges(
  routableServices: Array<{ id: string; rootDirectory: string | null }>,
  files: Iterable<string>
): { mode: "all" } | { mode: "services"; serviceIds: string[] } | { mode: "skip" } {
  if (routableServices.length === 0) return { mode: "all" }
  const matched = routableServices
    .filter((s) => serviceMatchesChanges(s.rootDirectory, files))
    .map((s) => s.id)
  if (matched.length === 0) return { mode: "skip" }
  return { mode: "services", serviceIds: matched }
}

export function serviceMatchesChanges(
  rootDirectory: string | null | undefined,
  files: Iterable<string>
): boolean {
  const root = (rootDirectory ?? "").replace(/^\/+|\/+$/g, "")
  if (!root || root === ".") return true
  const prefix = root.endsWith("/") ? root : root + "/"
  for (const f of files) {
    if (f === root || f.startsWith(prefix)) return true
  }
  return false
}

/**
 * Classify a push-style payload without calling GitHub. Callers that need a
 * compare API for truncated commits supply `files` already expanded and set
 * `truncated` themselves.
 */
export function classifyPushChanges(opts: {
  files: Iterable<string>
  forced?: boolean
  headMessage?: string
  truncated?: boolean
  isMonorepo?: boolean
  monorepoSharedPaths?: string[] | null
}): ChangedFilesResult {
  const files = filesToSet(opts.files)
  if (opts.forced) {
    return { files, forceAll: true, reason: "force-push", truncated: opts.truncated }
  }
  if (FORCE_TOKEN_RE.test(opts.headMessage ?? "")) {
    return { files, forceAll: true, reason: "commit-token", truncated: opts.truncated }
  }
  // Truncated file lists cannot prove a service was untouched → force all.
  if (opts.truncated) {
    return { files, forceAll: true, reason: "truncated", truncated: true }
  }
  const cls = classifyChangedFiles(files, {
    isMonorepo: opts.isMonorepo,
    monorepoSharedPaths: opts.monorepoSharedPaths,
  })
  return { files, forceAll: cls.forceAll, reason: cls.reason, truncated: opts.truncated }
}

function filesToSet(files: Iterable<string>): Set<string> {
  if (files instanceof Set) return files
  return new Set(files)
}

/**
 * Decide whether Slipway should skip a monorepo-path rebuild for this push.
 * Returns { skip: true } only when we can prove the project's monorepoPath
 * (and no shared/root config) was untouched.
 */
export function shouldSkipMonorepoRebuild(opts: {
  monorepoPath: string | null | undefined
  files: Iterable<string>
  forceAll?: boolean
  monorepoSharedPaths?: string[] | null
}): { skip: boolean; reason?: string } {
  if (opts.forceAll) return { skip: false, reason: "forceAll" }
  const path = (opts.monorepoPath ?? "").replace(/^\/+|\/+$/g, "")
  if (!path) return { skip: false, reason: "no-monorepo-path" }
  const cls = classifyChangedFiles(opts.files, {
    isMonorepo: true,
    monorepoSharedPaths: opts.monorepoSharedPaths,
  })
  if (cls.forceAll) return { skip: false, reason: cls.reason }
  if (serviceMatchesChanges(path, opts.files)) return { skip: false, reason: "path-touched" }
  return { skip: true, reason: "untouched" }
}
