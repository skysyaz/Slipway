import type {
  Project,
  Deployment,
  DatabaseInstance,
  Volume,
  Server,
  BackupRecord,
  Notification,
  ActivityEvent,
  Service,
  Domain,
} from './types'

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString()

export const servers: Server[] = [
  {
    id: 'srv-1',
    name: 'fra1-manager',
    hostname: 'fra1.slipway.run',
    ip: '188.42.13.7',
    role: 'manager',
    status: 'online',
    os: 'Ubuntu 24.04 LTS',
    cpuCores: 8,
    memoryGb: 32,
    diskGb: 480,
    diskUsedGb: 184,
    dockerVersion: '27.3.1',
    region: 'eu-fra1',
    uptimeHours: 1382,
  },
  {
    id: 'srv-2',
    name: 'fra1-worker-01',
    hostname: 'worker-01.fra1.slipway.run',
    ip: '188.42.13.18',
    role: 'worker',
    status: 'online',
    os: 'Debian 12',
    cpuCores: 8,
    memoryGb: 32,
    diskGb: 480,
    diskUsedGb: 142,
    dockerVersion: '27.3.1',
    region: 'eu-fra1',
    uptimeHours: 712,
  },
  {
    id: 'srv-3',
    name: 'fra1-worker-02',
    hostname: 'worker-02.fra1.slipway.run',
    ip: '188.42.13.19',
    role: 'worker',
    status: 'degraded',
    os: 'Debian 12',
    cpuCores: 4,
    memoryGb: 16,
    diskGb: 240,
    diskUsedGb: 201,
    dockerVersion: '27.3.1',
    region: 'eu-fra1',
    uptimeHours: 96,
  },
  {
    id: 'srv-4',
    name: 'sg1-standalone',
    hostname: 'sg1.slipway.run',
    ip: '139.180.21.44',
    role: 'standalone',
    status: 'online',
    os: 'Rocky Linux 9',
    cpuCores: 4,
    memoryGb: 16,
    diskGb: 200,
    diskUsedGb: 67,
    dockerVersion: '27.2.0',
    region: 'ap-sg1',
    uptimeHours: 2415,
  },
]

function svc(over: Partial<Service>): Service {
  return {
    id: 'svc-' + Math.random().toString(36).slice(2, 9),
    name: 'web',
    kind: 'app',
    status: 'running',
    image: 'slipway/app:latest',
    replicas: 1,
    memoryMb: 256,
    cpuMilli: 250,
    uptimeSeconds: 86_400 * 3 + 14_321,
    restarts: 0,
    ...over,
  }
}

const domainsFor = (projectId: string, slug: string, env: 'production' | 'staging' | 'preview'): Domain[] => {
  const base: Domain[] = [
    {
      id: `dom-${projectId}-1`,
      hostname: `${slug}.slipway.app`,
      projectId,
      type: 'primary',
      ssl: 'managed',
      sslExpiry: new Date(now + 1000 * 60 * 60 * 24 * 73).toISOString(),
      https: true,
      status: 'active',
    },
  ]
  if (env === 'production') {
    base.push({
      id: `dom-${projectId}-2`,
      hostname: `${slug}.com`,
      projectId,
      type: 'primary',
      ssl: 'managed',
      sslExpiry: new Date(now + 1000 * 60 * 60 * 24 * 47).toISOString(),
      https: true,
      status: 'active',
    })
    base.push({
      id: `dom-${projectId}-3`,
      hostname: `api.${slug}.com`,
      projectId,
      type: 'api',
      ssl: 'managed',
      sslExpiry: new Date(now + 1000 * 60 * 60 * 24 * 47).toISOString(),
      https: true,
      status: 'active',
    })
  } else if (env === 'staging') {
    base.push({
      id: `dom-${projectId}-2`,
      hostname: `staging.${slug}.slipway.app`,
      projectId,
      type: 'primary',
      ssl: 'managed',
      https: true,
      status: 'active',
    })
  } else {
    base[0].hostname = `${slug}-pr-248.${slug}.slipway.app`
    base[0].type = 'preview'
  }
  return base
}

