import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { stopProject, removeProject, updateContainer } from "@/lib/ops"
import { recordActivity } from "@/lib/notify"
import { parseGitSource, canonicalGitUrl } from "@/lib/git-source"

export const dynamic = "force-dynamic"

const INCLUDE = {
  services: true,
  domains: true,
  envVars: true,
} as const

export const GET = route(async (_req, params) => {
  const project = await db.project.findUnique({
    where: { id: params.id },
    include: INCLUDE,
  })
  if (!project) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  return serializeProject(project)
})

export const PATCH = route(async (req, params, auth) => {
  const body = await req.json().catch(() => ({}))
  const existing = await db.project.findUnique({ where: { id: params.id } })
  if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

  const allowed: Array<keyof typeof existing> = [
    "name",
    "slug",
    "description",
    "autoDeploy",
    "requireTests",
    "autoRollback",
    "pauseDuringWindows",
    "prPreviews",
    "minReplicas",
    "maxReplicas",
    "memoryMb",
    "cpuMilli",
    "buildCmd",
    "startCmd",
    "dockerImage",
    "paused",
    // ponytail: the SOURCE fields were missing from this list, so a project's
    // repository could never be changed after creation — a project saved with
    // the wrong URL (or none) was permanently unbuildable with no way to fix it
    // from the UI or the API.
    "source",
    "repoUrl",
    "folderPath",
    "composePath",
  ]
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k]
  }
  // Validate a repository URL up front rather than letting the next deploy fail
  // at checkout with a git error.
  if (typeof data.repoUrl === "string" && data.repoUrl.trim()) {
    const parsed = parseGitSource(String(data.repoUrl))
    if (!parsed) {
      return new Response(
        JSON.stringify({
          error: `"${data.repoUrl}" isn't a Git repository URL. Use something like https://github.com/owner/repo.`,
        }),
        { status: 400 }
      )
    }
    // store the canonical clone URL so every later deploy agrees on it
    data.repoUrl = canonicalGitUrl(parsed)
  }

  if (data.slug && data.slug !== existing.slug) {
    if (await db.project.findUnique({ where: { slug: String(data.slug) } })) {
      return new Response(JSON.stringify({ error: "Slug already in use" }), { status: 409 })
    }
  }
  const project = await db.project.update({
    where: { id: params.id },
    data,
    include: INCLUDE,
  })
  // ponytail: apply resource-limit changes live via `docker update` when a real
  // container exists (non-destructive). Env/image/cmd changes need a recreate —
  // that's the explicit "Apply to container" action (POST /reconcile).
  if (data.memoryMb !== undefined || data.cpuMilli !== undefined) {
    await updateContainer(params.id, {
      ...(data.memoryMb !== undefined ? { memoryMb: Number(data.memoryMb) } : {}),
      ...(data.cpuMilli !== undefined ? { cpuMilli: Number(data.cpuMilli) } : {}),
    }, auth.username).catch((e) => console.error("[api] live update failed:", (e as Error).message))
  }
  await recordActivity("env", `updated settings on ${existing.name}`, {
    projectId: params.id,
    actor: auth.username,
  })
  return serializeProject(project)
})

export const DELETE = route(async (_req, params, auth) => {
  const existing = await db.project.findUnique({ where: { id: params.id } })
  if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  await removeProject(params.id, auth.username)
  return { ok: true }
})