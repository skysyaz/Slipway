import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeDeployment } from "@/lib/serialize"

export const dynamic = "force-dynamic"

export const GET = route(async (_req, params) => {
  const d = await db.deployment.findUnique({
    where: { id: params.id },
    include: { steps: true, project: { select: { name: true } } },
  })
  if (!d) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  return serializeDeployment(d, d.project.name)
})