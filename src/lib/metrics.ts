/**
 * Real cluster metrics, sampled from `docker stats` on each request.
 *
 * An in-memory ring buffer (single-instance only — next dev / standalone
 * server) holds the last 60 samples so the dashboard shows a real time series.
 * With the engine down the buffer simply stays empty → empty series (honest, no
 * synthetic fallback).
 *
 * NOTE: requests/sec and p95 latency require app-level instrumentation Slipway
 * doesn't perform, so those are 0 (reported honestly, not fabricated).
 */
import { isDockerAvailable, dockerClient } from "./docker"
import { db } from "./db"

interface Sample {
  t: number
  cpu: number // sum of container CPU %
  mem: number // sum of memory bytes
  netIn: number // Mb/s
  netOut: number // Mb/s
  rps: number // 0 (not instrumented)
  p95: number // 0 (not instrumented)
  deploys: number // deploys in last 24h
  errors: number // % failed deploys
}

const BUFFER: Sample[] = []
const CAP = 60
let prevNet: { t: number; rx: number; tx: number } | null = null

function mbps(bytesPerSec: number) {
  return Math.round((bytesPerSec * 8) / 1_000_000 * 100) / 100
}

async function sample(): Promise<Sample | null> {
  if (!(await isDockerAvailable())) return null
  const docker = dockerClient()
  if (!docker) return null

  const containers = await docker.listContainers({ all: false })
  let cpu = 0
  let mem = 0
  let rx = 0
  let tx = 0
  const now = Date.now()

  for (const c of containers) {
    try {
      const stats = await docker.getContainer(c.Id).stats({ stream: false })
      const cpuUsage = stats.cpu_stats?.cpu_usage?.total_usage ?? 0
      const preCpu = stats.precpu_stats?.cpu_usage?.total_usage ?? 0
      const cpuSys = stats.cpu_stats?.system_cpu_usage ?? 0
      const preSys = stats.precpu_stats?.system_cpu_usage ?? 0
      const online = stats.cpu_stats?.online_cpus || 1
      if (cpuSys > preSys && cpuUsage > preCpu) {
        cpu += ((cpuUsage - preCpu) / (cpuSys - preSys)) * 100 * online
      }
      mem += stats.memory_stats?.usage ?? 0
      const nets = stats.networks || {}
      for (const k of Object.keys(nets)) {
        rx += nets[k].rx_bytes || 0
        tx += nets[k].tx_bytes || 0
      }
    } catch {
      /* container may have exited mid-sample */
    }
  }

  let netIn = 0
  let netOut = 0
  if (prevNet) {
    const dt = Math.max(1, (now - prevNet.t) / 1000)
    netIn = mbps(Math.max(0, (rx - prevNet.rx) / dt))
    netOut = mbps(Math.max(0, (tx - prevNet.tx) / dt))
  }
  prevNet = { t: now, rx, tx }

  // deploy frequency + error rate from deployment history
  let deploys = 0
  let errors = 0
  try {
    const since = new Date(now - 24 * 3600_000)
    const recent = await db.deployment.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true },
    })
    deploys = recent.length
    const failed = recent.filter((d) => d.status === "failed").length
    errors = recent.length ? Math.round((failed / recent.length) * 1000) / 10 : 0
  } catch {
    /* db unavailable */
  }

  return { t: now, cpu: Math.round(cpu * 100) / 100, mem, netIn, netOut, rps: 0, p95: 0, deploys, errors }
}

export async function getMetrics() {
  const s = await sample()
  if (s) {
    BUFFER.push(s)
    if (BUFFER.length > CAP) BUFFER.shift()
  }

  const series = (field: keyof Sample) => ({
    data: BUFFER.map((b) => ({ t: b.t, v: b[field] })),
  })

  return {
    cpu: { name: "CPU usage", ...series("cpu") },
    memory: { name: "Memory", ...series("mem") },
    networkIn: { name: "Network in (Mb/s)", ...series("netIn") },
    networkOut: { name: "Network out (Mb/s)", ...series("netOut") },
    requestsPerSec: { name: "Requests / sec", ...series("rps") },
    p95Latency: { name: "p95 latency (ms)", ...series("p95") },
    deployFrequency: { name: "Deploys / day", ...series("deploys") },
    errorRate: { name: "Error rate %", ...series("errors") },
  }
}