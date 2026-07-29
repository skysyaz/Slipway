/**
 * Git source URL parsing — pure and dependency-free so the self-check can
 * cover it without a network or a git binary.
 *
 * People paste whatever the provider showed them: the address bar
 * (`https://github.com/owner/repo`), the clone box (`…/repo.git`), a deep link
 * to a branch (`…/tree/main/apps/web`), an SSH remote
 * (`git@github.com:owner/repo.git`), or just `owner/repo`. All of those name
 * the same repository, and the deploy pipeline needs one canonical clone URL
 * plus the ref and subdirectory they imply.
 */

export interface GitSource {
  /** URL to hand to `git clone`. */
  cloneUrl: string
  /** Branch/tag/commit the user pointed at, when the URL carried one. */
  ref?: string
  /** Path inside the repo to build from, when the URL carried one. */
  subdir?: string
  host: string
  owner: string
  repo: string
  /** `owner/repo`, for display. */
  slug: string
}

/** Strip a trailing `.git` and any surrounding whitespace or slashes. */
function cleanRepoName(s: string): string {
  return s.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "")
}

/**
 * Parse any common Git remote form into a canonical clone URL plus the ref and
 * subdirectory it implies. Returns null when the input isn't a usable Git
 * source, so the caller can fail with a clear message instead of shelling out
 * to `git clone` and surfacing its error.
 */
export function parseGitSource(input: string): GitSource | null {
  let raw = String(input ?? "").trim()
  if (!raw) return null

  // `#ref` fragment is the Docker convention and people carry it over.
  let fragment = ""
  const hash = raw.indexOf("#")
  if (hash !== -1) {
    fragment = raw.slice(hash + 1)
    raw = raw.slice(0, hash)
  }

  let host = ""
  let path = ""

  const scp = raw.match(/^(?:ssh:\/\/)?(?:([^@/]+)@)?([^/:]+):(.+)$/)
  const url = raw.match(/^(https?|git|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i)

  if (url) {
    host = url[2]
    path = url[3]
  } else if (scp && !/^https?$/i.test(scp[2])) {
    // git@github.com:owner/repo.git
    host = scp[2]
    path = scp[3]
  } else if (/^[\w.-]+\.[a-z]{2,}\//i.test(raw)) {
    // github.com/owner/repo (no scheme)
    const i = raw.indexOf("/")
    host = raw.slice(0, i)
    path = raw.slice(i + 1)
  } else if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    // bare `owner/repo` shorthand — GitHub is the only sensible default
    host = "github.com"
    path = raw
  } else {
    return null
  }

  host = host.replace(/:\d+$/, "") // drop any port for display purposes
  const segments = cleanRepoName(path).split("/").filter(Boolean)
  if (segments.length < 2) return null

  const owner = segments[0]
  const repo = cleanRepoName(segments[1])
  if (!owner || !repo) return null

  // /tree/<ref>/<subdir…> and /blob/<ref>/<subdir…> are web-UI deep links
  let ref = fragment || undefined
  let subdir: string | undefined
  const rest = segments.slice(2)
  if (rest.length && (rest[0] === "tree" || rest[0] === "blob" || rest[0] === "src")) {
    if (rest[1]) ref = ref || rest[1]
    const sub = rest.slice(2).join("/")
    if (sub) subdir = sub
  } else if (rest.length) {
    // …/repo/apps/web — treat the tail as a subdirectory
    subdir = rest.join("/")
  }

  // A `#ref:subdir` fragment (Docker's own syntax) also carries a directory.
  if (fragment.includes(":")) {
    const [r, s] = fragment.split(":")
    ref = r || undefined
    if (s) subdir = s
  }

  return {
    cloneUrl: `https://${host}/${owner}/${repo}.git`,
    ref,
    subdir,
    host,
    owner,
    repo,
    slug: `${owner}/${repo}`,
  }
}

/**
 * Is this a source Slipway can clone without credentials? Only https to a
 * known public host; anything else needs auth Slipway doesn't hold, and saying
 * so up front beats a confusing `git clone` failure.
 */
export function isLikelyPublicHost(host: string): boolean {
  return /^(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|git\.sr\.ht)$/i.test(host)
}

/**
 * Canonical, round-trippable form of a parsed source.
 *
 * The clone URL alone loses the ref and subdirectory a deep link carried, so a
 * pasted `…/tree/dev/apps/api` would silently build the default branch at the
 * repo root. Those are preserved as a `#ref:subdir` fragment — Docker's own
 * convention, and exactly what parseGitSource() reads back.
 */
export function canonicalGitUrl(src: GitSource): string {
  if (!src.ref && !src.subdir) return src.cloneUrl
  const fragment = src.subdir ? `${src.ref ?? ""}:${src.subdir}` : String(src.ref)
  return `${src.cloneUrl}#${fragment}`
}
