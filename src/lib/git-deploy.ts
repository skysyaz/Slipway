/**
 * Pure helpers for deploying from a public git repository.
 *
 * Dependency-free so scripts/selfcheck-host-health.ts can cover URL
 * normalisation and Dockerfile generation without a Docker socket or a
 * network. The docker-ops pipeline owns clone/build I/O.
 */

export type DetectedStack =
  | "dockerfile"
  | "compose"
  | "nextjs"
  | "node"
  | "python"
  | "go"
  | "rust"
  | "static"
  | "unknown"

export interface NormalizedGitSource {
  /** https clone URL ending in .git */
  cloneUrl: string
  /** host, e.g. github.com */
  host: string
  owner: string
  repo: string
  branch: string
  /** optional monorepo subdir inside the repo */
  subdir: string
  /**
   * Context URL the Docker daemon can clone itself
   * (`https://github.com/o/r.git#branch` or `#branch:subdir`).
   */
  dockerGitUrl: string
}

/**
 * Turn the free-form strings the dashboard accepts into a real git URL.
 *
 * Accepts:
 *   github.com/org/repo
 *   https://github.com/org/repo
 *   https://github.com/org/repo.git
 *   https://github.com/org/repo/tree/main/apps/web
 *   git@github.com:org/repo.git
 *   gitlab.com/…, bitbucket.org/… (same shapes)
 */
export function normalizeGitSource(
  input: string,
  branch = "main",
  subdir = ""
): NormalizedGitSource | null {
  let raw = String(input || "").trim()
  if (!raw) return null

  // git@host:owner/repo(.git)
  const ssh = raw.match(/^git@([^:]+):(.+)$/i)
  if (ssh) {
    raw = `https://${ssh[1]}/${ssh[2]}`
  }

  // bare github.com/org/repo → https
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const host = url.hostname.toLowerCase()
  // strip leading/trailing slashes; drop .git for path parsing
  let path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "")
  if (!path) return null

  // GitHub/GitLab tree URLs: owner/repo/tree/<branch>/<subdir…>
  let resolvedBranch = branch || "main"
  let resolvedSubdir = subdir.replace(/^\/+|\/+$/g, "")
  const tree = path.match(/^([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?$/i)
  if (tree) {
    path = `${tree[1]}/${tree[2]}`
    resolvedBranch = decodeURIComponent(tree[3]) || resolvedBranch
    if (tree[4] && !resolvedSubdir) resolvedSubdir = tree[4]
  }

  const parts = path.split("/").filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1]
  // any leftover path after owner/repo is treated as subdir when not a /tree/ URL
  if (parts.length > 2 && !resolvedSubdir && !tree) {
    // ignore blob/tree/commit noise; only keep a clean subdir when it doesn't look like a UI path
    const rest = parts.slice(2)
    if (rest[0] !== "blob" && rest[0] !== "tree" && rest[0] !== "commit" && rest[0] !== "pulls") {
      resolvedSubdir = rest.join("/")
    }
  }

  const cloneUrl = `https://${host}/${owner}/${repo}.git`
  const ref = resolvedBranch || "main"
  const dockerGitUrl = resolvedSubdir
    ? `${cloneUrl}#${ref}:${resolvedSubdir}`
    : `${cloneUrl}#${ref}`

  return {
    cloneUrl,
    host,
    owner,
    repo,
    branch: ref,
    subdir: resolvedSubdir,
    dockerGitUrl,
  }
}

