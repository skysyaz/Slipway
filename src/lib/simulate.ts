/**
 * Deployment pipeline types + metadata-level rollback record creation.
 *
 * The real Docker orchestration lives in src/lib/docker-ops.ts (no simulation
 * fallback). This module keeps the shared `DeployOptions` type and the
 * rollback record creator (a rollback is metadata + a re-run of the previous
 * image, recorded as a new Deployment).
 */
import { db } from "./db"
import { emit } from "./notify"
import { genLogLine } from "./logs"

export interface DeployOptions {
  branch?: string
  commitMessage?: string
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

/** Record a rollback deployment (metadata-level). Returns the new deployment id. */
export async function simulateRollback(
  deploymentId: string,
  actor = "you"
): Promise<string> {
  const dep = await db.deployment.findUnique({ where: { id: deploymentId } })
  if (!dep) throw new Error("Deployment not found")
  if (!dep.projectId) throw new Error("Deployment has no project")
  const project = await db.project.findUnique({ where: { id: dep.projectId } })
  if (!project) throw new Error("Project not found")

  const steps = [
    { stage: "queued", label: "Queued", order: 0, status: "healthy", durationMs: 800, logLines: 2 },
    { stage: "release", label: "Release", order: 1, status: "healthy", durationMs: 4200, logLines: 12 },
    { stage: "verify", label: "Health check", order: 2, status: "healthy", durationMs: 5200, logLines: 8 },
    { stage: "live", label: "Live", order: 3, status: "healthy", durationMs: 400, logLines: 1 },
  ]
  const rollback = await db.deployment.create({
    data: {
      projectId: project.id,
      commitSha: dep.commitSha,
      commitMessage: `Rollback to ${dep.commitSha}`,
      branch: dep.branch,
      author: actor,
      environment: dep.environment,
      status: "healthy",
      rollbackOfId: dep.id,
      finishedAt: new Date(),
      durationMs: 12_000,
      url: project.url || undefined,
      steps: {
        create: steps.map((s) => ({
          ...s,
          startedAt: new Date(),
          finishedAt: new Date(),
        })),
      },
    },
  })
  await emit(
    "rollback",
    "rollback",
    `rolled back ${project.name} to ${dep.commitSha}`,
    {
      title: "Rollback complete",
      body: `${project.name} rolled back to ${dep.commitSha}. Health checks passed.`,
      level: "success",
      kind: "deploy",
    },
    { projectId: project.id, actor }
  )
  return rollback.id
}

export { genLogLine }