export const projects: Project[] = [
  {
    id: 'prj-api',
    name: 'Helix API',
    slug: 'helix-api',
    source: 'git',
    repoUrl: 'github.com/helixco/api',
    stack: 'node',
    stackLabel: 'Node.js · Fastify · Prisma',
    framework: 'Fastify',
    environment: 'production',
    status: 'running',
    lastDeployedAt: ago(34),
    url: 'https://helix-api.slipway.app',
    description: 'Public REST + tRPC API powering the Helix web and mobile clients.',
    services: [
      svc({ name: 'api', kind: 'app', image: 'ghcr.io/helixco/api:sha-9f3a1c', port: 3000, replicas: 3, memoryMb: 512, cpuMilli: 500 }),
      svc({ name: 'worker', kind: 'worker', image: 'ghcr.io/helixco/worker:sha-9f3a1c', replicas: 2, memoryMb: 384, cpuMilli: 300 }),
      svc({ name: 'scheduler', kind: 'cron', image: 'ghcr.io/helixco/scheduler:sha-9f3a1c', replicas: 1, memoryMb: 128, cpuMilli: 100 }),
    ],
    domains: domainsFor('prj-api', 'helix-api', 'production'),
    envVarsCount: 24,
    monthlyDeploys: 87,
    successRate: 98.4,
    region: 'eu-fra1',
    memoryMb: 1024,
    cpuMilli: 900,
    replicas: 3,
    monorepo: true,
    monorepoPath: 'apps/api',
  },
  {
    id: 'prj-web',
    name: 'Helix Web',
    slug: 'helix-web',
    source: 'git',
    repoUrl: 'github.com/helixco/web',
    stack: 'nextjs',
    stackLabel: 'Next.js 16 · App Router · Tailwind',
    framework: 'Next.js',
    environment: 'production',
    status: 'running',
    lastDeployedAt: ago(118),
    url: 'https://helix-web.slipway.app',
    description: 'Marketing site + customer dashboard. ISR + edge functions.',
    services: [
      svc({ name: 'web', kind: 'app', image: 'ghcr.io/helixco/web:sha-2b71e9', port: 3000, replicas: 2, memoryMb: 512, cpuMilli: 400 }),
    ],
    domains: domainsFor('prj-web', 'helix-web', 'production'),
    envVarsCount: 18,
    monthlyDeploys: 142,
    successRate: 99.6,
    region: 'eu-fra1',
    memoryMb: 512,
    cpuMilli: 400,
    replicas: 2,
    monorepo: true,
    monorepoPath: 'apps/web',
  },
  {
    id: 'prj-billing',
    name: 'Billing Worker',
    slug: 'billing-worker',
    source: 'git',
    repoUrl: 'github.com/helixco/billing',
    stack: 'python',
    stackLabel: 'Python 3.12 · FastAPI · Arq',
    framework: 'FastAPI',
    environment: 'production',
    status: 'degraded',
    lastDeployedAt: ago(340),
    url: undefined,
    description: 'Async billing worker: invoicing, dunning, Stripe webhooks.',
    services: [
      svc({ name: 'worker', kind: 'worker', image: 'ghcr.io/helixco/billing:sha-71d0a3', status: 'degraded', replicas: 2, memoryMb: 384, cpuMilli: 350, restarts: 3 }),
      svc({ name: 'api', kind: 'app', image: 'ghcr.io/helixco/billing-api:sha-71d0a3', port: 8000, replicas: 1, memoryMb: 256, cpuMilli: 200 }),
    ],
    domains: domainsFor('prj-billing', 'billing-worker', 'production'),
    envVarsCount: 12,
    monthlyDeploys: 34,
    successRate: 91.2,
    region: 'eu-fra1',
    memoryMb: 640,
    cpuMilli: 550,
    replicas: 3,
  },
  {
    id: 'prj-analytics',
    name: 'Analytics Ingest',
    slug: 'analytics-ingest',
    source: 'git',
    repoUrl: 'github.com/helixco/analytics',
    stack: 'go',
    stackLabel: 'Go 1.23 · Chi · pgx',
    framework: 'Chi',
    environment: 'production',
    status: 'running',
    lastDeployedAt: ago(720),
    url: 'https://analytics-ingest.slipway.app',
    description: 'High-throughput event ingest service writing to ClickHouse.',
    services: [
      svc({ name: 'ingest', kind: 'app', image: 'ghcr.io/helixco/analytics:sha-9c4412', port: 8080, replicas: 4, memoryMb: 256, cpuMilli: 600 }),
    ],
    domains: domainsFor('prj-analytics', 'analytics-ingest', 'production'),
    envVarsCount: 9,
    monthlyDeploys: 56,
    successRate: 99.9,
    region: 'eu-fra1',
    memoryMb: 1024,
    cpuMilli: 2400,
    replicas: 4,
  },
  {
    id: 'prj-status',
    name: 'Status Page',
    slug: 'status-page',
    source: 'folder',
    folderPath: '/srv/projects/status',
    stack: 'static',
    stackLabel: 'Static · Astro · MDX',
    framework: 'Astro',
    environment: 'production',
    status: 'running',
    lastDeployedAt: ago(1820),
    url: 'https://status.slipway.app',
    description: 'Public status page. Built from a folder, deployed as static assets.',
    services: [
      svc({ name: 'web', kind: 'app', image: 'nginx:1.27-alpine', port: 80, replicas: 2, memoryMb: 64, cpuMilli: 50 }),
    ],
    domains: domainsFor('prj-status', 'status-page', 'production'),
    envVarsCount: 4,
    monthlyDeploys: 12,
    successRate: 100,
    region: 'eu-fra1',
    memoryMb: 128,
    cpuMilli: 100,
    replicas: 2,
  },
  {
    id: 'prj-ml',
    name: 'Recommendation Engine',
    slug: 'rec-engine',
    source: 'git',
    repoUrl: 'github.com/helixco/rec-engine',
    stack: 'python',
    stackLabel: 'Python 3.12 · PyTorch · Celery',
    framework: 'Celery',
    environment: 'staging',
    status: 'running',
    lastDeployedAt: ago(64),
    url: 'https://staging.rec-engine.slipway.app',
    description: 'Batch + real-time recommendation. Staging while we A/B test v3.',
    services: [
      svc({ name: 'worker', kind: 'worker', image: 'ghcr.io/helixco/rec-engine:sha-7a9f02', replicas: 2, memoryMb: 2048, cpuMilli: 1500 }),
      svc({ name: 'beat', kind: 'cron', image: 'ghcr.io/helixco/rec-beat:sha-7a9f02', replicas: 1, memoryMb: 128, cpuMilli: 100 }),
    ],
    domains: domainsFor('prj-ml', 'rec-engine', 'staging'),
    envVarsCount: 16,
    monthlyDeploys: 41,
    successRate: 94.7,
    region: 'eu-fra1',
    memoryMb: 2176,
    cpuMilli: 1600,
    replicas: 3,
  },
  {
    id: 'prj-legacy',
    name: 'Legacy CRM',
    slug: 'legacy-crm',
    source: 'compose',
    stack: 'compose',
    stackLabel: 'Docker Compose · 6 services',
    framework: 'Compose',
    environment: 'production',
    status: 'running',
    lastDeployedAt: ago(4320),
    url: 'https://crm.slipway.app',
    description: 'Existing docker-compose.yml lifted onto Slipway with zero code changes.',
    services: [
      svc({ name: 'app', kind: 'app', image: 'registry.slipway.run/legacy-crm/app:latest', port: 8080, replicas: 1, memoryMb: 512, cpuMilli: 400 }),
      svc({ name: 'cron', kind: 'cron', image: 'registry.slipway.run/legacy-crm/cron:latest', replicas: 1, memoryMb: 64, cpuMilli: 50 }),
    ],
    domains: domainsFor('prj-legacy', 'legacy-crm', 'production'),
    envVarsCount: 22,
    monthlyDeploys: 8,
    successRate: 100,
    region: 'ap-sg1',
    memoryMb: 576,
    cpuMilli: 450,
    replicas: 2,
  },
  {
    id: 'prj-pr-248',
    name: 'Helix Web · PR #248',
    slug: 'helix-web-pr-248',
    source: 'git',
    repoUrl: 'github.com/helixco/web',
    stack: 'nextjs',
    stackLabel: 'Next.js 16 · preview',
    framework: 'Next.js',
    environment: 'preview',
    status: 'running',
    lastDeployedAt: ago(8),
    url: 'https://helix-web-pr-248.slipway.app',
    description: 'Preview environment for PR #248 — fix checkout redirect on iOS Safari.',
    services: [
      svc({ name: 'web', kind: 'app', image: 'ghcr.io/helixco/web:sha-fa82c1', port: 3000, replicas: 1, memoryMb: 256, cpuMilli: 200 }),
    ],
    domains: domainsFor('prj-pr-248', 'helix-web', 'preview'),
    envVarsCount: 18,
    monthlyDeploys: 1,
    successRate: 100,
    region: 'eu-fra1',
    memoryMb: 256,
    cpuMilli: 200,
    replicas: 1,
  },
]

