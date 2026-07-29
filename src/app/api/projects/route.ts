import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"
import { recordActivity } from "@/lib/notify"
import { parseGitSource, canonicalGitUrl } from "@/lib/git-source"

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
  const project = await db.project.create({
    data: {
      name,
      slug,
      source: String(body.source || "image"),
      // canonicalise the repo URL on the way in, so "github.com/o/r",
      // "git@github.com:o/r.git" and the browser address bar all end up as the
      // same clone URL and the deploy pipeline never has to guess
      repoUrl: body.repoUrl ? ((() => { const g = parseGitSource(String(body.repoUrl)); return g ? canonicalGitUrl(g) : String(body.repoUrl) })()) : null,
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