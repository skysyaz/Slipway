import { route } from "@/lib/http"
import { FF } from "@/lib/feature-flags"
import { detectStackDetailed, stackAutofill } from "@/lib/stack-detect"
import { validateWebhookUrl } from "@/lib/security"

export const dynamic = "force-dynamic"

/**
 * POST /api/projects/detect — zero-config stack autofill (OpenShip P2).
 *
 * Body: { files: string[], fileContents?: Record<string,string> }
 * Optionally { repoUrl } is accepted for future tree fetch — today we only
 * analyze the supplied listing (no server-side git fetch) to stay SSRF-safe.
 *
 * Behind SLIPWAY_FF_STACK_DETECT (default on; set to 0 to disable).
 */
export const POST = route(async (req) => {
  if (!FF.stackDetect()) {
    return new Response(
      JSON.stringify({ error: "Stack detect is disabled (SLIPWAY_FF_STACK_DETECT=0)." }),
      { status: 404 }
    )
  }
  const body = await req.json().catch(() => ({}))
  const files = Array.isArray(body.files) ? body.files.map(String).slice(0, 2000) : []
  if (files.length === 0) {
    return new Response(JSON.stringify({ error: "files[] required (repo file listing)" }), {
      status: 400,
    })
  }
  // Refuse accidental URL passthrough — detection is local to the provided tree.
  if (body.repoUrl) {
    const check = validateWebhookUrl(String(body.repoUrl))
    if (!check.ok) {
      return new Response(JSON.stringify({ error: `repoUrl refused: ${check.reason}` }), {
        status: 400,
      })
    }
    // We still do not fetch — operator must supply files. Honest about the ceiling.
  }
  const fileContents =
    body.fileContents && typeof body.fileContents === "object"
      ? (body.fileContents as Record<string, string>)
      : undefined
  // Cap content size to avoid DoS via huge package.json pastes.
  const capped: Record<string, string> = {}
  if (fileContents) {
    for (const [k, v] of Object.entries(fileContents)) {
      if (typeof v === "string" && v.length <= 200_000) capped[k] = v
    }
  }
  const detailed = detectStackDetailed({ files, fileContents: capped })
  return { ...stackAutofill(detailed), confidence: detailed.confidence }
}, { action: "deploy" })
