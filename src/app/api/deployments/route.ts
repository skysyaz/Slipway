import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeDeployment } from "@/lib/serialize"
import { deployProject } from "@/lib/ops"

export const dynamic = "force-dynamic"

export const GET = route(async (req) => {
  const url = new URL(req.url)
  const projectId = url.searchParams.get("projectId")
  const deployments = await db.deployment.findMany({
    where: projectId ? { projectId } : undefined,
    include: { steps: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  const projects = await db.project.findMany({ select: { id: true, name: true } })
  const nameById = new Map(projects.map((p) => [p.id, p.name]))
  return deployments.map((d) => serializeDeployment(d, d.projectId ? nameById.get(d.projectId) : undefined))
})

export const POST = route(async (req, _params, auth) => {
  const body = await req.json().catch(() => ({}))
  const projectId = String(body.projectId || "")
  if (!projectId) return new Response(JSON.stringify({ error: "projectId required" }), { status: 400 })
  const id = await deployProject(
    projectId,
    {
      branch: body.branch,
      commitMessage: body.commitMessage,
      source: body.source,
      repoUrl: body.repoUrl,
      folderPath: body.folderPath,
      composePath: body.composePath,
      environment: body.environment,
      stack: body.stack,
      domain: body.domain,
      ssl: body.ssl,
      buildCmd: body.buildCmd,
      startCmd: body.startCmd,
    },
    auth.username
  )
  return { ok: true, id }
})