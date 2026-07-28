/**
 * Backup naming, shell quoting, and per-engine dump commands.
 *
 * Pure and dependency-free so scripts/selfcheck-host-health.ts can cover it
 * without a Docker socket or a database. That matters most for shq(): these
 * strings are interpolated into a helper container's `sh -c`, with a
 * database password among the values, so a quoting mistake is a command
 * injection rather than a cosmetic bug.
 */

/** Filesystem-safe slug for a backup filename. */
export function backupSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "backup"
}

/**
 * Single-quote a value for safe interpolation into `sh -c`.
 *
 * POSIX single quotes make everything literal, so the only character needing
 * care is the single quote itself, closed and re-opened around an escaped one.
 */
export function shq(v: string): string {
  return `'${String(v).replace(/'/g, `'\\''`)}'`
}

/** Parse the trailing `SIZE:<bytes>` marker the helper scripts print. */
export function parseSizeMarker(output: string): number | null {
  const m = output.match(/SIZE:(\d+)/g)
  if (!m || !m.length) return null
  const n = Number(m[m.length - 1].slice("SIZE:".length))
  return Number.isFinite(n) ? n : null
}

/** Engines Slipway can dump, and the file extension each produces. */
export const DUMPABLE_ENGINES = ["postgres", "mysql", "mariadb", "mongodb", "redis", "valkey"] as const

export function backupExtension(kind: string): string {
  return kind === "redis" || kind === "valkey" ? "rdb" : "sql.gz"
}

/**
 * Build the engine-specific dump command. It runs inside a helper container
 * created from the database's OWN image (so the client tools are present and
 * version-matched) sharing the database container's network namespace, which
 * makes 127.0.0.1 the engine regardless of published ports or networks.
 *
 * Passwords go through the environment, never the command line, so they don't
 * leak into the helper's `ps` output.
 *
 * Returns null for engines Slipway cannot dump — the caller then fails
 * honestly instead of recording a backup that was never taken.
 */
export function dumpCommandFor(
  kind: string,
  row: { username?: string | null; password?: string | null; dbName?: string | null },
  file: string,
  internalPort: number
): { cmd: string; env: string[] } | null {
  const user = row.username || ""
  const pass = row.password || ""
  const dbName = row.dbName || ""
  const port = String(internalPort)
  // ponytail: every piped dump used to be `dump | gzip > file` under plain `sh
  // -c`. POSIX sh reports gzip's exit status, so a failed dump still produced a
  // valid non-empty .gz (gzip happily compresses EOF) and the backup was
  // recorded "completed". `set -o pipefail` makes the pipeline fail when the
  // dump tool fails — alpine/busybox ash and bash both honour it.
  switch (kind) {
    case "postgres":
      return {
        cmd: `set -o pipefail; pg_dump -h 127.0.0.1 -p ${port} -U ${shq(user)} -d ${shq(dbName)} | gzip -c > ${shq(file)}`,
        env: [`PGPASSWORD=${pass}`],
      }
    case "mysql":
    case "mariadb":
      return {
        cmd: `set -o pipefail; mysqldump -h 127.0.0.1 -P ${port} --protocol=tcp -u root --all-databases | gzip -c > ${shq(file)}`,
        env: [`MYSQL_PWD=${pass}`],
      }
    case "mongodb":
      return {
        cmd: `set -o pipefail; mongodump --host 127.0.0.1 --port ${port} -u ${shq(user)} -p "$MONGO_PW" --authenticationDatabase admin --archive | gzip -c > ${shq(file)}`,
        env: [`MONGO_PW=${pass}`],
      }
    case "redis":
      return {
        cmd: `redis-cli -h 127.0.0.1 -p ${port} -a "$REDIS_PW" --no-auth-warning --rdb ${shq(file)}`,
        env: [`REDIS_PW=${pass}`],
      }
    case "valkey":
      return {
        cmd: `valkey-cli -h 127.0.0.1 -p ${port} -a "$REDIS_PW" --no-auth-warning --rdb ${shq(file)}`,
        env: [`REDIS_PW=${pass}`],
      }
    default:
      // mssql needs BACKUP DATABASE writing inside the container plus a copy
      // step; sqlite has no server to dump. Refused rather than faked.
      return null
  }
}
