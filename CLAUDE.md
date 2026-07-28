# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Slipway** is a self-hosted deployment platform (a minimal Coolify). It is a
single Next.js 16 process that:

- serves the web dashboard (App Router, client-rendered SPA shell at `/`),
- exposes a REST API under `/api/*`,
- persists to SQLite via Prisma,
- and orchestrates **real Docker containers** on the host via `dockerode` plus
  the `docker` CLI.

There is no separate backend service and no worker process. Everything —
including the cron scheduler — runs inside the Next.js server.

## The one rule that shapes the whole codebase: never fake success

This project deliberately has **no simulation fallback**. If the Docker engine
is unreachable or an operation fails:

- the deployment row is written with `status: "failed"` and the real error text,
- API routes return `503`/`500` with an honest message
  (e.g. `"Docker engine unavailable — cannot provision a real database."`),
- metrics series stay **empty** rather than showing synthetic data,
- metrics that require instrumentation Slipway doesn't do (requests/sec, p95
  latency) are reported as `0`, not invented.

`src/lib/ops.ts` is the operations façade and maps every op straight to the real
implementation in `src/lib/docker-ops.ts`. The only thing left in
`src/lib/simulate.ts` is the shared `DeployOptions` type — `simulateRollback`
(which wrote a "healthy" rollback record without touching Docker) and
`src/lib/logs.ts` (a synthetic log-line generator) have both been removed.

**When adding features, preserve this.** Do not add optimistic UI that claims
success before the container exists, and do not add mock/demo data paths.

## Commands

Package manager is **Bun** (`bun.lock` is authoritative; `package-lock.json` is
also committed but Bun is what the Dockerfile and scripts use).

```bash
bun install
# Create .env by hand — see Environment below. The README says
# `cp .env.example .env`, but no .env.example is committed (.gitignore
# excludes .env*), so that step will fail.
bunx prisma migrate dev         # or: bun run db:push
bun run db:seed                 # creates the admin user
bun run dev                     # http://localhost:3000

bun run lint                    # eslint (flat config, most rules disabled)
bun run test                    # tsx scripts/selfcheck-host-health.ts
bun run build                   # next build + copies static/public into standalone
bun run start                   # node/bun on .next/standalone/server.js
```

Prisma helpers: `db:push`, `db:generate`, `db:migrate`, `db:reset`, `db:seed`.

Docker Desktop / `dockerd` must be running for anything meaningful to work.

### Testing reality

There is **no test framework**. `bun run test` runs a single hand-rolled
self-check (`scripts/selfcheck-host-health.ts`, 27 checks) using `node:assert`:

