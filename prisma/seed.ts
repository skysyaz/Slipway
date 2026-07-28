/**
 * Slipway seed — idempotent. Run via `bun run db:seed` or `prisma db seed`.
 * Creates the admin user (bcrypt-hashed) from env, a local server entry,
 * and one deployable demo project (image-based) so the first "Deploy" in
 * the UI spins up a real container when Docker is available.
 */
import { db } from "../src/lib/db"
import bcrypt from "bcryptjs"

async function main() {
  const adminUser = process.env.SLIPWAY_ADMIN_USER || "admin"
  const adminPass = process.env.SLIPWAY_ADMIN_PASSWORD || "admin"

  // Admin user (create if missing; refresh password hash if absent)
  const existing = await db.user.findFirst({ where: { role: "admin" } })
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPass, 10)
    await db.user.upsert({
      where: { username: adminUser },
      create: {
        username: adminUser,
        email: `admin@slipway.local`,
        role: "admin",
        displayName: "Administrator",
        passwordHash,
      },
      update: {},
    })
    console.log(`Seeded admin user: ${adminUser} (password from .env)`)
  } else {
    console.log(`Admin user already present: ${existing.username}`)
  }

  // Local server (the Docker host this Slipway runs on)
  const local = await db.server.upsert({
    where: { name: "local" },
    create: {
      name: "local",
      hostname: "localhost",
      ip: "127.0.0.1",
      role: "manager",
      status: "online",
      os: "local",
      // ponytail: 0 = unmeasured. GET /api/servers overlays the REAL cores /
      // RAM / disk for the local host from node:os + statfs, so seeding 4/16/200
      // only ever put a fiction on screen for anyone who read the row directly.
      cpuCores: 0,
      memoryGb: 0,
      diskGb: 0,
      diskUsedGb: 0,
      dockerVersion: "",
      region: "local",
      uptimeHours: 0,
    },
    update: {},
  })
  console.log(`Seeded local server: ${local.name}`)

  // Global settings defaults
  await db.setting.upsert({
    where: { key: "cluster.maintenance" },
    create: { key: "cluster.maintenance", value: "false" },
    update: {},
  })
  await db.setting.upsert({
    where: { key: "cluster.id" },
    create: { key: "cluster.id", value: process.env.SLIPWAY_CLUSTER_ID || "helix-eu" },
    update: {},
  })

  // One deployable demo project (image-based, stopped — click Deploy to run it)
  const demoSlug = "demo-whoami"
  const demo = await db.project.findUnique({ where: { slug: demoSlug } })
  if (!demo) {
    await db.project.create({
      data: {
        name: "Demo · whoami",
        slug: demoSlug,
        source: "image",
        stack: "dockerfile",
        stackLabel: "Docker image · traefik/whoami",
        framework: "Docker",
        environment: "production",
        status: "stopped",
        url: "",
        description: "A tiny image-based demo. Click Deploy to run it as a real container (needs Docker).",
        region: "local",
        memoryMb: 64,
        cpuMilli: 50,
        replicas: 1,
        dockerImage: "traefik/whoami:latest",
        envVarsCount: 0,
        monthlyDeploys: 0,
        successRate: 100,
      },
    })
    console.log("Seeded demo project: demo-whoami (image: traefik/whoami:latest)")
  } else {
    console.log("Demo project already present")
  }

  console.log("Seed complete.")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })