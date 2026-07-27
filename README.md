# Slipway

A self-hosted deployment platform — a minimal Coolify. Connect a Git repo,
point at a local folder, or import a Docker Compose app; Slipway builds it
with **real Docker** and ships it to your own server, with domains, databases,
backups, rollbacks, notifications, and a REST API.

This is the **server + web dashboard**. It runs as a single Next.js process
with a SQLite database and talks to the local Docker engine via
[`dockerode`](https://github.com/apocas/dockerode).

---

## Quick start (local dev)

Requirements: Node 20+, Bun (or npm), and **Docker Desktop / dockerd running**
(orchestration is real — there is no simulation fallback).

```bash
bun install                       # or npm install
cp .env.example .env              # then edit the secrets
bunx prisma migrate dev --name init
bun run db:seed                   # creates the admin user
bun run dev                       # http://localhost:3000
```

Sign in with the seeded admin: **`admin` / `admin`** (override via
`SLIPWAY_ADMIN_USER` / `SLIPWAY_ADMIN_PASSWORD` in `.env`).

> If Docker is **not** running, Slipway fails honestly: deploys are marked
> `failed`, logs report "no containers", and metrics are empty. It never
> fakes success. Start Docker and the same operations work for real.

### Production build

```bash
bun run build        # next build (output: standalone)
bun run start        # serves the standalone server
```

> On **Windows**, `next build`'s standalone file-tracing step can warn
> `EINVAL: copyfile` for a chunk whose name contains `node:child_process`
> (the `:` is illegal in Windows filenames). Compilation still succeeds; the
> standalone image is normally built on Linux (Docker), where this doesn't
> occur.

---

## What's real

- **Docker orchestration** — pull/build/run/restart/stop/remove/scale/backup
  through dockerode. Build logs stream over SSE; container stats feed the
  metrics charts. Single-node only.
- **Managed databases** — New database provisions a real engine container
  (Postgres/MySQL/MariaDB/Mongo/Redis/Valkey/MSSQL) with generated
  credentials, a named data volume, and a published port. Credentials are
  revealed once at create and re-recoverable from ⋯ → Show credentials.
  Edit (rename / link / backups) and delete (with optional data-volume wipe)
  act on the real container.
- **Host scan** — "Scan host" imports containers/volumes already running on
  the host into Slipway (existing apps → Projects, DB-image containers →
  Databases marked `external`, volumes → Volumes) so a fresh install can
  manage workloads it didn't create.
- **Auth** — NextAuth v4: bcrypt-hashed credentials, JWT httpOnly sessions,
  env-gated GitHub/GitLab OAuth, and **TOTP 2FA** (setup → QR → verify; the
  sign-in gate requires a code when 2FA is on).
- **API tokens** — mint `slipway_…` tokens (bcrypt-hashed) for CLI/automation
  Bearer auth.
- **Everything in the dashboard does something** — projects, deployments,
  services, domains, env-var CRUD, databases, volumes, backups + schedules,
  servers, registries, webhooks, integrations, SSH keys, tokens, profile,
  settings, audit log, danger zone (pause / disconnect / delete).
- **Notifications** — in-app + external dispatch to Slack, Discord, Teams,
  Telegram, PagerDuty, and SMTP email (nodemailer), plus generic webhooks.
- **Scheduler** — an in-process `node-cron` runner fires active backup
  schedules and a daily SSL-expiry scan (started via `instrumentation.ts`).

## Honest scope (not faked, not over-claimed)

- **CLI binary & desktop app** — not bundled with this build. The
  "CLI & Desktop" view describes the intended distribution honestly and does
  not offer fake downloads. Drive Slipway from the web dashboard or the REST
  API with a token.
- **SSL / Let's Encrypt** — domain records are stored for real, but issuing
  certificates needs a reachable Caddy/Traefik on a public domain; without
  that, SSL shows `pending`/`disabled` honestly.
- **Multi-node SSH join** — real `ssh2` connection + host probe; status
  reflects actual reachability. A stored *public* key alone can't
  authenticate — set a per-server password (`server:<id>:password` Setting)
  or a private key.
- **OIDC / SAML** — shown as disabled; GitHub/GitLab availability is
  env-gated and reflected in the UI.
- **Scheduler** — single-instance (runs in the Next.js process). For a
  horizontally-scaled deployment, move scheduling to an external worker.
- **Host scan does not detect domains/SSL** — those live in your reverse
  proxy (Caddy/Traefik/Dokploy), which Slipway doesn't own. Imported DB
  containers are marked `external` and Slipway does not know their password
  (it didn't create them); use the credentials you set originally.

---

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path (`file:./slipway.db`, relative to `prisma/`) |
| `SLIPWAY_ADMIN_USER` / `SLIPWAY_ADMIN_PASSWORD` | Seeded admin credentials |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Session secret + public URL |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Enable GitHub OAuth |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` / `GITLAB_ISSUER` | Enable GitLab OAuth |
| `SMTP_URL` / `SMTP_FROM` | Email integration (optional) |
| `SLIPWAY_LATEST_VERSION` | Enables the "check for updates" comparison |
| `SLIPWAY_CLUSTER_ID` | Cluster label shown in the UI |

---

## REST API

All routes live under `/api` and require a session cookie **or** an
`Authorization: Bearer slipway_…` token. Highlights:

- `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`
- `POST /api/projects/:id/{restart,scale,pause,disconnect-source}`
- `POST/PUT/DELETE /api/projects/:id/env-vars[/:eid]`
- `POST /api/projects/:id/services[/:sid/{restart,scale}]`
- `POST /api/deployments`, `POST /api/deployments/rollback`
- `GET /api/databases|volumes|servers|backups`, `POST /api/servers/:id/join`
- `GET /api/metrics`, `GET /api/logs/stream` (SSE)
- `GET/POST /api/{registries,webhooks,ssh-keys,tokens,integrations}`
- `GET/PATCH /api/settings`, `GET /api/settings/{export,check-for-updates}`
- `POST /api/auth/2fa/{setup,verify,disable}`

Mint a token in **Settings → Profile → API tokens**, then:

```bash
curl -H "Authorization: Bearer slipway_…" http://localhost:3000/api/projects
```

---

## Tech stack

Next.js 16 (App Router, Turbopack, `output: standalone`) · React 19 ·
Prisma 6 + SQLite · NextAuth v4 · dockerode · Zustand (client cache backed by
the API) · Tailwind v4 · otplib / qrcode / nodemailer / node-cron / ssh2.

## License

Apache 2.0.