function stepsFactory(statuses: Array<{ stage: any; status: any; dur?: number }>) {
  let t = now - 1000 * 60 * 5
  return statuses.map((s, i) => {
    const started = t
    const dur = s.dur ?? 8_000 + Math.random() * 30_000
    t += dur
    return {
      stage: s.stage,
      label: stageLabel(s.stage),
      status: s.status,
      startedAt: new Date(started).toISOString(),
      finishedAt: s.status === 'building' || s.status === 'deploying' || s.status === 'queued' ? undefined : new Date(started + dur).toISOString(),
      durationMs: dur,
      logLines: 40 + Math.floor(Math.random() * 220),
    }
  })
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    queued: 'Queued',
    checkout: 'Checkout',
    detect: 'Detect stack',
    install: 'Install deps',
    build: 'Build',
    test: 'Tests',
    image: 'Build image',
    push: 'Push image',
    release: 'Release',
    verify: 'Health check',
    live: 'Live',
  }
  return map[stage] ?? stage
}

function mkDeployment(p: Project, minsAgo: number, status: Deployment['status'], branch: string, msg: string, sha: string): Deployment {
  const created = ago(minsAgo)
  let steps: Deployment['steps'] = []
  if (status === 'healthy') {
    steps = stepsFactory([
      { stage: 'queued', status: 'healthy', dur: 2_000 },
      { stage: 'checkout', status: 'healthy', dur: 6_000 },
      { stage: 'detect', status: 'healthy', dur: 4_000 },
      { stage: 'install', status: 'healthy', dur: 24_000 },
      { stage: 'build', status: 'healthy', dur: 38_000 },
      { stage: 'test', status: 'healthy', dur: 21_000 },
      { stage: 'image', status: 'healthy', dur: 18_000 },
      { stage: 'push', status: 'healthy', dur: 12_000 },
      { stage: 'release', status: 'healthy', dur: 9_000 },
      { stage: 'verify', status: 'healthy', dur: 8_000 },
      { stage: 'live', status: 'healthy', dur: 1_000 },
    ])
  } else if (status === 'failed') {
    steps = stepsFactory([
      { stage: 'queued', status: 'healthy', dur: 2_000 },
      { stage: 'checkout', status: 'healthy', dur: 6_000 },
      { stage: 'detect', status: 'healthy', dur: 4_000 },
      { stage: 'install', status: 'healthy', dur: 22_000 },
      { stage: 'build', status: 'healthy', dur: 35_000 },
      { stage: 'test', status: 'failed', dur: 14_000 },
      { stage: 'image', status: 'cancelled' },
      { stage: 'push', status: 'cancelled' },
      { stage: 'release', status: 'cancelled' },
      { stage: 'verify', status: 'cancelled' },
      { stage: 'live', status: 'cancelled' },
    ])
  } else if (status === 'building') {
    steps = stepsFactory([
      { stage: 'queued', status: 'healthy', dur: 2_000 },
      { stage: 'checkout', status: 'healthy', dur: 6_000 },
      { stage: 'detect', status: 'healthy', dur: 4_000 },
      { stage: 'install', status: 'healthy', dur: 22_000 },
      { stage: 'build', status: 'building' },
      { stage: 'test', status: 'queued' },
      { stage: 'image', status: 'queued' },
      { stage: 'push', status: 'queued' },
      { stage: 'release', status: 'queued' },
      { stage: 'verify', status: 'queued' },
      { stage: 'live', status: 'queued' },
    ])
  } else if (status === 'deploying') {
    steps = stepsFactory([
      { stage: 'queued', status: 'healthy', dur: 2_000 },
      { stage: 'checkout', status: 'healthy', dur: 6_000 },
      { stage: 'detect', status: 'healthy', dur: 4_000 },
      { stage: 'install', status: 'healthy', dur: 22_000 },
      { stage: 'build', status: 'healthy', dur: 38_000 },
      { stage: 'test', status: 'healthy', dur: 21_000 },
      { stage: 'image', status: 'healthy', dur: 18_000 },
      { stage: 'push', status: 'healthy', dur: 12_000 },
      { stage: 'release', status: 'deploying' },
      { stage: 'verify', status: 'queued' },
      { stage: 'live', status: 'queued' },
    ])
  } else if (status === 'rolled_back') {
    steps = stepsFactory([
      { stage: 'queued', status: 'healthy', dur: 1_000 },
      { stage: 'release', status: 'healthy', dur: 4_000 },
      { stage: 'verify', status: 'healthy', dur: 5_000 },
      { stage: 'live', status: 'healthy', dur: 1_000 },
    ])
  } else if (status === 'cancelled') {
    steps = stepsFactory([
      { stage: 'queued', status: 'cancelled' },
      { stage: 'checkout', status: 'cancelled' },
      { stage: 'detect', status: 'cancelled' },
      { stage: 'install', status: 'cancelled' },
      { stage: 'build', status: 'cancelled' },
    ])
  }
  const totalDur = steps.reduce((a, s) => a + (s.durationMs ?? 0), 0)
  return {
    id: 'dep-' + Math.random().toString(36).slice(2, 9),
    projectId: p.id,
    projectName: p.name,
    commitSha: sha,
    commitMessage: msg,
    branch,
    author: ['mira.k', 'tomas', 'lina', 'jules', 'sven'][Math.floor(Math.random() * 5)],
    environment: p.environment,
    status,
    createdAt: created,
    finishedAt: status === 'building' || status === 'deploying' || status === 'queued' ? undefined : new Date(new Date(created).getTime() + totalDur).toISOString(),
    durationMs: totalDur,
    steps,
    url: status === 'healthy' ? p.url : undefined,
  }
}

export const deployments: Deployment[] = [
  mkDeployment(projects[7], 4, 'building', 'fix/checkout-redirect', 'fix: redirect after Stripe checkout on iOS Safari', 'fa82c1a'),
  mkDeployment(projects[0], 34, 'healthy', 'main', 'feat(api): add /v2/customers endpoint with cursor pagination', '9f3a1c2'),
  mkDeployment(projects[0], 88, 'healthy', 'main', 'chore: bump prisma to 6.11', 'b2ce014'),
  mkDeployment(projects[1], 118, 'healthy', 'main', 'feat(web): new pricing table + annual toggle', '2b71e9d'),
  mkDeployment(projects[5], 64, 'healthy', 'feat/rec-v3', 'feat: switch to two-tower model with ANN index', '7a9f022'),
  mkDeployment(projects[2], 340, 'failed', 'main', 'feat: retry failed Stripe charges', '71d0a3f'),
  mkDeployment(projects[2], 312, 'healthy', 'main', 'fix: idempotency key collision on retries', '5ce12aa'),
  mkDeployment(projects[3], 720, 'healthy', 'main', 'perf: batch insert via COPY FROM STDIN', '9c44124'),
  mkDeployment(projects[0], 1440, 'rolled_back', 'main', 'feat: switch to new event bus (reverted)', '4d7e881'),
  mkDeployment(projects[6], 4320, 'healthy', 'main', 'chore: rotate database credentials', 'a1b2c3d'),
  mkDeployment(projects[4], 1820, 'healthy', 'main', 'content: Q3 incident retrospective', '7f8a9b0'),
  mkDeployment(projects[1], 22, 'deploying', 'feat/newsletter', 'feat: add newsletter signup with double opt-in', '3e09c44'),
]

