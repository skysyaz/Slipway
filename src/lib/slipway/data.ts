// Slipway — static reference data for the new-deployment / database dialogs.
// The mock project/deployment arrays that used to live here were removed once
// the dashboard switched to the real API (src/lib/slipway/store.ts).

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