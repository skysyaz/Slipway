# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json bun.lock* ./
COPY prisma ./prisma

RUN bun install

COPY . .

RUN bunx prisma generate && bun run build

FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXTAUTH_SECRET=slipway-secret-change-in-production-abc123
ENV NEXTAUTH_URL=https://slipway.skysyaz.my
ENV AUTH_SECRET=slipway-secret-change-in-production-abc123
ENV AUTH_URL=https://slipway.skysyaz.my
ENV SLIPWAY_ADMIN_USER=admin
ENV SLIPWAY_ADMIN_PASSWORD=admin
ENV SLIPWAY_DATA_DIR=/data
ENV SLIPWAY_BEHIND_PROXY=false
ENV DATABASE_URL=file:/data/slipway.db

RUN apk add --no-cache wget

# ponytail: run as root. The container mounts /var/run/docker.sock (root:root)
# so slipway can orchestrate host containers via dockerode; a non-root user gets
# EACCES on the socket -> "docker engine unavailable" for every deploy/db/scan.
# A socket-mounted container is already root-equivalent on the host, so dropping
# privileges here buys nothing and breaks the core feature.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/lib/db.ts ./src/lib/db.ts
# ponytail: Bun's node_modules layout breaks Next's output-file-tracing, which
# omits next-auth/otplib/qrcode (and their deps) from standalone — every
# /api/auth/* route then fails to load and 404s, so login is impossible.
# Overlay the full builder node_modules to end the whack-a-mole (the previous
# bcryptjs-only copy was the same bug). Same alpine-musl base, so native addons
# stay compatible. Upgrade path: build with npm ci so nft traces correctly.
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /data

USER root
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD bunx prisma@6 db push --accept-data-loss && bun prisma/seed.ts && bun server.js