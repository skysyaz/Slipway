#!/usr/bin/env bash
# =============================================================================
# Slipway — interactive production installer
# =============================================================================
# This script guides you through a production install of Slipway on a Linux
# server. It asks you to pick a reverse proxy (Caddy / Nginx / Traefik / none),
# configures your domain and admin password, and starts everything.
#
# Usage:
#   ./install.sh             # interactive
#   ./install.sh --proxy caddy --domain slipway.example.com --password secret
#
# Default credentials: admin / admin   (override with --password)
# =============================================================================

set -euo pipefail

# Colors
if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'
    BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; BLUE=''; RED=''; BOLD=''; NC=''
fi

info()  { printf "${BLUE}→${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; }
header(){ printf "\n${BOLD}%s${NC}\n" "$*"; }

# Defaults
PROXY=""
DOMAIN=""
PASSWORD="admin"
ADMIN_USER="admin"
EMAIL=""
CLUSTER_ID="helix-eu"
TIMEZONE="UTC"

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --proxy)        PROXY="$2"; shift 2 ;;
        --domain)       DOMAIN="$2"; shift 2 ;;
        --password)     PASSWORD="$2"; shift 2 ;;
        --user)         ADMIN_USER="$2"; shift 2 ;;
        --email)        EMAIL="$2"; shift 2 ;;
        --cluster)      CLUSTER_ID="$2"; shift 2 ;;
        --tz)           TIMEZONE="$2"; shift 2 ;;
        --help|-h)
            cat <<EOF
Slipway installer

Usage: $0 [options]

  --proxy <caddy|nginx|traefik|none>   Reverse proxy to use (required if not interactive)
  --domain   <hostname>                Public hostname (e.g. slipway.example.com)
  --password <password>                Admin password (default: admin)
  --user     <username>                Admin username (default: admin)
  --email    <email>                   Email for Let's Encrypt (required for caddy/traefik)
  --cluster  <id>                      Cluster identifier shown in UI (default: helix-eu)
  --tz       <timezone>                Timezone, e.g. UTC, Europe/Berlin (default: UTC)

Interactive mode runs when no flags are provided.
EOF
            exit 0 ;;
        *) err "Unknown option: $1"; exit 1 ;;
    esac
done

# ----- preflight checks -----
header "Preflight checks"

if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
    exit 1
fi
ok "Docker found: $(docker --version)"

if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 is not installed."
    exit 1
fi
ok "Docker Compose v2 found"

if [[ ! -f docker-compose.yml ]]; then
    err "docker-compose.yml not found. Run this script from the Slipway project root."
    exit 1
fi
ok "docker-compose.yml found"

# ----- interactive prompts -----
if [[ -z "$PROXY" ]]; then
    header "Choose a reverse proxy"
    cat <<EOF

  Slipway needs to be exposed to the network. Pick one:

    ${BOLD}1) Caddy${NC}    — automatic HTTPS via Let's Encrypt. Simplest option.
                  Recommended for most users. No cert management needed.

    ${BOLD}2) Nginx${NC}    — battle-tested, flexible. Bring your own cert or
                  use the bundled certbot helper. Best if you already run
                  nginx for other services.

    ${BOLD}3) Traefik${NC}  — modern, label-based routing. Auto HTTPS via
                  Let's Encrypt. Best for multi-service setups.

    ${BOLD}4) None${NC}     — Slipway on http://<server>:8080, no TLS.
                  Use this if you already have an external reverse proxy
                  or only need local access.

EOF
    while true; do
        read -rp "Pick [1-4]: " choice
        case "$choice" in
            1) PROXY="caddy"; break ;;
            2) PROXY="nginx"; break ;;
            3) PROXY="traefik"; break ;;
            4) PROXY="none"; break ;;
            *) warn "Please enter 1, 2, 3, or 4." ;;
        esac
    done
fi

if [[ -z "$DOMAIN" && "$PROXY" != "none" ]]; then
    header "Domain"
    cat <<EOF

  Enter the public hostname that will point at this server.
  Make sure the DNS A record is already configured before continuing.

  Example: slipway.example.com

EOF
    while true; do
        read -rp "Domain: " DOMAIN
        if [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
            break
        fi
        warn "That doesn't look like a valid hostname. Try again."
    done
fi

if [[ -z "$EMAIL" && ( "$PROXY" == "caddy" || "$PROXY" == "traefik" ) ]]; then
    header "Email for Let's Encrypt"
    cat <<EOF

  Let's Encrypt requires an email address for certificate expiry notices.

EOF
    if [[ -n "$DOMAIN" ]]; then
        read -rp "Email [admin@$DOMAIN]: " EMAIL
        EMAIL="${EMAIL:-admin@$DOMAIN}"
    else
        while true; do
            read -rp "Email: " EMAIL
            if [[ "$EMAIL" =~ @ ]]; then break; fi
            warn "That doesn't look like an email."
        done
    fi
fi

# Confirm admin password
header "Admin credentials"
cat <<EOF

  Slipway ships with default credentials ${BOLD}admin / admin${NC}.
  You can change them now or edit .env later.

EOF
if [[ "$PASSWORD" == "admin" ]]; then
    read -rp "Admin password [admin]: " input_password
    PASSWORD="${input_password:-admin}"
    if [[ "$PASSWORD" == "admin" ]]; then
        warn "Using default password 'admin' — only safe for local testing."
    fi
fi
ok "Admin user: $ADMIN_USER"

# ----- write .env -----
header "Writing .env"

ENV_FILE=".env"
if [[ -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE exists — backing up to .env.bak"
    cp "$ENV_FILE" "$ENV_FILE.bak"
fi

cat > "$ENV_FILE" <<EOF
# =============================================================================
# Slipway — generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================

# Admin credentials
SLIPWAY_ADMIN_USER=$ADMIN_USER
SLIPWAY_ADMIN_PASSWORD=$PASSWORD

# Storage (inside the container — maps to the slipway-data volume)
SLIPWAY_DATA_DIR=/data

# Behind a reverse proxy? true for caddy/nginx/traefik, false for none
SLIPWAY_BEHIND_PROXY=$([[ "$PROXY" == "none" ]] && echo "false" || echo "true")

# Cluster identity
SLIPWAY_CLUSTER_ID=$CLUSTER_ID

# Timezone
TZ=$TIMEZONE
EOF

if [[ "$PROXY" != "none" ]]; then
    cat >> "$ENV_FILE" <<EOF

# Public domain (used by the reverse proxy configs)
SLIPWAY_DOMAIN=$DOMAIN
EOF
fi

if [[ "$PROXY" == "nginx" ]]; then
    cat >> "$ENV_FILE" <<EOF

# Nginx — set to true after running ./proxy/certbot-init.sh
SLIPWAY_ENABLE_TLS=false
EOF
fi

if [[ "$PROXY" == "caddy" || "$PROXY" == "traefik" ]]; then
    cat >> "$ENV_FILE" <<EOF

# Let's Encrypt
ACME_EMAIL=$EMAIL
EOF
fi

cat >> "$ENV_FILE" <<EOF

# Optional: SMTP for email notifications
# SMTP_URL=smtp://postmark@smtp.postmarkapp.com:587

# Optional: S3-compatible backup target
# SLIPWAY_BACKUP_S3_URL=https://s3.amazonaws.com
# SLIPWAY_BACKUP_S3_BUCKET=my-slipway-backups
# SLIPWAY_BACKUP_S3_ACCESS_KEY=...
# SLIPWAY_BACKUP_S3_SECRET_KEY=...
# SLIPWAY_BACKUP_S3_REGION=us-east-1
EOF

ok ".env written"

# ----- pick the compose command -----
COMPOSE_FILES=(-f docker-compose.yml)
case "$PROXY" in
    none)   COMPOSE_FILES+=(-f docker-compose.direct.yml) ;;
    caddy)  COMPOSE_FILES+=(-f docker-compose.caddy.yml) ;;
    nginx)  COMPOSE_FILES+=(-f docker-compose.nginx.yml) ;;
    traefik) COMPOSE_FILES+=(-f docker-compose.traefik.yml) ;;
esac

# ----- pull and start -----
header "Starting Slipway ($PROXY proxy)"

info "Pulling images"
docker compose "${COMPOSE_FILES[@]}" pull

info "Starting containers"
docker compose "${COMPOSE_FILES[@]}" up -d

# ----- wait for healthy -----
header "Waiting for Slipway to become healthy"
for i in {1..30}; do
    if docker compose "${COMPOSE_FILES[@]}" ps | grep -q "healthy"; then
        ok "Slipway is healthy"
        break
    fi
    printf "  · waiting… (%d/30)\n" "$i"
    sleep 2
done

# ----- final report -----
header "Done"
cat <<EOF

  Slipway is up. Open your dashboard at:

EOF

if [[ "$PROXY" == "none" ]]; then
    SERVER_IP="$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
    printf "    ${BOLD}http://%s:8080${NC}\n\n" "${SERVER_IP:-<server-ip>}"
else
    printf "    ${BOLD}https://%s${NC}\n\n" "$DOMAIN"
    cat <<EOF
  (If DNS hasn't propagated yet, HTTPS may take a few minutes to provision.
   Caddy/Traefik will retry automatically.)

EOF
fi

cat <<EOF
  Sign in with:
    Username: $ADMIN_USER
    Password: $PASSWORD

  Useful commands:
    View logs:        docker compose ${COMPOSE_FILES[*]} logs -f
    Stop:             docker compose ${COMPOSE_FILES[*]} down
    Restart:          docker compose ${COMPOSE_FILES[*]} restart
    Update:           docker compose ${COMPOSE_FILES[*]} pull && docker compose ${COMPOSE_FILES[*]} up -d

EOF

if [[ "$PROXY" == "nginx" ]]; then
    cat <<EOF
  To enable HTTPS for nginx, run:
    ./proxy/certbot-init.sh $DOMAIN ${EMAIL:-admin@$DOMAIN}

EOF
fi

ok "Install complete."
