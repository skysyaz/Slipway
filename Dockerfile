# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json bun.lock* ./
COPY prisma ./prisma

RUN bun install

COPY . .

RUN bun run build

FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SLIPWAY_ADMIN_USER=admin
ENV SLIPWAY_ADMIN_PASSWORD=admin
ENV SLIPWAY_DATA_DIR=/data
ENV SLIPWAY_BEHIND_PROXY=false

RUN addgroup -S slipway && adduser -S slipway -G slipway

RUN apk add --no-cache wget

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/public ./public

RUN mkdir -p /data && chown -R slipway:slipway /data /app

USER slipway
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["bun", "server.js"]
