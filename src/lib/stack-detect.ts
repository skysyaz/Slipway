/**
 * Copyright contributors of Openship (https://github.com/oblien/openship).
 * Licensed under the Apache License, Version 2.0.
 * Modifications © Slipway — adapted subset of Openship stack detection
 * (packages/core/src/stacks.ts + apps/api/src/lib/stack-detector.ts).
 * See THIRD-PARTY/NOTICES.
 *
 * Pure zero-config stack detection from a file listing + optional
 * package.json / manifest text. Dependency-free for the self-check harness.
 */

import type { DetectedStack } from "./git-deploy"

export interface StackDetectInput {
  /** Basenames or relative paths in the checkout / tree listing. */
  files: string[]
  /** Optional file contents keyed by basename (lowercase preferred). */
  fileContents?: Record<string, string>
}

export interface StackDetectResult {
  /** Coarse Slipway stack id used by Dockerfile generation. */
  stack: DetectedStack
  /** Finer framework label for the UI (e.g. "fastapi", "express"). */
  framework: string
  packageManager: string
  buildCommand: string
  startCommand: string
  port: number
  confidence: "high" | "medium" | "low"
}

function basenames(files: string[]): Set<string> {
  const set = new Set<string>()
  for (const f of files) {
    const norm = f.replace(/^\.\//, "").toLowerCase()
    set.add(norm)
    const base = norm.split("/").pop()
    if (base) set.add(base)
  }
  return set
}

function parseJson(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

function depsOf(pkg: Record<string, unknown> | null): Record<string, string> {
  if (!pkg) return {}
  const a = (pkg.dependencies as Record<string, string>) || {}
  const b = (pkg.devDependencies as Record<string, string>) || {}
  return { ...a, ...b }
}

function detectPackageManager(
  fileSet: Set<string>,
  pkg: Record<string, unknown> | null,
  contents?: Record<string, string>
): string {
  if (fileSet.has("go.mod")) return "go"
  if (fileSet.has("cargo.toml")) return "cargo"
  if (fileSet.has("pyproject.toml")) {
    const py = contents?.["pyproject.toml"] || contents?.["Pyproject.toml"]
    if (py && /\[tool\.poetry\]/.test(py)) return "poetry"
    return "uv"
  }
  if (fileSet.has("pipfile")) return "pipenv"
  if (fileSet.has("requirements.txt")) return "pip"
  if (fileSet.has("pnpm-lock.yaml")) return "pnpm"
  if (fileSet.has("bun.lockb") || fileSet.has("bun.lock")) return "bun"
  if (fileSet.has("package-lock.json")) return "npm"
  if (fileSet.has("yarn.lock")) return "yarn"
  const pm = typeof pkg?.packageManager === "string" ? pkg.packageManager : ""
  if (pm.startsWith("pnpm")) return "pnpm"
  if (pm.startsWith("yarn")) return "yarn"
  if (pm.startsWith("bun")) return "bun"
  if (pm.startsWith("npm")) return "npm"
  if (fileSet.has("package.json")) return "npm"
  return "unknown"
}

function contentGet(contents: Record<string, string> | undefined, name: string): string | undefined {
  if (!contents) return undefined
  if (contents[name]) return contents[name]
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(contents)) {
    if (k.toLowerCase() === lower || k.toLowerCase().endsWith("/" + lower)) return v
  }
  return undefined
}

/**
 * Rich stack detection. Prefer Dockerfile / compose when present; otherwise
 * inspect manifests. Returns autofill-ready build/start/port.
 */
export function detectStackDetailed(input: StackDetectInput): StackDetectResult {
  const fileSet = basenames(input.files)
  const contents = input.fileContents || {}
  const pkgText = contentGet(contents, "package.json")
  const pkg = parseJson(pkgText)
  const deps = depsOf(pkg)
  const scripts = (pkg?.scripts as Record<string, string>) || {}
  const pm = detectPackageManager(fileSet, pkg, contents)

  const run = (script: string) => {
    if (pm === "pnpm") return `pnpm run ${script}`
    if (pm === "yarn") return `yarn ${script}`
    if (pm === "bun") return `bun run ${script}`
    return `npm run ${script}`
  }

  // Dockerfile / compose win — Slipway builds those natively.
  if (
    fileSet.has("dockerfile") ||
    fileSet.has("dockerfile.prod") ||
    fileSet.has("dockerfile.production")
  ) {
    return {
      stack: "dockerfile",
      framework: "docker",
      packageManager: pm,
      buildCommand: "",
      startCommand: "",
      port: 3000,
      confidence: "high",
    }
  }
  if (
    fileSet.has("compose.yaml") ||
    fileSet.has("compose.yml") ||
    fileSet.has("docker-compose.yml") ||
    fileSet.has("docker-compose.yaml")
  ) {
    return {
      stack: "compose",
      framework: "compose",
      packageManager: pm,
      buildCommand: "",
      startCommand: "",
      port: 3000,
      confidence: "high",
    }
  }

  // JS / TS frameworks via deps
  if (fileSet.has("package.json")) {
    if (deps.next) {
      return {
        stack: "nextjs",
        framework: "nextjs",
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "npm run build",
        startCommand: scripts.start ? run("start") : "npm run start",
        port: 3000,
        confidence: "high",
      }
    }
    if (deps.nuxt || deps["nuxt3"]) {
      return {
        stack: "node",
        framework: "nuxt",
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "npm run build",
        startCommand: scripts.start ? run("start") : "node .output/server/index.mjs",
        port: 3000,
        confidence: "high",
      }
    }
    if (deps.astro) {
      return {
        stack: "node",
        framework: "astro",
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "npm run build",
        startCommand: scripts.start ? run("start") : "node ./dist/server/entry.mjs",
        port: 4321,
        confidence: "medium",
      }
    }
    if (deps["@nestjs/core"]) {
      return {
        stack: "node",
        framework: "nestjs",
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "npm run build",
        startCommand: scripts.start ? run("start") : "node dist/main.js",
        port: 3000,
        confidence: "high",
      }
    }
    if (deps.express || deps.fastify || deps.hono || deps.koa) {
      const fw = deps.express ? "express" : deps.fastify ? "fastify" : deps.hono ? "hono" : "koa"
      return {
        stack: "node",
        framework: fw,
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "",
        startCommand: scripts.start ? run("start") : "npm start",
        port: 3000,
        confidence: "medium",
      }
    }
    if (deps.vite || deps.vue || deps.react || deps["react-dom"]) {
      return {
        stack: "node",
        framework: deps.vite ? "vite" : deps.vue ? "vue" : "react",
        packageManager: pm,
        buildCommand: scripts.build ? run("build") : "npm run build",
        startCommand: scripts.start ? run("start") : "npm start",
        port: 3000,
        confidence: "medium",
      }
    }
    return {
      stack: "node",
      framework: "node",
      packageManager: pm,
      buildCommand: scripts.build ? run("build") : "",
      startCommand: scripts.start ? run("start") : "npm start",
      port: 3000,
      confidence: "medium",
    }
  }

  // Python
  if (fileSet.has("requirements.txt") || fileSet.has("pyproject.toml") || fileSet.has("pipfile")) {
    const req = contentGet(contents, "requirements.txt") || contentGet(contents, "pyproject.toml") || ""
    let framework = "python"
    let start = "python -m http.server 8000"
    let port = 8000
    if (/fastapi/i.test(req) || fileSet.has("main.py")) {
      if (/fastapi/i.test(req)) {
        framework = "fastapi"
        start = "uvicorn main:app --host 0.0.0.0 --port 8000"
      }
    }
    if (/django/i.test(req)) {
      framework = "django"
      start = "gunicorn myproject.wsgi:application --bind 0.0.0.0:8000"
    }
    if (/flask/i.test(req)) {
      framework = "flask"
      start = "gunicorn app:app --bind 0.0.0.0:8000"
    }
    return {
      stack: "python",
      framework,
      packageManager: pm === "unknown" ? "pip" : pm,
      buildCommand: "",
      startCommand: start,
      port,
      confidence: framework === "python" ? "medium" : "high",
    }
  }

  if (fileSet.has("go.mod")) {
    return {
      stack: "go",
      framework: "go",
      packageManager: "go",
      buildCommand: "CGO_ENABLED=0 go build -o /out/app .",
      startCommand: "./app",
      port: 8080,
      confidence: "high",
    }
  }

  if (fileSet.has("cargo.toml")) {
    return {
      stack: "rust",
      framework: "rust",
      packageManager: "cargo",
      buildCommand: "cargo build --release",
      startCommand: "",
      port: 8080,
      confidence: "medium",
    }
  }

  if (fileSet.has("index.html") || [...fileSet].some((f) => f === "public" || f.startsWith("public/"))) {
    return {
      stack: "static",
      framework: "static",
      packageManager: "none",
      buildCommand: "",
      startCommand: "",
      port: 80,
      confidence: "medium",
    }
  }

  return {
    stack: "unknown",
    framework: "unknown",
    packageManager: "unknown",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    confidence: "low",
  }
}

/**
 * Suggest autofill fields for the New-deploy form. Empty strings mean
 * "leave the operator field blank / use Dockerfile defaults".
 */
export function stackAutofill(result: StackDetectResult): {
  stack: DetectedStack
  framework: string
  buildCmd: string
  startCmd: string
  port: number
  packageManager: string
} {
  return {
    stack: result.stack,
    framework: result.framework,
    buildCmd: result.buildCommand,
    startCmd: result.startCommand,
    port: result.port,
    packageManager: result.packageManager,
  }
}
