import { route } from "@/lib/http"
import { FF } from "@/lib/feature-flags"
import { detectStackDetailed, stackAutofill } from "@/lib/stack-detect"
import { validateWebhookUrl } from "@/lib/security"
import { fetchPublicGithubTree } from "@/lib/github-tree"

export const dynamic = "force-dynamic"

/**
 * POST /api/projects/detect — zero-config stack autofill (OpenShip P2).
 *
 * Body:
 *   { files?: string[], fileContents?: Record<string,string>,
 *     repoUrl?: string, branch?: string }
 *
 * When `files` is empty and `repoUrl` is a public github.com repo, Slipway
 * fetches the tree from api.github.com (host allowlist only — R5).
 */
export const POST = route(async (req) => {
  if (!FF.stackDetect()) {
    return new Response(
      JSON.stringify({ error: "Stack detect is disabled (SLIPWAY_FF_STACK_DETECT=0)." }),
      { status: 404 }
    )
  }
  const body = await req.json().catch(() => ({}))
  let files = Array.isArray(body.files) ? body.files.map(String).slice(0, 2000) : []
  const fileContents: Record<string, string> = {}
  if (body.fileContents && typeof body.fileContents === "object") {
    for (const [k, v] of Object.entries(body.fileContents as Record<string, unknown>)) {
      if (typeof v === "string" && v.length <= 200_000) fileContents[k] = v
    }
  }

  let treeMeta: { owner: string; repo: string; ref: string; truncated: boolean } | undefined

  if (files.length === 0 && body.repoUrl) {
    const check = validateWebhookUrl(String(body.repoUrl).startsWith("http")
      ? String(body.repoUrl)
      : `https://${String(body.repoUrl).replace(/^\/+/, "")}`)
    if (!check.ok) {
      return new Response(JSON.stringify({ error: `repoUrl refused: ${check.reason}` }), {
        status: 400,
      })
    }
    const tree = await fetchPublicGithubTree(String(body.repoUrl), String(body.branch || "main"), {
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null)
    if (!tree) {
      return new Response(
        JSON.stringify({
          error:
            "Could not list that repository. Use a public github.com URL, or pass files[] yourself (private repos aren't fetched).",
        }),
        { status: 422 }
      )
    }
    files = tree.files
    if (tree.packageJson) fileContents["package.json"] = tree.packageJson
    treeMeta = {
      owner: tree.owner,
      repo: tree.repo,
      ref: tree.ref,
      truncated: tree.truncated,
    }
  }

  if (files.length === 0) {
    // Compose / folder shortcuts when the operator didn't supply a listing yet.
    if (body.source === "compose" || body.composePath) {
      files = ["docker-compose.yml"]
    } else if (body.source === "folder") {
      return new Response(
        JSON.stringify({
          error:
            "Folder detect needs a files[] listing from the server path (or deploy and let the pipeline detect on checkout).",
        }),
        { status: 400 }
      )
    } else {
      return new Response(
        JSON.stringify({ error: "files[] or a public github.com repoUrl is required" }),
        { status: 400 }
      )
    }
  }

  const detailed = detectStackDetailed({ files, fileContents })
  return {
    ...stackAutofill(detailed),
    confidence: detailed.confidence,
    fileCount: files.length,
    ...(treeMeta ? { tree: treeMeta } : {}),
  }
}, { action: "deploy" })