/** File basenames (or relative paths) present in a checkout. */
export function detectStackFromFiles(files: string[]): DetectedStack {
  const set = new Set(files.map((f) => f.replace(/^\.\//, "").toLowerCase()))
  const has = (name: string) => set.has(name.toLowerCase())
  const hasPrefix = (prefix: string) =>
    [...set].some((f) => f === prefix.toLowerCase() || f.startsWith(prefix.toLowerCase() + "/"))

  if (has("dockerfile") || has("dockerfile.prod") || has("dockerfile.production")) return "dockerfile"
  if (has("compose.yaml") || has("compose.yml") || has("docker-compose.yml") || has("docker-compose.yaml")) {
    return "compose"
  }
  if (has("package.json")) {
    // next detection needs package.json contents — callers can refine; default node
    return "node"
  }
  if (has("requirements.txt") || has("pyproject.toml") || has("pipfile")) return "python"
  if (has("go.mod")) return "go"
  if (has("cargo.toml")) return "rust"
  if (has("index.html") || hasPrefix("public")) return "static"
  return "unknown"
}

/** Refine node → nextjs when package.json text mentions next. */
export function refineNodeStack(packageJsonText: string | null | undefined): DetectedStack {
  if (!packageJsonText) return "node"
  try {
    const pkg = JSON.parse(packageJsonText) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    if (all.next) return "nextjs"
  } catch {
    if (/\b"next"\s*:/.test(packageJsonText)) return "nextjs"
  }
  return "node"
}

export function findDockerfile(files: string[]): string | null {
  const names = ["Dockerfile", "dockerfile", "Dockerfile.prod", "Dockerfile.production"]
  const map = new Map(files.map((f) => [f.replace(/^\.\//, "").toLowerCase(), f]))
  for (const n of names) {
    const hit = map.get(n.toLowerCase())
    if (hit) return hit
  }
  return null
}

export interface GenerateDockerfileOpts {
  stack: DetectedStack
  buildCmd?: string | null
  startCmd?: string | null
  /** default listen port written as EXPOSE */
  port?: number
}

/**
 * Generate a Dockerfile when the repo doesn't ship one. Kept intentionally
 * small and honest — covers the common public-repo shapes Slipway claims to
 * deploy, and refuses exotic stacks so we don't fake a working image.
 */
export function generateDockerfile(opts: GenerateDockerfileOpts): string | null {
  const port = opts.port && opts.port > 0 ? opts.port : defaultPortFor(opts.stack)
  const buildCmd = (opts.buildCmd || "").trim()
  const startCmd = (opts.startCmd || "").trim()

  switch (opts.stack) {
    case "nextjs": {
      const build = buildCmd || "npm run build"
      const start = startCmd || "npm run start"
      return `# Generated by Slipway — Next.js
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* bun.lock* bun.lockb* ./
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
    elif [ -f bun.lockb ] || [ -f bun.lock ]; then npm i -g bun && bun install --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    else npm install; fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN ${shellJoin(build)}

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=${port}
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app ./
EXPOSE ${port}
CMD ${jsonCmd(start)}
`
    }
    case "node": {
      const build = buildCmd
      const start = startCmd || "npm start"
      return `# Generated by Slipway — Node.js
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* bun.lock* bun.lockb* ./
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
    elif [ -f bun.lockb ] || [ -f bun.lock ]; then npm i -g bun && bun install --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    else npm install; fi
COPY . .
${build ? `RUN ${shellJoin(build)}` : "# no build command"}
ENV NODE_ENV=production
ENV PORT=${port}
EXPOSE ${port}
CMD ${jsonCmd(start)}
`
    }
    case "python": {
      const start = startCmd || "python -m http.server 8000"
      return `# Generated by Slipway — Python
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* pyproject.toml* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; fi
COPY . .
EXPOSE ${port}
CMD ${jsonCmd(start)}
`
    }
    case "go": {
      const start = startCmd || "./app"
      return `# Generated by Slipway — Go
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN mkdir -p /out && ${shellJoin(buildCmd || "CGO_ENABLED=0 go build -o /out/app .")}

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/app /app/app
EXPOSE ${port}
CMD ${jsonCmd(start === "./app" ? "/app/app" : start)}
`
    }
    case "rust": {
      // Cargo package name varies — without a Dockerfile we can't know the
      // binary name reliably. Refuse rather than guess wrong.
      return null
    }
    case "static": {
      return `# Generated by Slipway — static site
FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`
    }
    case "dockerfile":
    case "compose":
      return null
    default:
      return null
  }
}

export function defaultPortFor(stack: DetectedStack): number {
  switch (stack) {
    case "static":
      return 80
    case "python":
      return 8000
    case "go":
    case "rust":
      return 8080
    default:
      return 3000
  }
}

/** Parse the first EXPOSE port from a Dockerfile (best-effort). */
export function parseExposePort(dockerfile: string): number | null {
  const m = dockerfile.match(/^\s*EXPOSE\s+(\d+)/im)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function shellJoin(cmd: string): string {
  // Dockerfile RUN takes a shell form; escape only what would break the line.
  return cmd.replace(/\r?\n/g, " && ")
}

function jsonCmd(cmd: string): string {
  // Prefer JSON-form CMD via sh -c so user start commands with flags work.
  const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `["sh", "-c", "${escaped}"]`
}