- **`src/lib/host-health.ts`** — `diagnoseDeployError`, `parseTraefikLogs`,
  `demuxStream` (dockerode's multiplexed stream framing), `sanitize`. Its
  fixtures are real log lines from a production outage — **do not loosen those
  assertions to make a change pass.**
- **`src/lib/authz.ts`** — the role/action matrix and the method→action default.
  This is the security policy the route wrapper applies; keep it covered.
- **`src/lib/backup-format.ts`** — backup slugs, `shq()` shell quoting (a
  database password is interpolated into `sh -c`, so a quoting bug is command
  injection), `parseSizeMarker`, and the per-engine dump commands.

Those three modules are deliberately **pure and import-free** so the self-check
runs without a Docker socket, a database, or a generated Prisma client. Keep new
testable logic out of the modules that import `./db`.

If you add parsing/classification logic to any of them, add a case. `scripts/audit.sh` and `scripts/audit-views.sh` are manual
browser-driving smoke scripts (they need an `agent-browser` binary) and are not
part of CI.

## Layout

```
src/
  app/
    layout.tsx            root layout: fonts, ThemeProvider, AuthProvider, ErrorBoundary
    page.tsx              the entire SPA shell — auth gate + view switch + dialogs
    globals.css           Tailwind v4 theme tokens
    api/**/route.ts       the REST API (~50 route files)
  components/
    slipway/              app-specific components
      views/              one file per NavView (overview, projects, databases, …)
      action-dialogs.tsx  most of the create/edit dialogs (large)
      new-deployment-dialog.tsx, rollback-dialog.tsx, sidebar.tsx, topbar.tsx, …
    ui/                   shadcn/ui primitives (new-york style) — 48 files, don't hand-edit
  lib/
    docker-ops.ts         REAL Docker orchestration (~1900 lines; the heart of the app)
    docker.ts             dockerode client + cached availability ping
    ops.ts                thin façade re-exporting the real ops
    authz.ts              PURE role/action policy (roleAllows, defaultActionFor)
    backup-format.ts      PURE backup naming, shell quoting, per-engine dump commands
    host-health.ts        disk/inode/ENOSPC/Traefik diagnosis + log demux + sanitize
    metrics.ts            in-memory ring buffer sampled from `docker stats`
    db.ts                 Prisma singleton + SQLite path resolution
    auth.ts               NextAuth v4 options (credentials + TOTP + optional OAuth)
    server-auth.ts        getAuth/requireAuth/can — session cookie OR Bearer token
    http.ts               route() wrapper: auth + scope check + params + error handling
    api.ts                client-side typed fetch helpers (api.get/post/patch/put/del)
    serialize.ts          Prisma rows → frontend shapes
    notify.ts             emit(): activity + notification + external dispatch
    scheduler.ts          in-process node-cron (backup schedules, SSL expiry scan)
    slipway/
      store.ts            Zustand store — all client state and actions
      types.ts            domain types (the contract serialize.ts must satisfy)
      data.ts             DB kind/version/port metadata
      dismiss.tsx         FloatingLayerProvider + useDismiss (outside-click/Esc)
  config/app.ts           APP_NAME / APP_VERSION — single source of truth
  instrumentation.ts      starts the scheduler on server boot
prisma/                   schema.prisma, migrations/, seed.ts
proxy/                    Caddy / Nginx / Traefik configs for production
.zscripts/                build/dev/start shell scripts (comments are in Chinese)
scripts/                  selfcheck + manual audit scripts
```

`db/custom.db`, `download/`, `upload/`, `examples/`, `mini-services/` are
peripheral — not part of the running app.

## Architecture and data flow

### Client

`src/app/page.tsx` is the whole app. It renders `LoginView` when there is no
user, otherwise `AppShell`, which switches on `useSlipway(s => s.view)`.
Overview / Projects / Databases are eagerly imported; every other view is a
`React.lazy` chunk behind a `Suspense` that sits **only** around the view switch
so the shell (sidebar, topbar, dialogs) never remounts.

`AppShell` hydrates from the API on mount, then polls `refetchAll()` every 5s.
**The poll is paused on `visibilitychange`** — a backgrounded dashboard sampling
`docker stats` + `du` is real load on the host. Keep that behavior.

### Server

Every API route is wrapped in `route()` from `src/lib/http.ts`:

```ts
export const GET = route(async (req, params, auth) => {
  const rows = await db.thing.findMany()
  return rows.map(serializeThing)      // plain value → NextResponse.json
})                                      // or return a Response for non-200
```

`route()` calls `requireAuth` (throws a 401 `Response`), awaits dynamic
`params`, JSON-encodes plain return values, and converts thrown errors to
`{ error }` with status 500. Most routes also set
`export const dynamic = "force-dynamic"`.

Auth accepts **either** a NextAuth session cookie **or**
`Authorization: Bearer slipway_…`. Tokens are bcrypt-hashed, so `getAuth` has to
compare against every token row; a short-TTL verified-token cache keeps the hot
path off that scan (invalidated on revoke). An *invalid* token still costs a
full scan — that ceiling needs an indexed lookup column.

**Scopes are enforced, and that enforcement is the route wrapper's job.**
`route()` derives the required privilege from the HTTP method — GET/HEAD →
`read`, everything else → `deploy` — and rejects over-scoped **token** requests
with 403. Operator surfaces pass it explicitly:

```ts
export const POST = route(async (req, params, auth) => { … }, { action: "admin" })
```

Admin-only today: tokens, settings PATCH, servers (+join), SSH keys, registries,
webhooks, integrations, 2FA. Interactive **sessions are not gated** — Slipway has
no role-management UI, so a signed-in user blocked from deploying would have no
way to be granted the role. Keep that asymmetry unless you also build user
management. The policy itself lives in `src/lib/authz.ts` (pure, tested).

`GET /api/` is a health endpoint reporting Docker availability.

### Deploy pipeline

`realDeploy()` writes a `Deployment` row with all `DeploymentStep`s up front
(`queued`), flips the project to `restarting`, then fires `runPipeline()` **in
the background** and returns the deployment id immediately. The client polls for
progression. Failures persist the last ~1200 chars of the step log so the UI can
show a real cause. Build for git/folder/compose sources shells out to the
`docker` CLI via `runCli()`; image sources go through dockerode.

Two invariants to preserve:

- **Container config comes from `containerConfigFor(projectId)`** — env vars
  scoped to the project's environment, `startCmd`, and the memory/CPU limits.
  Deploy and `realReconcile` both go through it. They used to disagree (deploy
  passed `Env: []`), so a project's live config depended on which action ran last.
- **Builds are tagged `slipway-<slug>:<deployment-id-suffix>` as well as
  `:latest`**, and the released image is stored on `Deployment.image`. That is
  what makes rollback possible; `:latest` alone is overwritten by the next build.

### Rollback

`realRollback()` recreates the project's container from a previous deployment's
recorded `image`, preserving volumes, networks, port bindings and labels. The
current container is **renamed aside, not removed**, and restored if the
rolled-back one fails to start — the dialog promises an automatic abort, so the
known-good container has to still exist. Fails honestly when the deployment
recorded no image, or the image has been pruned off the host.

### Backups

Archives go into the **`slipway-backups` named Docker volume**: `tar -czf` for
volumes, and the engine's own dump tool for databases (`pg_dump`, `mysqldump`,
`mongodump`, `redis-cli --rdb`) run from a helper container built on the
database's own image, sharing the DB container's network namespace so
`127.0.0.1` is the engine. Sizes are `stat`-ed, durations measured, retention
pruned. MSSQL and SQLite are refused honestly. **Restore is not automated** and
downloads are not served — the UI tells the operator the filename and the
`docker run … cp` command instead of pretending.

### Notifications

Use `emit(event, kind, message, notification, opts)` from `src/lib/notify.ts`
rather than writing `ActivityEvent`/`Notification` rows directly — it records
activity, pushes an in-app notification, and dispatches to configured external
integrations (Slack, Discord, Teams, Telegram, PagerDuty, SMTP, generic
webhooks) in one call. Notification writes are best-effort: never let a failed
notification fail the operation it describes.

## Conventions to follow

### `ponytail:` comments

~90 comments across the codebase are prefixed `ponytail:`. They mark a
deliberate decision that fixed a specific bug and explain *why* the obvious
alternative is wrong (e.g. why the container runs as root, why the full
`node_modules` is copied into the standalone image, why the poll pauses when
hidden). **Read them before changing nearby code, and don't delete them.** If
you make a similarly non-obvious call, leave one in the same style.

### Single source of truth

The codebase repeatedly collapses duplicated state into one authority. Preserve
these:

| Concern | Authority |
|---|---|
| App name/version | `src/config/app.ts` (`APP_VERSION`) — never re-hardcode |
| Current view + selected project | `location.hash` (`#projects`, `#project-detail/<id>`) |
| Environment filter | `?env=production\|staging\|preview` (absent = `all`), pushState |
| Env comparison | `envKey()` in `src/lib/slipway/types.ts` — both sides must use it |
| Host health shape | `src/lib/host-health.ts`, mirrored in `slipway/types.ts` |
| API response shapes | `src/lib/serialize.ts` |

Navigation is hash-based on purpose — no router library — so refresh, shareable
URLs, and Back/Forward work on a static/standalone host without server rewrites.

### Overlay mutex

Only one overlay may be open at a time. Dialog flags, the command palette
(`commandOpen`) and the notifications panel (`notifOpen`) all go through
`openOverlay()` in `store.ts`, which clears every flag then sets one. Add new
dialogs to `DialogFlag`/`DIALOG_FALSE` — do not add a bare `setXOpen(true)`.

### Never blank the dashboard on a transient failure

`store.ts` has two fetch helpers: `safeGet(url, fallback)` for first hydration
and `fetchOrKeep(url, keep)` for polls. Polls **keep the previous data** on
error so a container mid-restart doesn't make everything vanish and reappear.
Use `fetchOrKeep` in `refetchAll`/`refetch`.

### Serialization

Frontend components consume `src/lib/slipway/types.ts` shapes. API routes must
map Prisma rows through `src/lib/serialize.ts` (dates → ISO strings, `null` →
`undefined`, masked env var values blanked). If you add a field, update the
type, the serializer, and the Prisma model together.

### Secrets

Database passwords are returned in plaintext **exactly once** — at provision
time (`POST /api/databases`) and via the explicit
`GET /api/databases/:id/credentials` reveal. Masked env vars serialize as `""`.
Keep that shape; don't widen list endpoints to include secrets.

### Styling

Tailwind v4 + shadcn/ui (`new-york`, neutral base, CSS variables, lucide icons).
Dark mode is forced via `className="dark"` on `<html>`. Add primitives with the
shadcn CLI rather than hand-writing into `src/components/ui/`.

## Database notes

- SQLite via Prisma 6. **`src/lib/db.ts` rewrites relative `file:` URLs to an
  absolute path anchored at `<cwd>/prisma`** so the runtime client and
  `prisma migrate` hit the same file. Don't "simplify" this — it prevents the
  classic two-databases bug. Absolute URLs (production, `file:/data/slipway.db`)
  pass through untouched.
- The Prisma client is a `globalThis` singleton (dev hot-reload safe).
- Schema mirrors `slipway/types.ts` plus auth, integrations and scheduling.
  Enum-ish columns are plain `String` with the allowed values in a comment.
- Migrations live in `prisma/migrations/`. Prefer `prisma migrate dev` locally;
  the production container runs `prisma db push --accept-data-loss` on boot.
  **Those two paths can silently diverge** — `db push` syncs straight from
  `schema.prisma` and ignores history, so a schema column added without a
  migration works in the container and breaks `migrate deploy` (this happened:
  `Deployment.kind`, `Deployment.error`, `DeploymentStep.log`,
  `DatabaseInstance.environment`). After changing the schema, check with:

  ```bash
  npx prisma migrate diff \
    --from-url "file:$PWD/prisma/slipway.db" \
    --to-schema-datamodel prisma/schema.prisma --script
  ```

  An empty result means the migration history reproduces the schema.
- `prisma/seed.ts` is idempotent: admin user, the `local` server row, and one
  deployable demo project.

## Docker / production notes

The `Dockerfile` encodes several hard-won constraints — read its comments before
editing:

- Build with Bun, but **run `server.js` under `node`** — Bun's runtime 404s
  Next 16's `/api/auth/*` routes.
- `docker-cli` + `docker-cli-compose` must be installed in the image; the deploy
  pipeline shells out to `docker build` / `docker compose`, and the socket alone
  isn't enough (`spawn docker ENOENT`).
- The container runs as **root** because `/var/run/docker.sock` is root-owned;
  a socket-mounted container is already root-equivalent on the host.
- The **entire** builder `node_modules` is copied into standalone, because Bun's
  layout defeats Next's output-file-tracing and silently drops `next-auth`,
  `otplib`, `qrcode`.

Compose variants: `docker-compose.yml` (Traefik labels, Dokploy network),
plus `.caddy.yml`, `.nginx.yml`, `.traefik.yml`, `.direct.yml`. Matching proxy
configs are in `proxy/`. `install.sh` is the interactive production installer
(`--proxy caddy --domain … --password …`).