export const databases: DatabaseInstance[] = [
  {
    id: 'db-1',
    name: 'helix-postgres',
    kind: 'postgres',
    version: '16.4',
    status: 'running',
    projectId: 'prj-api',
    host: 'pg-1.internal.slipway.run',
    port: 5432,
    storageGb: 80,
    usedGb: 42.7,
    connections: 38,
    maxConnections: 200,
    backupsEnabled: true,
    region: 'eu-fra1',
    createdAt: ago(60 * 24 * 198),
  },
  {
    id: 'db-2',
    name: 'helix-redis',
    kind: 'redis',
    version: '7.4',
    status: 'running',
    projectId: 'prj-api',
    host: 'redis-1.internal.slipway.run',
    port: 6379,
    storageGb: 4,
    usedGb: 1.2,
    connections: 142,
    maxConnections: 1000,
    backupsEnabled: true,
    region: 'eu-fra1',
    createdAt: ago(60 * 24 * 198),
  },
  {
    id: 'db-3',
    name: 'analytics-clickhouse',
    kind: 'postgres',
    version: '24.3',
    status: 'running',
    projectId: 'prj-analytics',
    host: 'ch-1.internal.slipway.run',
    port: 8123,
    storageGb: 240,
    usedGb: 178.4,
    connections: 12,
    maxConnections: 100,
    backupsEnabled: true,
    region: 'eu-fra1',
    createdAt: ago(60 * 24 * 421),
  },
  {
    id: 'db-4',
    name: 'legacy-mysql',
    kind: 'mysql',
    version: '8.0',
    status: 'running',
    projectId: 'prj-legacy',
    host: 'mysql-1.internal.slipway.run',
    port: 3306,
    storageGb: 60,
    usedGb: 38.9,
    connections: 24,
    maxConnections: 150,
    backupsEnabled: true,
    region: 'ap-sg1',
    createdAt: ago(60 * 24 * 612),
  },
  {
    id: 'db-5',
    name: 'rec-mongo',
    kind: 'mongodb',
    version: '7.0',
    status: 'running',
    projectId: 'prj-ml',
    host: 'mongo-1.internal.slipway.run',
    port: 27017,
    storageGb: 120,
    usedGb: 88.2,
    connections: 18,
    maxConnections: 200,
    backupsEnabled: true,
    region: 'eu-fra1',
    createdAt: ago(60 * 24 * 78),
  },
  {
    id: 'db-6',
    name: 'shared-redis',
    kind: 'valkey',
    version: '8.0',
    status: 'restarting',
    projectId: undefined,
    host: 'valkey-1.internal.slipway.run',
    port: 6379,
    storageGb: 8,
    usedGb: 2.4,
    connections: 0,
    maxConnections: 2000,
    backupsEnabled: false,
    region: 'eu-fra1',
    createdAt: ago(60 * 24 * 32),
  },
  {
    id: 'db-7',
    name: 'erp-mssql',
    kind: 'mssql',
    version: '2022 (16.x)',
    status: 'running',
    projectId: 'prj-legacy',
    host: 'mssql-1.internal.slipway.run',
    port: 1433,
    storageGb: 100,
    usedGb: 47.2,
    connections: 14,
    maxConnections: 200,
    backupsEnabled: true,
    region: 'ap-sg1',
    createdAt: ago(60 * 24 * 145),
  },
]

export const volumes: Volume[] = [
  { id: 'vol-1', name: 'helix-uploads', projectId: 'prj-api', mountPath: '/var/lib/uploads', sizeGb: 120, usedGb: 78.3, type: 'ssd', server: 'fra1-manager', encrypted: true },
  { id: 'vol-2', name: 'helix-logs', projectId: 'prj-api', mountPath: '/var/log/app', sizeGb: 50, usedGb: 12.4, type: 'hdd', server: 'fra1-worker-01', encrypted: true },
  { id: 'vol-3', name: 'analytics-buf', projectId: 'prj-analytics', mountPath: '/var/lib/buffer', sizeGb: 100, usedGb: 64.1, type: 'ssd', server: 'fra1-worker-02', encrypted: true },
  { id: 'vol-4', name: 'legacy-uploads', projectId: 'prj-legacy', mountPath: '/srv/uploads', sizeGb: 80, usedGb: 41.0, type: 'ssd', server: 'sg1-standalone', encrypted: false },
  { id: 'vol-5', name: 'shared-nfs', projectId: undefined, mountPath: '/exports/shared', sizeGb: 500, usedGb: 188.6, type: 'nfs', server: 'fra1-manager', encrypted: true },
  { id: 'vol-6', name: 'rec-checkpoints', projectId: 'prj-ml', mountPath: '/var/lib/checkpoints', sizeGb: 200, usedGb: 142.7, type: 'ssd', server: 'fra1-worker-01', encrypted: true },
]

