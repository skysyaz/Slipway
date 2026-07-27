#!/usr/bin/env bash
# =============================================================================
# certbot-init.sh — provision a Let's Encrypt cert for Slipway's nginx
# =============================================================================
# Usage:
#   ./proxy/certbot-init.sh slipway.example.com you@email.com
#
# This script:
#   1. Starts nginx in HTTP-only mode (so certbot can verify the domain)
#   2. Runs certbot to get a cert into ./proxy/certs/
#   3. Sets SLIPWAY_ENABLE_TLS=true in .env
#   4. Restarts nginx with HTTPS enabled
#
# Prerequisites:
#   • SLIPWAY_DOMAIN must point at this server's public IP
#   • Port 80 must be reachable from the internet
#   • docker compose already running with the nginx profile
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-admin@${DOMAIN:-example.com}}"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: $0 <domain> [email]"
    echo "Example: $0 slipway.example.com you@email.com"
    exit 1
fi

CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$CERT_DIR"

echo "→ Provisioning cert for $DOMAIN (email: $EMAIL)"

# Step 1: ensure nginx is running in HTTP-only mode
if ! grep -q "SLIPWAY_ENABLE_TLS=false" .env 2>/dev/null; then
    echo "  · Setting SLIPWAY_ENABLE_TLS=false in .env"
    sed -i.bak 's/SLIPWAY_ENABLE_TLS=.*/SLIPWAY_ENABLE_TLS=false/' .env || echo "SLIPWAY_ENABLE_TLS=false" >> .env
fi

echo "  · Restarting nginx in HTTP-only mode"
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d nginx

sleep 3

# Step 2: run certbot
echo "  · Running certbot"
docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -v "$CERT_DIR/www:/var/www/certbot" \
    --network slipway-net \
    certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN"

# Step 3: copy certs to where nginx expects them
echo "  · Copying certs to ./proxy/certs/"
cp "$CERT_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
cp "$CERT_DIR/live/$DOMAIN/privkey.pem" "$CERT_DIR/privkey.pem"

# Step 4: enable TLS and restart nginx
echo "  · Enabling TLS in nginx config"
sed -i.bak 's/SLIPWAY_ENABLE_TLS=.*/SLIPWAY_ENABLE_TLS=true/' .env

# Uncomment the TLS-related lines in nginx.conf
NGINX_CONF="proxy/nginx.conf"
sed -i.bak 's/^#\(.*ssl_certificate\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*ssl_protocols\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*ssl_ciphers\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*ssl_prefer_server_ciphers\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*ssl_session\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*ssl_stapling\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*add_header Strict-Transport\)/\1/' "$NGINX_CONF"
sed -i.bak 's/^#\(.*if (\${SLIPWAY_ENABLE_TLS}\)/\1/' "$NGINX_CONF"

echo "  · Restarting nginx with TLS"
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --force-recreate nginx

echo ""
echo "✓ Done. Slipway is now available at https://$DOMAIN"
echo "  Cert auto-renews via certbot. Add this cron to renew:"
echo "    0 3 * * * cd $(pwd) && docker run --rm -v $(pwd)/proxy/certs:/etc/letsencrypt -v $(pwd)/proxy/certs/www:/var/www/certbot certbot/certbot renew && docker compose -f docker-compose.yml -f docker-compose.nginx.yml exec nginx nginx -s reload"