`next.config.ts` sets `output: "standalone"` and **`typescript.ignoreBuildErrors: false`** —
type errors must fail the build. Don't flip that. ESLint's flat config disables
most rules, so lint passing is a weak signal; rely on `tsc`/`next build`.

It also sets **`serverExternalPackages: ["ssh2", "dockerode", "docker-modem",
"cpu-features"]`**. These carry native addons; Turbopack can't put a
non-ECMAScript asset in an ESM chunk, and without this the build fails with
`non-ecmascript placeable asset` from `ssh2/lib/protocol/crypto.js`. Add any new
native-addon dependency to that list.

**`npm ci` does not work on this repo** — `next-auth@4` declares a peerOptional
on `nodemailer@^7` while the project pins `^9`, and npm refuses to resolve it.
Bun ignores peer conflicts, which is why `bun.lock` is authoritative. If you need
an npm tree (e.g. bun is unavailable), `npm install --legacy-peer-deps` works;
don't commit the resulting `package-lock.json` churn.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path (`file:./slipway.db`, relative to `prisma/`) |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Session secret + public URL (`AUTH_SECRET`/`AUTH_URL` also read) |
| `SLIPWAY_ADMIN_USER` / `SLIPWAY_ADMIN_PASSWORD` | Seeded admin credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Enables GitHub OAuth provider |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` / `GITLAB_ISSUER` | Enables GitLab OAuth |
| `SMTP_URL` / `SMTP_FROM` | Email integration |
| `SLIPWAY_DATA_DIR` / `SLIPWAY_BEHIND_PROXY` / `SLIPWAY_PUBLIC_HOST` | Runtime/deploy hints |
| `SLIPWAY_LATEST_VERSION` | Enables the "check for updates" comparison |
| `SLIPWAY_CLUSTER_ID` | Cluster label shown in the UI |

OAuth providers are registered only when their env vars are present, and the UI
reflects that — keep the gating honest.

## Known ceilings (state these; don't paper over them)

- **Single node.** No Swarm/Kubernetes; `realReconcile` and `realRollback`
  explicitly refuse Swarm tasks, and `realScale` accepts only 0 (stop) or 1
  (run) — more than one replica needs a scheduler, so it is refused rather than
  recorded as if it happened.
- **Single instance.** The `node-cron` scheduler and the metrics ring buffer are
  in-process. Horizontal scaling would duplicate backup firings and split
  metrics; that needs an external worker.
- **No CLI binary / desktop app** is bundled. The "CLI & Desktop" view documents
  intended distribution honestly and offers no fake downloads.
- **SSL issuance** needs a reachable Caddy/Traefik on a public domain; otherwise
  domains honestly show `pending`/`disabled`.
- **Host scan** imports containers/volumes but cannot detect domains/SSL (those
  live in the reverse proxy) and does not know imported DB passwords — such rows
  are marked `external`.
- **OIDC / SAML** are shown as disabled.
- **Backups** cover volumes and Slipway-provisioned databases
  (postgres/mysql/mariadb/mongodb/redis/valkey). MSSQL and SQLite are refused;
  imported `external` databases can't be dumped because Slipway doesn't know
  their credentials. **Restore is manual** and archives aren't served over
  HTTP — the UI reports the filename and the `docker run … cp` command.
- **Rollback needs a recorded image.** Deployments taken before
  `Deployment.image` existed, and compose deploys (compose owns its images),
  can't be rolled back automatically.
- **API token scopes are enforced; session roles are not.** See the Server
  section — there is no user-management UI to grant a role back.

## Git workflow

Trunk is `main`. Commit subjects follow a loose conventional style:
`fix(scope): what actually changed` — scopes seen include `deploy`,
`host-health`, `dashboard`, `databases`, `storage`, `routing+version`.
Describe the real user-visible behavior change, not the file list.

Never commit: `.env*`, `*.db` / `prisma/*.db` (gitignored), or generated
`node_modules`/`.next` output.
