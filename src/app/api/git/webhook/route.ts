import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { deployProject } from "@/lib/ops"
import { FF } from "@/lib/feature-flags"
import {
  classifyPushChanges,
  routeServicesByChanges,
  unionCommitFiles,
  shouldSkipMonorepoRebuild,
} from "@/lib/changed-files"

export const dynamic = "force-dynamic"

/**
 * POST /api/git/webhook — push-to-deploy with smart monorepo skip (OpenShip P4).
 *
 * Accepts a simplified push payload (GitHub-compatible subset):
 *   { projectId, forced?, head_commit?: { message }, commits?: [...],
 *     changedPaths?: string[], truncated?: boolean }
 *
 * Behind SLIPWAY_FF_SMART_MONOREPO. Does not fetch GitHub (no SSRF); the
 * caller/CI supplies the file list. Signature verification can be added when
 * an inbound GitHub App is wired — today this is an authenticated API route
 * (session or Bearer with deploy scope).
 */
export const POST = route(async (req, _params, auth) => {
  if (!FF.smartMonorepo()) {
    return new Response(
      JSON.stringify({ error: "Smart monorepo deploy is disabled (SLIPWAY_FF_SMART_MONOREPO=0)." }),
      { status: 404 }
    )
  }
  const body = await req.json().catch(() => ({}))
  const projectId = String(body.projectId || "")
  if (!projectId) {
    return new Response(JSON.stringify({ error: "projectId required" }), { status: 400 })
  }
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }
  if (!project.autoDeploy) {
    return new Response(
      JSON.stringify({
        skipped: true,
        reason: "autoDeploy is off for this project",
      }),
      { status: 200 }
    )
  }

  const commits = Array.isArray(body.commits) ? body.commits : []
  const fromCommits = unionCommitFiles(commits)
  const explicit = Array.isArray(body.changedPaths)
    ? body.changedPaths.map(String).slice(0, 2000)
    : []
  const files = new Set<string>([...fromCommits, ...explicit])
  const classified = classifyPushChanges({
    files,
    forced: Boolean(body.forced),
    headMessage: body.head_commit?.message || body.commitMessage,
    truncated: Boolean(body.truncated),
    isMonorepo: project.monorepo,
  })

  if (
    project.monorepo &&
    project.monorepoPath &&
    !classified.forceAll &&
    files.size > 0
  ) {
    const skip = shouldSkipMonorepoRebuild({
      monorepoPath: project.monorepoPath,
      files,
      forceAll: classified.forceAll,
    })
    if (skip.skip) {
      return {
        skipped: true,
        reason: skip.reason,
        forceAll: false,
        changedPaths: [...files].slice(0, 100),
      }
    }
  }

  // Multi-service hint (compose/monorepo service rows) — Slipway still deploys
  // one app container today; we record the classification for the deploy row.
  const services = await db.service.findMany({
    where: { projectId },
    select: { id: true, name: true },
  })
  const routed = routeServicesByChanges(
    services.map((s) => ({
      id: s.id,
      rootDirectory: project.monorepoPath || null,
    })),
    files
  )

  const deploymentId = await deployProject(
    projectId,
    {
      branch: String(body.branch || body.ref?.replace(/^refs\/heads\//, "") || "main"),
      commitMessage:
        body.head_commit?.message ||
        body.commitMessage ||
        `Push deploy (${classified.reason || "webhook"})`,
      commitSha: body.after || body.commitSha,
      changedPaths: [...files],
      forceAll: classified.forceAll || routed.mode === "all",
      changedPathsTruncated: classified.truncated,
    },
    auth.username
  )

  return {
    deploymentId,
    forceAll: classified.forceAll,
    reason: classified.reason,
    routed,
    changedPaths: [...files].slice(0, 100),
  }
}, { action: "deploy" })
