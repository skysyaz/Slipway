import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { recordActivity } from "@/lib/notify"
import { normalizeGitSource } from "@/lib/git-deploy"

export const dynamic = "force-dynamic"

const INCLUDE = {
  services: true,
  domains: true,
  envVars: true,
} as const

export const GET = route(async () => {
  const projects = await db.project.findMany({
    include: INCLUDE,
    orderBy: { createdAt: "asc" },
  })
  return projects.map(serializeProject)
})

export const POST = route(async (req) => {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || "new-project")
  const slugBase = String(body.slug || slugify(name))
  let slug = slugBase
  let n = 1
  while (await db.project.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${n++}`
  }
  const source = String(body.source || "image")
  // Normalise free-form dashboard input (`github.com/org/repo`) into a real
  // https URL so redeploys and the pipeline always see the same shape.
  let repoUrl: string | null = body.repoUrl != null ? String(body.repoUrl) : null
  if (source === "git" && repoUrl) {
    const git = normalizeGitSource(repoUrl, String(body.branch || "main"))
    if (!git) {
      return new Response(
        JSON.stringify({
          error: `Not a usable git URL: "${repoUrl}". Use github.com/org/repo or a full https:// URL.`,
        }),
        { status: 400 }
      )
    }
    repoUrl = `https://${git.host}/${git.owner}/${git.repo}`
  }
  const project = await db.project.create({
    data: {
      name,
      slug,
      source,
      repoUrl,
      folderPath: body.folderPath ?? null,
      composePath: body.composePath ?? null,
      stack: String(body.stack || "dockerfile"),
      stackLabel: String(body.stackLabel || body.stack || "Docker"),
      framework: body.framework ?? null,
      environment: String(body.environment || "production"),
      status: "stopped",
      region: String(body.region || "local"),
      memoryMb: Number(body.memoryMb || 512),
      cpuMilli: Number(body.cpuMilli || 400),
      replicas: Number(body.replicas || 1),
      dockerImage: body.dockerImage ?? body.image ?? null,
      buildCmd: body.buildCmd ?? null,
      startCmd: body.startCmd ?? null,
    },
    include: INCLUDE,
  })
  await recordActivity("deploy", `created project ${name}`)
  return serializeProject(project)
})

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project"
}