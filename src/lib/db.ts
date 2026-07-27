import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";

/**
 * Resolve the SQLite DATABASE_URL to an absolute path so the runtime
 * (PrismaClient) hits the *same* file that `prisma migrate` created.
 *
 * Prisma migrate resolves `file:./foo.db` relative to the schema directory
 * (prisma/). The Prisma client, by contrast, resolves it relative to the
 * process cwd — which differs under `next dev`, the standalone server, etc.
 * To avoid the classic "two databases" bug, we rewrite any relative `file:`
 * URL to an absolute one anchored at <cwd>/prisma, matching migrate's rule.
 * Absolute URLs (production, e.g. file:/data/slipway.db) are passed through.
 */
function resolveDatasourceUrl(url: string | undefined): string {
  const fallback = "file:./slipway.db";
  const raw = (url || process.env.DATABASE_URL || fallback).trim();
  if (!raw.startsWith("file:")) return raw; // non-sqlite, leave as-is
  const p = raw.slice("file:".length);
  // Absolute path (POSIX or Windows drive) — pass through unchanged.
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return raw;
  // Relative → anchor at <cwd>/prisma to match `prisma migrate` resolution.
  const abs = path.resolve(process.cwd(), "prisma", p);
  const dir = path.dirname(abs);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore — Prisma will surface a clearer error if the dir is unwritable
  }
  return "file:" + abs.replace(/\\/g, "/");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __slipwayDatasourceUrl?: string
}

export const datasourceUrl = resolveDatasourceUrl(
  globalForPrisma.__slipwayDatasourceUrl
)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl,
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn"],
  })

globalForPrisma.prisma = db
globalForPrisma.__slipwayDatasourceUrl = datasourceUrl