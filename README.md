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

## Quick start (recommended)

Run the interactive installer on your Linux server:

```bash
git clone https://github.com/slipway/slipway.git
cd slipway
./install.sh
```

The installer walks you through:

1. **Pick a reverse proxy** — Caddy / Nginx / Traefik / None
2. **Set your domain** — e.g. `slipway.example.com`
3. **Set the admin password** — defaults to `admin`

It writes `.env`, pulls images, and starts Slipway. When it finishes, open
the URL it prints and sign in with the credentials you set.

> **Default credentials:** `admin` / `admin` — override during install or
> edit `.env` later.

---

## Choosing a reverse proxy

Slipway ships with three reverse-proxy options. Pick the one that fits your
setup. All three terminate TLS and proxy to Slipway on the internal Docker
network.

| Proxy | HTTPS | Best for | Effort |
|-------|-------|----------|--------|
| **Caddy** | Automatic (Let's Encrypt) | Most users — zero cert management | Lowest |
| **Nginx** | Manual (certbot helper) | Existing nginx setups, custom routing | Medium |
| **Traefik** | Automatic (Let's Encrypt) | Multi-service clusters, label routing | Medium |
| **None** | None (HTTP on :8080) | Local testing, external proxy already in place | Lowest |

### Option 1 — Caddy (automatic HTTPS, recommended)

Caddy provisions and renews Let's Encrypt certificates automatically. No
certbot, no cron jobs, no manual cert management.

```bash
./install.sh
# → pick "1) Caddy"
# → enter slipway.example.com
# → enter your email (for Let's Encrypt)
# → enter admin password (default: admin)
```

Or manually:

```bash
cp .env.example .env
# In .env, set: SLIPWAY_DOMAIN, ACME_EMAIL, SLIPWAY_ADMIN_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Caddy config is in [`proxy/Caddyfile`](./proxy/Caddyfile). It includes HSTS,
security headers, WebSocket support, and request logging.

### Option 2 — Nginx (HTTPS via certbot)

Nginx is the most flexible option. By default it serves HTTP on :80 and
proxies to Slipway. To enable HTTPS, run the bundled certbot helper:

```bash
./install.sh
# → pick "2) Nginx"
# → enter slipway.example.com
# → enter admin password

# Then provision a cert:
./proxy/certbot-init.sh slipway.example.com you@email.com
```

The certbot helper:
1. Starts nginx in HTTP-only mode
2. Runs certbot to get a cert into `./proxy/certs/`
3. Sets `SLIPWAY_ENABLE_TLS=true` in `.env`
4. Restarts nginx with HTTPS enabled
5. Prints a cron line for auto-renewal

To use your own cert instead, place `fullchain.pem` and `privkey.pem` in
`./proxy/certs/`, set `SLIPWAY_ENABLE_TLS=true`, and uncomment the TLS lines
in [`proxy/nginx.conf`](./proxy/nginx.conf).

Nginx config files: [`proxy/nginx-main.conf`](./proxy/nginx-main.conf) (global)
and [`proxy/nginx.conf`](./proxy/nginx.conf) (per-site, envsubst'd).

### Option 3 — Traefik (automatic HTTPS, label-based)

Traefik routes based on Docker labels on Slipway's container. ACME certs are
provisioned automatically and stored in a named volume.

```bash
./install.sh
# → pick "3) Traefik"
# → enter slipway.example.com
# → enter your email (for Let's Encrypt)
# → enter admin password
```

Traefik static config: [`proxy/traefik.yml`](./proxy/traefik.yml).
Dynamic config (middlewares, TLS options): [`proxy/traefik-dynamic.yml`](./proxy/traefik-dynamic.yml).

The Traefik dashboard is exposed on :8080 — **secure it or remove the port
mapping in production** (see the comments in `docker-compose.traefik.yml`).

### Option 4 — No proxy (HTTP only)

For local testing or when you already have an external proxy:

```bash
./install.sh
# → pick "4) None"
# → enter admin password

# Or manually:
docker compose -f docker-compose.yml -f docker-compose.direct.yml up -d
```

Slipway is exposed on `http://<server-ip>:8080` — HTTP only, no TLS.

---

## Manual setup (no installer)

If you prefer to do everything by hand:

```bash
# 1. Configure
cp .env.example .env
$EDITOR .env   # set SLIPWAY_ADMIN_PASSWORD, SLIPWAY_DOMAIN, ACME_EMAIL

# 2. Pick a proxy and start
# Caddy:
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d

# Nginx:
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d

# Traefik:
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d

# None (direct, port 8080):
docker compose -f docker-compose.yml -f docker-compose.direct.yml up -d
```

---

## Requirements

- Any modern Linux server (Ubuntu 22.04+, Debian 12+, Rocky 9+, Alpine 3.19+)
- 1 vCPU · 1 GB RAM · 10 GB disk (minimum)
- Docker 24+ and Docker Compose v2
- A public IP and ports 80 + 443 reachable (for Caddy / Nginx / Traefik)
- A domain name pointing at your server (for managed SSL)

Slipway itself runs in a single container. The apps you deploy run as separate
Docker containers on the same host (or on worker nodes you join to the
cluster).

---

## Configuration

All configuration is via environment variables in [`.env`](./.env.example).
The most important ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLIPWAY_ADMIN_USER` | `admin` | Admin username |
| `SLIPWAY_ADMIN_PASSWORD` | `admin` | Admin password — **change this!** |
| `SLIPWAY_DATA_DIR` | `/data` | Where Slipway stores its SQLite DB, certs, uploads |
| `SLIPWAY_BEHIND_PROXY` | `true` | Set `false` only when using direct mode |
| `SLIPWAY_DOMAIN` | _(unset)_ | Public hostname — required for Caddy/Nginx/Traefik |
| `ACME_EMAIL` | _(unset)_ | Email for Let's Encrypt — required for Caddy/Traefik |
| `SLIPWAY_ENABLE_TLS` | `false` | Nginx-only: set `true` after running certbot-init.sh |
| `SLIPWAY_CLUSTER_ID` | `helix-eu` | Cluster identifier shown in the UI |
| `TZ` | `UTC` | Timezone for schedules and logs |
| `SMTP_URL` | _(unset)_ | SMTP connection string for email notifications |
| `SLIPWAY_BACKUP_S3_URL` | _(unset)_ | S3-compatible endpoint for offsite backups |

---

## Updating

```bash
# Pull the latest image and restart
docker compose -f docker-compose.yml -f docker-compose.<proxy>.yml pull
docker compose -f docker-compose.yml -f docker-compose.<proxy>.yml up -d
```

Slipway performs rolling upgrades with zero downtime. Database migrations run
automatically on boot.

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

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       Your Linux server                         │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │   Reverse proxy (Caddy / Nginx / Traefik) :80 :443      │  │
│   │   • TLS termination  • HTTP/3  • security headers        │  │
│   └────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│   ┌────────────────────────▼────────────────────────────────┐  │
│   │                  Slipway container                       │  │
│   │   ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│   │   │ Dashboard  │  │ Build CI   │  │ Scheduler        │  │  │
│   │   │ (Next.js)  │  │ (Docker)   │  │ (cron + workers) │  │  │
│   │   └────────────┘  └────────────┘  └──────────────────┘  │  │
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

- **Change the default password.** Slipway ships with `admin / admin` for
  first-run convenience. Override `SLIPWAY_ADMIN_PASSWORD` (in `.env` or via
  `./install.sh`) before exposing Slipway to the internet.
- **Use HTTPS.** Caddy and Traefik handle TLS automatically via Let's Encrypt.
  For Nginx, run `./proxy/certbot-init.sh` after install. Never expose the
  dashboard over plain HTTP in production.
- **Close the Traefik dashboard port.** `docker-compose.traefik.yml` exposes
  Traefik's dashboard on :8080 for convenience. Remove that port mapping or
  protect it with basic-auth before going live.
- **Docker socket.** Slipway needs `/var/run/docker.sock` to manage your
  apps. On a single-node install this is normal; on multi-tenant hosts,
  consider running Slipway in its own VM.
- **Client-side auth note.** The bundled auth gate is a self-hosted
  single-user session intended for behind-a-proxy deployments. For multi-user
  or hardened setups, swap in NextAuth + Prisma (see
  [docs/advanced/auth.md](docs/advanced/auth.md)).

---

## Troubleshooting

### `SLIPWAY_DOMAIN must be set` error

You picked Caddy/Nginx/Traefik but didn't set `SLIPWAY_DOMAIN` in `.env`.
Either run `./install.sh` (which sets it for you) or edit `.env` and add:
```
SLIPWAY_DOMAIN=slipway.example.com
```

### HTTPS doesn't work after install

- Make sure DNS for your domain actually points at this server's public IP.
- Make sure ports 80 and 443 are open in your firewall.
- For Caddy: `docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs caddy` — Caddy logs ACME failures.
- For Traefik: `docker compose -f docker-compose.yml -f docker-compose.traefik.yml logs traefik` — look for ACME errors.
- For Nginx: run `./proxy/certbot-init.sh <domain> <email>` to provision a cert.

### Want to switch proxies later

```bash
docker compose -f docker-compose.yml -f docker-compose.<old>.yml down
# edit .env if needed, then:
docker compose -f docker-compose.yml -f docker-compose.<new>.yml up -d
```

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

## Community

- **Docs:** https://slipway.run/docs
- **GitHub:** https://github.com/slipway/slipway
- **Discord:** https://slipway.run/discord
- **Mastodon:** @slipway@hachyderm.io

Slipway is built by an open community of self-hosters. PRs welcome.
