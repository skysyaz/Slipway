import { route } from "@/lib/http"
import { db } from "@/lib/db"
import { serializeProject } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const INCLUDE = { services: true, domains: true, envVars: true } as const

export const PUT = route(async (req, params) => {
  const body = await req.json().catch(() => ({}))

  // ponytail: verify the variable actually belongs to THIS project before
  // touching it. The update was keyed on the env-var id alone, so
  // `PUT /api/projects/<a>/env-vars/<id-belonging-to-b>` happily rewrote
  // project B's variable — including its value — while reporting project A back
  // to the caller. The sibling DELETE already scoped by projectId; this didn't.
  const existing = await db.envVar.findUnique({ where: { id: params.eid } })
  if (!existing || existing.projectId !== params.id) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }

  // ponytail: unmasking without a replacement value used to flip `masked` to
  // false while keeping the stored secret, and serializeProject then returned
  // that secret in plaintext on the next GET/PUT response. A deploy-scoped
  // token could therefore harvest every masked env var with
  // `PUT {"masked":false}`. Require a new value whenever secrecy is lifted.
  if (body.masked === false && existing.masked && body.value === undefined) {
    return new Response(
      JSON.stringify({
        error:
          "Cannot unmask an env var without providing a new value — the stored secret is never returned over the API.",
      }),
      { status: 400 }
    )
  }

  const data = {
    ...(body.key !== undefined ? { key: String(body.key) } : {}),
    ...(body.value !== undefined ? { value: String(body.value) } : {}),
    ...(body.scope !== undefined ? { scope: String(body.scope) } : {}),
    ...(body.masked !== undefined ? { masked: Boolean(body.masked) } : {}),
  }

  // (projectId, key, scope) is unique. Renaming onto an existing pair is a
  // conflict, not a server error — report it as one instead of letting the raw
  // Prisma P2002 surface as a 500 with an unreadable message.
  const nextKey = data.key ?? existing.key
  const nextScope = data.scope ?? existing.scope
  if (nextKey !== existing.key || nextScope !== existing.scope) {
    const clash = await db.envVar.findFirst({
      where: { projectId: params.id, key: nextKey, scope: nextScope, id: { not: params.eid } },
    })
    if (clash) {
      return new Response(
        JSON.stringify({ error: `${nextKey} is already set for scope "${nextScope}" on this project.` }),
        { status: 409 }
      )
    }
  }

  await db.envVar.update({ where: { id: params.eid }, data })
  const project = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(project!)
})

export const DELETE = route(async (_req, params) => {
  const deleted = await db.envVar.deleteMany({ where: { id: params.eid, projectId: params.id } })
  if (deleted.count === 0) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }
  const project = await db.project.findUnique({ where: { id: params.id }, include: INCLUDE })
  return serializeProject(project!)
})
