/**
 * Build-context preparation: turn a project's source into a directory that
 * `docker build` can consume.
 *
 * Deliberately free of dockerode and Prisma imports — cloning a repository and
 * working out how to build it has nothing to do with the Docker daemon, and
 * keeping them apart means the self-check can exercise this against real
 * repositories without a socket or a database.
 */
import fs from "node:fs"
import path from "node:path"
import { parseGitSource } from "./git-source"
import { detectStack, type Detection, type DetectionInput } from "./stack-detect"

export type { Detection }

/** Root for build workspaces. Lives on the persistent data volume in production. */
export function buildRoot(): string {
  const base = process.env.SLIPWAY_DATA_DIR?.trim() || path.join(process.cwd(), ".slipway")
  return path.join(base, "builds")
}

/**
 * Shallow-clone a public repository into a per-deployment workspace.
 *
 * Shallow (`--depth 1`) because a deploy only needs the tip, and a full clone
 * of a large repo is minutes of pointless I/O. `--branch` is only passed when
 * the caller actually asked for a ref, so the provider's default branch is used
 * otherwise — hardcoding "main" breaks every repo still on "master".
 */
export async function cloneRepo(
  repoUrl: string,
  branch: string | undefined,
  deploymentId: string
): Promise<{
  workspace: string
  contextPath: string
  commitSha: string
  commitMessage: string
  branch: string
  log: string
}> {
  const src = parseGitSource(repoUrl)
  if (!src) {
    throw new Error(
      `"${repoUrl}" doesn't look like a Git repository. Use a URL such as https://github.com/owner/repo.`
    )
  }

  const workspace = path.join(buildRoot(), deploymentId)
  await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {})
  await fs.promises.mkdir(workspace, { recursive: true })

  const ref = branch?.trim() || src.ref
  const args = ["clone", "--depth", "1", "--single-branch"]
  if (ref) args.push("--branch", ref)
  args.push(src.cloneUrl, workspace)

  const lines: string[] = [`Cloning ${src.slug}${ref ? ` (${ref})` : " (default branch)"}…`]
  try {
    await runGit(args)
  } catch (e) {
    const msg = (e as Error).message
    // A bad ref is the most common cause; retry on the default branch so a
    // stale "main" default doesn't block a repo whose branch is "master".
    if (ref && /not found in upstream origin|Remote branch .* not found/i.test(msg)) {
      lines.push(`Branch "${ref}" not found — falling back to the default branch.`)
      await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {})
      await fs.promises.mkdir(workspace, { recursive: true })
      await runGit(["clone", "--depth", "1", src.cloneUrl, workspace])
    } else if (
      // ponytail: GitHub answers 404 for a private repo AND for one that does
      // not exist, and git reports that as a credential prompt ("could not read
      // Password for ..."). We genuinely cannot tell the two apart, so say both
      // rather than asserting one — a wrong diagnosis sends people hunting the
      // wrong problem.
      /Authentication failed|could not read (Username|Password)|Permission denied|terminal prompts disabled|Invalid username or password/i.test(
        msg
      ) ||
      /not found|does not exist|Repository not found/i.test(msg)
    ) {
      throw new Error(
        `Cannot clone ${src.slug}: the repository either doesn't exist or is private. Slipway holds no credentials for ${src.host}, so only public repositories can be cloned. Check the URL, or deploy from a prebuilt image instead.`
      )
    } else {
      throw new Error(`git clone failed: ${msg}`)
    }
  }

  // The exact commit that was built — a real SHA, replacing the random hex
  // string deployments used to be stamped with.
  const commitSha = await runGit(["-C", workspace, "rev-parse", "HEAD"])
    .then((r) => r.stdout.trim())
    .catch(() => "")
  const commitMessage = await runGit(["-C", workspace, "log", "-1", "--pretty=%s"])
    .then((r) => r.stdout.trim())
    .catch(() => "")
  // Whatever branch we actually landed on — which may not be what was asked for
  // if the requested ref was missing and we fell back to the default.
  const resolvedBranch = await runGit(["-C", workspace, "rev-parse", "--abbrev-ref", "HEAD"])
    .then((r) => r.stdout.trim())
    .catch(() => "")

  // A monorepo subdirectory can come from the URL or the project's setting.
  const contextPath = src.subdir ? path.join(workspace, src.subdir) : workspace
  if (!fs.existsSync(contextPath)) {
    throw new Error(`Subdirectory "${src.subdir}" does not exist in ${src.slug}.`)
  }
  if (commitSha) lines.push(`Checked out ${commitSha.slice(0, 7)}${commitMessage ? ` — ${commitMessage}` : ""}`)
  if (src.subdir) lines.push(`Building from subdirectory ${src.subdir}/`)

  return {
    workspace,
    contextPath,
    commitSha,
    commitMessage,
    branch: resolvedBranch,
    log: lines.join("\n"),
  }
}

