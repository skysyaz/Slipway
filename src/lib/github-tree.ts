/**
 * Copyright contributors of Openship (https://github.com/oblien/openship).
 * Licensed under the Apache License, Version 2.0.
 * Modifications © Slipway — public-repo tree listing for stack detect only.
 * See THIRD-PARTY/NOTICES.
 *
 * Pure helpers + a bounded GitHub Contents/Trees fetch used by
 * POST /api/projects/detect. Host allowlist only (no arbitrary URL fetch).
 */

import { normalizeGitSource } from "./git-deploy"

const ALLOWED_API_HOSTS = new Set(["api.github.com"])

export interface PublicTreeResult {
  files: string[]
  /** package.json text when found at repo root (or subdir root). */
  packageJson?: string
  truncated: boolean
  owner: string
  repo: string
  ref: string
}

/** Map a git hosting URL to a public API trees endpoint (GitHub only today). */
export function githubTreesApiUrl(repoUrl: string, branch: string): {
  treesUrl: string
  owner: string
  repo: string
  ref: string
} | null {
  const git = normalizeGitSource(repoUrl, branch || "main")
  if (!git) return null
  if (git.host !== "github.com" && git.host !== "www.github.com") return null
  const ref = encodeURIComponent(git.branch || "main")
  return {
    treesUrl: `https://api.github.com/repos/${git.owner}/${git.repo}/git/trees/${ref}?recursive=1`,
    owner: git.owner,
    repo: git.repo,
    ref: git.branch || "main",
  }
}

export function githubRawFileUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`
}

/** Extract path list from a GitHub trees JSON body (pure). */
export function pathsFromGithubTreesJson(body: unknown, cap = 2000): { files: string[]; truncated: boolean } {
  if (!body || typeof body !== "object") return { files: [], truncated: true }
  const o = body as { tree?: unknown[]; truncated?: boolean }
  const tree = Array.isArray(o.tree) ? o.tree : []
  const files: string[] = []
  for (const entry of tree) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as { path?: string; type?: string }
    if (e.type === "blob" && typeof e.path === "string") {
      files.push(e.path)
      if (files.length >= cap) return { files, truncated: true }
    }
  }
  return { files, truncated: Boolean(o.truncated) }
}

/**
 * Fetch a public GitHub repo file listing. Refuses non-GitHub hosts.
 * Uses undici/fetch; caller must not pass operator-controlled arbitrary URLs
 * — only githubTreesApiUrl output.
 */
export async function fetchPublicGithubTree(
  repoUrl: string,
  branch = "main",
  opts?: { fetchImpl?: typeof fetch; signal?: AbortSignal }
): Promise<PublicTreeResult | null> {
  const meta = githubTreesApiUrl(repoUrl, branch)
  if (!meta) return null
  const fetchFn = opts?.fetchImpl ?? fetch
  const u = new URL(meta.treesUrl)
  if (!ALLOWED_API_HOSTS.has(u.hostname)) return null

  const res = await fetchFn(meta.treesUrl, {
    signal: opts?.signal,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Slipway-stack-detect",
    },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null)
  const { files, truncated } = pathsFromGithubTreesJson(json)
  if (files.length === 0) return null

  let packageJson: string | undefined
  if (files.some((f) => f === "package.json" || f.endsWith("/package.json"))) {
    const pkgPath = files.includes("package.json")
      ? "package.json"
      : files.find((f) => f.endsWith("/package.json")) || "package.json"
    // Only fetch root package.json for detection (bounded size).
    if (pkgPath === "package.json") {
      const rawUrl = githubRawFileUrl(meta.owner, meta.repo, meta.ref, pkgPath)
      const rawHost = new URL(rawUrl).hostname
      if (rawHost === "raw.githubusercontent.com") {
        const pr = await fetchFn(rawUrl, {
          signal: opts?.signal,
          headers: { "User-Agent": "Slipway-stack-detect" },
        }).catch(() => null)
        if (pr?.ok) {
          const text = await pr.text()
          if (text.length <= 200_000) packageJson = text
        }
      }
    }
  }

  return {
    files,
    packageJson,
    truncated,
    owner: meta.owner,
    repo: meta.repo,
    ref: meta.ref,
  }
}