export const backups: BackupRecord[] = [
  { id: 'bk-1', target: 'helix-postgres', targetKind: 'database', status: 'completed', sizeMb: 4312, startedAt: ago(36), durationMs: 42_000, schedule: '0 */6 * * *', retentionDays: 14, server: 'fra1-manager' },
  { id: 'bk-2', target: 'helix-redis', targetKind: 'database', status: 'completed', sizeMb: 88, startedAt: ago(36), durationMs: 4_200, schedule: '0 */6 * * *', retentionDays: 7, server: 'fra1-manager' },
  { id: 'bk-3', target: 'analytics-clickhouse', targetKind: 'database', status: 'running', sizeMb: 0, startedAt: ago(2), schedule: '0 3 * * *', retentionDays: 30, server: 'fra1-manager' },
  { id: 'bk-4', target: 'legacy-mysql', targetKind: 'database', status: 'completed', sizeMb: 3987, startedAt: ago(180), durationMs: 38_000, schedule: '0 2 * * *', retentionDays: 30, server: 'sg1-standalone' },
  { id: 'bk-5', target: 'helix-uploads', targetKind: 'volume', status: 'completed', sizeMb: 79_820, startedAt: ago(360), durationMs: 1_842_000, schedule: '0 1 * * 0', retentionDays: 90, server: 'fra1-manager' },
  { id: 'bk-6', target: 'rec-mongo', targetKind: 'database', status: 'failed', sizeMb: 0, startedAt: ago(420), durationMs: 18_000, schedule: '0 4 * * *', retentionDays: 14, server: 'fra1-manager' },
  { id: 'bk-7', target: 'helix-postgres', targetKind: 'database', status: 'scheduled', sizeMb: 0, startedAt: ago(-180), schedule: '0 */6 * * *', retentionDays: 14, server: 'fra1-manager' },
  { id: 'bk-8', target: 'legacy-uploads', targetKind: 'volume', status: 'completed', sizeMb: 41_002, startedAt: ago(720), durationMs: 942_000, schedule: '0 1 * * 0', retentionDays: 90, server: 'sg1-standalone' },
]

export const notifications: Notification[] = [
  { id: 'n-1', title: 'Deployment building', body: 'Helix Web · PR #248 — fa82c1a is building on eu-fra1.', level: 'info', ts: ago(4), read: false, kind: 'deploy' },
  { id: 'n-2', title: 'SSL renewed', body: 'helix-api.com certificate renewed via Let’s Encrypt. Valid until Oct 18.', level: 'success', ts: ago(78), read: false, kind: 'ssl' },
  { id: 'n-3', title: 'Worker degraded', body: 'billing-worker has restarted 3 times in the last hour. Memory pressure detected.', level: 'warning', ts: ago(122), read: false, kind: 'server' },
  { id: 'n-4', title: 'Backup completed', body: 'helix-postgres snapshot (4.2 GB) stored. 14 snapshots retained.', level: 'success', ts: ago(36), read: true, kind: 'backup' },
  { id: 'n-5', title: 'Disk usage 84%', body: 'fra1-worker-02 disk at 84%. Consider cleaning old images or expanding the volume.', level: 'warning', ts: ago(240), read: true, kind: 'server' },
  { id: 'n-6', title: 'Security patch available', body: 'Slipway 1.4.2 includes a security fix for the registry proxy. Update at your convenience.', level: 'info', ts: ago(720), read: true, kind: 'security' },
]

export const activity: ActivityEvent[] = [
  { id: 'a-1', ts: ago(4), actor: 'mira.k', kind: 'deploy', message: 'triggered deployment of Helix Web · PR #248 to preview', projectId: 'prj-pr-248' },
  { id: 'a-2', ts: ago(34), actor: 'tomas', kind: 'deploy', message: 'deployed Helix API 9f3a1c2 to production', projectId: 'prj-api' },
  { id: 'a-3', ts: ago(64), actor: 'lina', kind: 'deploy', message: 'promoted Recommendation Engine to staging', projectId: 'prj-ml' },
  { id: 'a-4', ts: ago(122), actor: 'system', kind: 'backup', message: 'auto-scheduled helix-postgres backup in 3 hours' },
  { id: 'a-5', ts: ago(180), actor: 'jules', kind: 'domain', message: 'added api.helix-api.com with managed SSL', projectId: 'prj-api' },
  { id: 'a-6', ts: ago(340), actor: 'tomas', kind: 'deploy', message: 'rolled back Helix API 4d7e881 to previous healthy release', projectId: 'prj-api' },
  { id: 'a-7', ts: ago(420), actor: 'system', kind: 'database', message: 'rec-mongo backup failed — disk pressure on fra1-manager' },
  { id: 'a-8', ts: ago(560), actor: 'sven', kind: 'env', message: 'updated STRIPE_WEBHOOK_SECRET on Helix API', projectId: 'prj-api' },
  { id: 'a-9', ts: ago(720), actor: 'jules', kind: 'server', message: 'connected fra1-worker-02 to the cluster' },
  { id: 'a-10', ts: ago(1440), actor: 'mira.k', kind: 'scale', message: 'scaled analytics-ingest from 3 → 4 replicas', projectId: 'prj-analytics' },
]

