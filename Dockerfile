# syntax=docker/dockerfile:1.7

# =============================================================================
# Build stage — compile the Next.js standalone bundle
# =============================================================================
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Install OS deps for sharp / prisma native bits
RUN apk add --no-cache libc6-compat python3 make g++

# Copy lockfile + package.json first for cache-friendly installs
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install dependencies (including devDependencies for the build)
RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the standalone production bundle
RUN bun run build

# =============================================================================
# Runner stage — minimal image that runs the standalone server
# =============================================================================
FROM oven/bun:1.1-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Default admin credentials — OVERRIDE IN PRODUCTION via env vars or .env file
ENV SLIPWAY_ADMIN_USER=admin
ENV SLIPWAY_ADMIN_PASSWORD=admin
ENV SLIPWAY_DATA_DIR=/data
ENV SLIPWAY_BEHIND_PROXY=false

# Create a non-root user
RUN addgroup -S slipway && adduser -S slipway -G slipway

# Install wget for the healthcheck
RUN apk add --no-cache wget

# Copy the standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/public ./public

# Persist Slipway data (SQLite DB, certs, uploaded artifacts)
RUN mkdir -p /data && chown -R slipway:slipway /data /app

USER slipway
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["bun", "server.js"]
