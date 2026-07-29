'use client'

import * as React from 'react'

export function SlipwayMark({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="slipway-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="oklch(0.78 0.17 158)" />
          <stop offset="1" stopColor="oklch(0.62 0.18 162)" />
        </linearGradient>
      </defs>
      {/* rounded tile */}
      <rect width="32" height="32" rx="8" fill="url(#slipway-grad)" />
      {/* slipway ramp + ship — abstract mark */}
      <path
        d="M7 21.5L18.5 10C19.4 9.1 20.9 9.1 21.8 10L23.5 11.7C24.4 12.6 24.4 14.1 23.5 15L12 26.5"
        stroke="oklch(0.16 0.01 240)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="23.5" r="2" fill="oklch(0.16 0.01 240)" />
      <path
        d="M16.5 7.5L19 5L21.5 7.5"
        stroke="oklch(0.16 0.01 240)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StackGlyph({ stack, size = 18 }: { stack: string; size?: number }) {
  // simple text-based badge for stacks — keeps things dependency-free
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    nextjs: { label: 'N', bg: 'oklch(0.16 0.005 240)', fg: 'oklch(0.98 0 0)' },
    node: { label: '⬢', bg: 'oklch(0.65 0.18 140)', fg: 'oklch(0.16 0.005 240)' },
    python: { label: 'py', bg: 'oklch(0.7 0.15 230)', fg: 'oklch(0.16 0.005 240)' },
    go: { label: 'Go', bg: 'oklch(0.78 0.16 70)', fg: 'oklch(0.16 0.005 240)' },
    rust: { label: 'R', bg: 'oklch(0.65 0.18 30)', fg: 'oklch(0.98 0 0)' },
    ruby: { label: 'rb', bg: 'oklch(0.62 0.22 25)', fg: 'oklch(0.98 0 0)' },
    php: { label: 'php', bg: 'oklch(0.65 0.18 280)', fg: 'oklch(0.98 0 0)' },
    static: { label: '◇', bg: 'oklch(0.6 0.05 240)', fg: 'oklch(0.98 0 0)' },
    dockerfile: { label: '🐳', bg: 'oklch(0.7 0.15 230)', fg: 'oklch(0.16 0.005 240)' },
    compose: { label: '🐳', bg: 'oklch(0.7 0.15 230)', fg: 'oklch(0.16 0.005 240)' },
    bun: { label: 'Bun', bg: 'oklch(0.78 0.16 70)', fg: 'oklch(0.16 0.005 240)' },
    deno: { label: 'D', bg: 'oklch(0.7 0.05 80)', fg: 'oklch(0.16 0.005 240)' },
    elixir: { label: 'ex', bg: 'oklch(0.65 0.22 300)', fg: 'oklch(0.98 0 0)' },
    dotnet: { label: '.N', bg: 'oklch(0.65 0.18 250)', fg: 'oklch(0.98 0 0)' },
  }
  const m = map[stack] ?? { label: stack.slice(0, 2), bg: 'oklch(0.6 0.05 240)', fg: 'oklch(0.98 0 0)' }
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.22),
        background: m.bg,
        color: m.fg,
        fontSize: size * 0.5,
        fontWeight: 700,
        fontFamily: stack === 'compose' || stack === 'dockerfile' ? 'system-ui' : 'var(--font-geist-mono)',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {m.label}
    </span>
  )
}

export function DbGlyph({ kind, size = 18 }: { kind: string; size?: number }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    postgres: { label: 'PG', bg: 'oklch(0.65 0.18 250)', fg: 'oklch(0.98 0 0)' },
    mysql: { label: 'SQL', bg: 'oklch(0.7 0.15 230)', fg: 'oklch(0.16 0.005 240)' },
    mariadb: { label: 'M', bg: 'oklch(0.65 0.2 25)', fg: 'oklch(0.98 0 0)' },
    mongodb: { label: 'M', bg: 'oklch(0.7 0.18 140)', fg: 'oklch(0.16 0.005 240)' },
    redis: { label: 'R', bg: 'oklch(0.65 0.22 25)', fg: 'oklch(0.98 0 0)' },
    valkey: { label: 'V', bg: 'oklch(0.65 0.22 25)', fg: 'oklch(0.98 0 0)' },
    sqlite: { label: 'SQ', bg: 'oklch(0.7 0.12 220)', fg: 'oklch(0.16 0.005 240)' },
    mssql: { label: 'MS', bg: 'oklch(0.6 0.18 250)', fg: 'oklch(0.98 0 0)' },
  }
  const m = map[kind] ?? { label: kind.slice(0, 2), bg: 'oklch(0.6 0.05 240)', fg: 'oklch(0.98 0 0)' }
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.22),
        background: m.bg,
        color: m.fg,
        fontSize: size * 0.45,
        fontWeight: 700,
        fontFamily: 'var(--font-geist-mono)',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {m.label}
    </span>
  )
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; pulse?: boolean }> = {
    running: { color: 'oklch(0.7 0.17 158)', label: 'Running' },
    healthy: { color: 'oklch(0.7 0.17 158)', label: 'Healthy' },
    online: { color: 'oklch(0.7 0.17 158)', label: 'Online' },
    active: { color: 'oklch(0.7 0.17 158)', label: 'Active' },
    completed: { color: 'oklch(0.7 0.17 158)', label: 'Completed' },
    building: { color: 'oklch(0.78 0.16 70)', label: 'Building', pulse: true },
    deploying: { color: 'oklch(0.78 0.16 70)', label: 'Deploying', pulse: true },
    queued: { color: 'oklch(0.6 0.02 240)', label: 'Queued' },
    scheduled: { color: 'oklch(0.6 0.02 240)', label: 'Scheduled' },
    stopped: { color: 'oklch(0.55 0.02 240)', label: 'Stopped' },
    degraded: { color: 'oklch(0.78 0.16 70)', label: 'Degraded' },
    restarting: { color: 'oklch(0.78 0.16 70)', label: 'Restarting', pulse: true },
    warning: { color: 'oklch(0.78 0.16 70)', label: 'Warning' },
    pending: { color: 'oklch(0.78 0.16 70)', label: 'Pending' },
    'action-required': { color: 'oklch(0.78 0.16 70)', label: 'Action required' },
    failed: { color: 'oklch(0.65 0.22 25)', label: 'Failed' },
    rolled_back: { color: 'oklch(0.6 0.06 280)', label: 'Rolled back' },
    offline: { color: 'oklch(0.55 0.02 240)', label: 'Offline' },
    cancelled: { color: 'oklch(0.55 0.02 240)', label: 'Cancelled' },
  }
  const m = map[status] ?? { color: 'oklch(0.6 0.02 240)', label: status }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={m.pulse ? 'pulse-dot' : ''}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: m.color,
          display: 'inline-block',
          boxShadow: `0 0 0 3px oklch(from ${m.color} l c h / 0.18)`,
        }}
      />
      <span className="text-xs text-muted-foreground">{m.label}</span>
    </span>
  )
}