// Live log line generator — produces realistic deployment/runtime logs
const logTemplates: Array<{ level: 'info' | 'warn' | 'error' | 'debug' | 'system'; service: string; msg: string }> = [
  { level: 'info', service: 'api', msg: 'GET /v2/customers?cursor=eyJsYXN0SWQiOjE0fQ 200 in 14ms' },
  { level: 'info', service: 'api', msg: 'POST /v2/webhooks/stripe 200 in 38ms' },
  { level: 'debug', service: 'api', msg: 'cache hit: customer:42' },
  { level: 'info', service: 'api', msg: 'GET /v2/health 200 in 1ms' },
  { level: 'warn', service: 'worker', msg: 'retrying job invoice:generate:8842 (attempt 2/5)' },
  { level: 'info', service: 'worker', msg: 'processed job billing:dunning:run in 412ms' },
  { level: 'debug', service: 'api', msg: 'pg query: SELECT id, email FROM customers WHERE id = $1' },
  { level: 'info', service: 'api', msg: 'GET /v2/metrics 200 in 8ms' },
  { level: 'error', service: 'worker', msg: 'Stripe API timeout (10s) — will retry with backoff' },
  { level: 'info', service: 'web', msg: 'rendered /pricing in 86ms (ISR cache HIT)' },
  { level: 'info', service: 'web', msg: 'GET / 200 in 22ms' },
  { level: 'info', service: 'ingest', msg: 'batched 1,204 events to ClickHouse in 18ms' },
  { level: 'system', service: 'slipway', msg: 'health check passed for api (200 OK)' },
  { level: 'system', service: 'slipway', msg: 'rolling deployment 9f3a1c2 — 3/3 replicas ready' },
  { level: 'info', service: 'api', msg: 'POST /v2/auth/login 200 in 84ms' },
  { level: 'debug', service: 'api', msg: 'jwt issued for user=user_8f3a1c ttl=3600s' },
  { level: 'warn', service: 'api', msg: 'rate limit hit for ip=188.42.13.42 (429)' },
  { level: 'info', service: 'scheduler', msg: 'cron job cleanup:sessions completed in 1.4s' },
]

let logCounter = 0
export function nextLogLine() {
  const t = logTemplates[Math.floor(Math.random() * logTemplates.length)]
  logCounter += 1
  return {
    id: `log-${logCounter}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    level: t.level,
    service: t.service,
    message: t.msg,
  }
}

// Metric series — 60 points of data
function series(seed: number, base: number, variance: number, trend = 0) {
  const data: { t: number; v: number }[] = []
  for (let i = 60; i >= 0; i--) {
    const t = now - i * 60_000
    const noise = (Math.sin(i * 0.4 + seed) + Math.sin(i * 0.13 + seed * 2)) * variance
    const trendV = trend * (60 - i) * 0.1
    const v = Math.max(0, base + noise + trendV)
    data.push({ t, v: Math.round(v * 100) / 100 })
  }
  return data
}

export const metrics = {
  cpu: {
    name: 'CPU usage',
    data: series(1, 42, 14, 0.3),
  },
  memory: {
    name: 'Memory',
    data: series(2, 58, 8, 0.15),
  },
  networkIn: {
    name: 'Network in (Mb/s)',
    data: series(3, 22, 12),
  },
  networkOut: {
    name: 'Network out (Mb/s)',
    data: series(4, 18, 10),
  },
  requestsPerSec: {
    name: 'Requests / sec',
    data: series(5, 480, 120, -0.5),
  },
  p95Latency: {
    name: 'p95 latency (ms)',
    data: series(6, 84, 22),
  },
  deployFrequency: {
    name: 'Deploys / day',
    data: series(7, 14, 6, 0.2),
  },
  errorRate: {
    name: 'Error rate %',
    data: series(8, 0.4, 0.3),
  },
}

export function stackMeta(stack: string): { label: string; icon: string; color: string } {
  const map: Record<string, { label: string; icon: string; color: string }> = {
    nextjs: { label: 'Next.js', icon: 'nextjs', color: 'oklch(0.7 0.17 158)' },
    node: { label: 'Node.js', icon: 'node', color: 'oklch(0.7 0.18 140)' },
    python: { label: 'Python', icon: 'python', color: 'oklch(0.7 0.15 230)' },
    go: { label: 'Go', icon: 'go', color: 'oklch(0.78 0.16 70)' },
    rust: { label: 'Rust', icon: 'rust', color: 'oklch(0.65 0.18 30)' },
    ruby: { label: 'Ruby', icon: 'ruby', color: 'oklch(0.62 0.22 25)' },
    php: { label: 'PHP', icon: 'php', color: 'oklch(0.65 0.18 280)' },
    static: { label: 'Static', icon: 'static', color: 'oklch(0.6 0.05 240)' },
    dockerfile: { label: 'Dockerfile', icon: 'docker', color: 'oklch(0.7 0.15 230)' },
    compose: { label: 'Compose', icon: 'docker', color: 'oklch(0.7 0.15 230)' },
    bun: { label: 'Bun', icon: 'bun', color: 'oklch(0.78 0.16 70)' },
    deno: { label: 'Deno', icon: 'deno', color: 'oklch(0.7 0.05 80)' },
    elixir: { label: 'Elixir', icon: 'elixir', color: 'oklch(0.65 0.22 300)' },
    dotnet: { label: '.NET', icon: 'dotnet', color: 'oklch(0.65 0.18 250)' },
  }
  return map[stack] ?? { label: stack, icon: 'box', color: 'oklch(0.6 0.05 240)' }
}

export function dbMeta(kind: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    postgres: { label: 'PostgreSQL', color: 'oklch(0.65 0.18 250)' },
    mysql: { label: 'MySQL', color: 'oklch(0.7 0.15 230)' },
    mariadb: { label: 'MariaDB', color: 'oklch(0.65 0.2 25)' },
    mongodb: { label: 'MongoDB', color: 'oklch(0.7 0.18 140)' },
    redis: { label: 'Redis', color: 'oklch(0.65 0.22 25)' },
    valkey: { label: 'Valkey', color: 'oklch(0.65 0.22 25)' },
    sqlite: { label: 'SQLite', color: 'oklch(0.7 0.12 220)' },
    mssql: { label: 'Microsoft SQL Server', color: 'oklch(0.65 0.18 250)' },
  }
  return map[kind] ?? { label: kind, color: 'oklch(0.6 0.05 240)' }
}

// Full version lists for each database engine, latest first.
// Updated July 2026 — covers every major release still in support, plus
// the most recent few EOL versions for legacy migrations.
export const databaseVersions: Record<string, string[]> = {
  postgres: [
    '17.2', '17.1', '17.0',
    '16.6', '16.4', '16.2', '16.0',
    '15.10', '15.8', '15.6', '15.4', '15.2', '15.0',
    '14.15', '14.13', '14.10', '14.7', '14.4', '14.0',
    '13.18', '13.14', '13.10', '13.0',
    '12.22', '12.16', '12.0',
  ],
  mysql: [
    '9.1', '9.0',
    '8.4 (LTS)', '8.3', '8.2', '8.1', '8.0.40', '8.0.36', '8.0.34', '8.0.32', '8.0.30', '8.0.28', '8.0.26', '8.0', '8.0.21',
    '5.7.44',
  ],
  mariadb: [
    '11.6.1', '11.5.2', '11.4.3', '11.3.2', '11.2.3', '11.1.3', '11.0.4',
    '10.11.10', '10.11.6', '10.11.4', '10.11.2', '10.11.0',
    '10.6.19', '10.6.15', '10.6.10', '10.6.7', '10.6.4', '10.6.0',
    '10.5.26', '10.5.20', '10.5.15', '10.5.10', '10.5.0',
    '10.4.25', '10.4.20', '10.4.0',
  ],
  mongodb: [
    '8.0.4', '8.0.0',
    '7.0.15', '7.0.12', '7.0.8', '7.0.4', '7.0.0',
    '6.0.20', '6.0.17', '6.0.14', '6.0.10', '6.0.6', '6.0.2', '6.0.0',
    '5.0.30', '5.0.26', '5.0.22', '5.0.18', '5.0.14', '5.0.10', '5.0.6', '5.0.0',
    '4.4.29', '4.4.20', '4.4.10', '4.4.0',
  ],
  redis: [
    '7.4.2', '7.4.1', '7.4.0',
    '7.2.6', '7.2.5', '7.2.4', '7.2.0',
    '7.0.15', '7.0.12', '7.0.8', '7.0.4', '7.0.0',
    '6.2.17', '6.2.14', '6.2.10', '6.2.6', '6.2.0',
    '6.0.20', '6.0.16', '6.0.0',
  ],
  valkey: [
    '8.0.2', '8.0.1', '8.0.0',
    '7.2.6', '7.2.5', '7.2.4', '7.2.0',
  ],
  sqlite: [
    '3.47.1', '3.47.0',
    '3.46.1', '3.46.0',
    '3.45.3', '3.45.1', '3.45.0',
    '3.44.2', '3.44.0',
    '3.43.2', '3.43.1', '3.43.0',
    '3.42.0', '3.41.2', '3.41.0',
    '3.40.1', '3.40.0',
    '3.39.4', '3.39.0',
  ],
  mssql: [
    '2022 (16.x)', '2022 RTM',
    '2019 (15.x)', '2019 CU28', '2019 CU27', '2019 CU26', '2019 CU22', '2019 CU18', '2019 CU15', '2019 CU12', '2019 CU8', '2019 CU4', '2019 RTM',
    '2017 (14.x)', '2017 CU31', '2017 CU28', '2017 CU24', '2017 CU20', '2017 CU16', '2017 CU12', '2017 CU8', '2017 CU4', '2017 RTM',
    '2016 (13.x)', '2016 SP3', '2016 SP2', '2016 SP1', '2016 RTM',
    '2014 (12.x)', '2014 SP3', '2014 SP2', '2014 SP1', '2014 RTM',
    '2012 (11.x)', '2012 SP4', '2012 SP3', '2012 SP2', '2012 SP1', '2012 RTM',
  ],
}

// Latest version of each engine (first item of databaseVersions[kind]).
export function latestDbVersion(kind: string): string {
  return databaseVersions[kind]?.[0] ?? 'latest'
}

// Default port for each engine.
export const databasePorts: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
  valkey: 6379,
  sqlite: 0,
  mssql: 1433,
}
