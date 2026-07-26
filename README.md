# Slipway

**Self-hosted deploys, without the yak shaving.**

Slipway is an open-source, self-hosted deployment platform for apps and
containers. Connect a Git repo, point it at a local folder, or import an
existing Docker Compose app — Slipway auto-detects the stack, builds it, and
ships it to your own Linux servers with built-in CI/CD, domains, SSL,
databases, and one-click rollbacks.

It comes with three first-class clients that all feel like the same product:

- **Web dashboard** — what you're looking at
- **Desktop app** — macOS, Windows, Linux (Tauri-based)
- **CLI** — `slipway deploy`, `slipway logs`, `slipway rollback`, …

Everything the dashboard can do, the CLI can do — and vice versa.

---

## Quick start (Docker)

The fastest way to run Slipway on your own server.

```bash
# 1. Get the files
git clone https://github.com/slipway/slipway.git
cd slipway

# 2. Configure
cp .env.example .env
# Edit .env — at minimum, change SLIPWAY_ADMIN_PASSWORD
$EDITOR .env

# 3. Launch
docker compose up -d

# 4. Sign in
# Open http://<your-server-ip>:8080
# Username: admin   (or whatever you set in .env)
# Password: <your-password>
```

That's it. Slipway is now running and ready to deploy your first project.

> **Production tip:** Put Slipway behind a reverse proxy (Caddy, Traefik, or
> nginx) for HTTPS termination. Set `SLIPWAY_BEHIND_PROXY=true` in `.env` so
> Slipway trusts `X-Forwarded-*` headers.

---

## Requirements

- Any modern Linux server (Ubuntu 22.04+, Debian 12+, Rocky 9+, Alpine 3.19+)
- 1 vCPU · 1 GB RAM · 10 GB disk (minimum)
- Docker 24+ and Docker Compose v2
- A public IP if you want to expose apps to the internet
- (Optional) A domain name pointing at your server for managed SSL

Slipway itself runs in a single container. The apps you deploy run as separate
Docker containers on the same host (or on worker nodes you join to the
cluster).

---

## Installation options

### Option A — Docker Compose (recommended)

```bash
docker compose up -d
```

Pulls the official image from `ghcr.io/slipway/server:1.4.2`, mounts the data
volume and Docker socket, and starts Slipway on port 8080.

### Option B — Plain Docker

```bash
docker run -d \
  --name slipway \
  --restart unless-stopped \
  -p 8080:3000 \
  -v slipway-data:/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e SLIPWAY_ADMIN_USER=admin \
  -e SLIPWAY_ADMIN_PASSWORD=$(openssl rand -hex 16) \
  -e SLIPWAY_BEHIND_PROXY=false \
  ghcr.io/slipway/server:1.4.2
```

### Option C — Build from source

```bash
git clone https://github.com/slipway/slipway.git
cd slipway
docker compose up -d --build
```

### Option D — One-line install script (no Docker)

For a bare-metal install on a fresh Linux server:

```bash
curl -fsSL https://slipway.run/install-server.sh | sh
```

This installs Slipway as a systemd service. The script works on Ubuntu, Debian,
Rocky, and Alpine.

---

## Configuration

All configuration is via environment variables. See [`.env.example`](./.env.example)
for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `SLIPWAY_ADMIN_USER` | `admin` | Admin username |
| `SLIPWAY_ADMIN_PASSWORD` | `admin` | Admin password — **change this!** |
| `SLIPWAY_DATA_DIR` | `/data` | Where Slipway stores its SQLite DB, certs, uploads |
| `SLIPWAY_BEHIND_PROXY` | `false` | Set `true` if behind a reverse proxy |
| `SLIPWAY_CLUSTER_ID` | `helix-eu` | Cluster identifier shown in the UI |
| `TZ` | `UTC` | Timezone for schedules and logs |
| `SMTP_URL` | _(unset)_ | SMTP connection string for email notifications |
| `SLIPWAY_BACKUP_S3_URL` | _(unset)_ | S3-compatible endpoint for offsite backups |

---

## Reverse proxy examples

### Caddy (automatic HTTPS)

```Caddyfile
slipway.example.com {
    reverse_proxy slipway:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name slipway.example.com;

    ssl_certificate     /etc/ssl/certs/slipway.pem;
    ssl_certificate_key /etc/ssl/private/slipway.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Set `SLIPWAY_BEHIND_PROXY=true` in `.env` and restart Slipway.

---

## Installing the CLI

The CLI is a single static binary. Install it on your laptop or CI runner:

```bash
# macOS
brew install slipway/tap/slipway

# Linux
curl -fsSL https://slipway.run/install.sh | sh

# Windows
winget install Slipway.Slipway
```

Then point it at your server:

```bash
slipway login --server https://slipway.example.com --token "$SLIPWAY_TOKEN"
slipway deploy github.com/myorg/myapp
slipway logs myapp --follow
slipway rollback myapp --last
```

See **CLI & Desktop** in the dashboard for the full cookbook.

---

## Backups

Slipway backs up its own state and your managed databases / volumes on a
schedule. Configure destinations under **Settings → Backups** in the dashboard
or via env vars:

- Local disk (default — stored in `$SLIPWAY_DATA_DIR/backups`)
- NFS share
- S3-compatible (AWS S3, Backblaze B2, MinIO, Cloudflare R2)

Restore to any point in time within the retention window via the dashboard or:

```bash
slipway db restore helix-postgres --pitr "2026-07-25T14:30:00Z"
```

---

## Updating

```bash
docker compose pull
docker compose up -d
```

Slipway performs rolling upgrades with zero downtime. Database migrations run
automatically on boot.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       Your Linux server                         │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                  Slipway container                       │  │
│   │                                                          │  │
│   │   ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│   │   │ Dashboard  │  │ Build CI   │  │ Scheduler        │  │  │
│   │   │ (Next.js)  │  │ (Docker)   │  │ (cron + workers) │  │  │
│   │   └────────────┘  └────────────┘  └──────────────────┘  │  │
│   │                                                          │  │
│   │   ┌────────────────────────────────────────────────┐    │  │
│   │   │  SQLite DB  ·  TLS certs  ·  uploaded artifacts │   │  │
│   │   └────────────────────────────────────────────────┘    │  │
│   └─────────────────────────────────────────────────────────┘  │
│                            ↕                                    │
│                   /var/run/docker.sock                          │
│                            ↕                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  Your apps (separate containers, managed by Slipway)    │  │
│   │  · helix-api    · helix-web    · billing-worker         │  │
│   │  · postgres     · redis        · analytics-clickhouse   │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

To scale horizontally, add worker nodes via **Settings → Cluster → Add server**.
Slipway installs Docker on the new node over SSH and joins it to the cluster.

---

## Security notes

- **Change the default password.** The container ships with `admin / admin`
  for first-run convenience. Override `SLIPWAY_ADMIN_PASSWORD` before exposing
  Slipway to the internet.
- **Use HTTPS.** Run Slipway behind Caddy/Traefik/nginx with TLS. Slipway
  provisions and renews Let's Encrypt certs for the apps you deploy, but the
  Slipway dashboard itself should be secured by your reverse proxy.
- **Docker socket.** Slipway needs `/var/run/docker.sock` to manage your
  apps. On a single-node install this is normal; on multi-tenant hosts,
  consider running Slipway in its own VM.
- **Client-side auth note.** The bundled auth gate is a self-hosted
  single-user session intended for behind-a-proxy deployments. For multi-user
  or hardened setups, swap in NextAuth + Prisma (see
  [docs/advanced/auth.md](docs/advanced/auth.md)).

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

## Community

- **Docs:** https://slipway.run/docs
- **GitHub:** https://github.com/slipway/slipway
- **Discord:** https://slipway.run/discord
- **Mastodon:** @slipway@hachyderm.io

Slipway is built by an open community of self-hosters. PRs welcome.