/** Run `git` and capture output; rejects with stderr so callers can classify. */
export async function runGit(
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import("node:child_process")
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        maxBuffer: 8 * 1024 * 1024,
        // ponytail: a deploy runs with no terminal, so git MUST NOT try to ask
        // for credentials. Against a private or non-existent repository (GitHub
        // returns 404 for both) it otherwise blocks on "Password for ...:" and
        // the deploy hangs until something kills it. These three make git fail
        // immediately instead, which is what turns into an honest error.
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          GCM_INTERACTIVE: "never",
        },
        // A clone that is merely slow is fine; one that never finishes is not.
        timeout: opts.timeoutMs ?? 300_000,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || "").trim()
          // ENOENT here means the image is missing the git binary entirely.
          if (/ENOENT/.test(err.message) && /spawn git/.test(err.message)) {
            reject(new Error("the `git` CLI is not installed in the Slipway container, so repositories can't be cloned"))
            return
          }
          if ((err as NodeJS.ErrnoException).code === "ETIMEDOUT" || /killed/i.test(String((err as { signal?: string }).signal))) {
            reject(new Error("git timed out — the repository is unreachable or too large to clone in time"))
            return
          }
          reject(new Error(detail || err.message))
        } else {
          resolve({ stdout: stdout || "", stderr: stderr || "" })
        }
      }
    )
  })
}

/** Detection plus the name of any Dockerfile Slipway generated for the build. */
export type ContextDetection = Detection & { generatedDockerfileName?: string }

/**
 * Inspect a checked-out context, decide how to build it, and write a generated
 * Dockerfile when the repository doesn't ship one.
 *
 * The generated file is named `Dockerfile.slipway` and passed with `-f`, so a
 * repo that later adds its own Dockerfile is never overwritten and the working
 * tree we hand to `docker build` stays faithful to what was cloned.
 */
export async function detectContext(contextPath: string): Promise<ContextDetection> {
  const entries = await fs.promises.readdir(contextPath).catch(() => [] as string[])
  let packageJson: DetectionInput["packageJson"] = null
  if (entries.some((f) => f.toLowerCase() === "package.json")) {
    try {
      packageJson = JSON.parse(await fs.promises.readFile(path.join(contextPath, "package.json"), "utf8"))
    } catch {
      packageJson = null // malformed package.json — fall through to file-based detection
    }
  }

  const detected = detectStack({ files: entries, packageJson })
  if (!detected) {
    throw new Error(
      `Slipway couldn't work out how to build this repository. It has no Dockerfile and none of the markers it recognises (package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, Gemfile, composer.json, index.html). Add a Dockerfile to the repo and redeploy.`
    )
  }
  if (!detected.dockerfile) return detected // repo ships its own

  const name = "Dockerfile.slipway"
  await fs.promises.writeFile(path.join(contextPath, name), detected.dockerfile, "utf8")
  return { ...detected, generatedDockerfileName: name }
}

/** Remove a build workspace. Best-effort — never fails a deploy. */
export async function cleanupWorkspace(workspace: string | null): Promise<void> {
  if (!workspace) return
  await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {})
}

