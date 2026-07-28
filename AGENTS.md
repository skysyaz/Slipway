# AGENTS.md

General repository guidance for AI assistants lives in `CLAUDE.md` (architecture,
commands, conventions). Read that first. This file adds only Cursor Cloud
environment notes.

## Cursor Cloud specific instructions

The startup update script already runs `bun install` + `bun run db:generate`, so
dependencies and the Prisma client are current when you start. Standard dev
commands are in `CLAUDE.md` / `package.json` (`bun run dev`, `lint`, `test`,
`db:*`). Package manager is **Bun**, installed at `~/.bun/bin` (on `PATH` in a
login shell).

Non-obvious caveats specific to this VM:

- **Docker is required and is not started automatically.** There is no systemd,
  so start the engine yourself, e.g. in a tmux session: `sudo dockerd`
  (logs to stdout). Then make the socket usable by the `ubuntu` user for the
  current session: `sudo chmod 666 /var/run/docker.sock`. Slipway talks to the
  local engine via `dockerode`; `GET /api/` reports `"docker":"available"` when
  it's up.

- **cgroup v2 is in "threaded" mode on this VM — containers with memory/CPU
  limits cannot start.** Attempting to run a resource-limited container fails at
  start with:
  `runc create failed: ... unable to apply cgroup configuration: cannot enter
  cgroupv2 "/sys/fs/cgroup/docker" with domain controllers -- it is in threaded
  mode`. The `memory`/`io` controllers are not delegatable under the threaded
  root, so this cannot be fully fixed from inside the VM. Consequences:
  - **Deploying a Project that has `memoryMb`/`cpuMilli` set will fail at the
    `release`/`Build image` step with the error above.** The seeded
    `demo-whoami` project ships with `memoryMb: 64`, `cpuMilli: 50`. To deploy
    it successfully, first clear its limits (e.g.
    `PATCH /api/projects/:id {"memoryMb":0,"cpuMilli":0}` or via the project's
    settings), then deploy — the container then runs.
  - **Managed database provisioning works out of the box** because Slipway sets
    no memory/CPU limits on DB containers. `POST /api/databases` (or the UI's
    "New database") pulls the engine image and starts a real container. This is
    the most reliable way to exercise real Docker orchestration end to end.

- **If even limit-free containers fail to start after a fresh `dockerd` boot**
  with the "threaded mode" error, move the shell/daemon processes out of the
  root cgroup into a leaf before (re)starting dockerd:
  `sudo mkdir -p /sys/fs/cgroup/init` then move each PID from
  `/sys/fs/cgroup/cgroup.procs` into `/sys/fs/cgroup/init/cgroup.procs`, remove a
  stale `/sys/fs/cgroup/docker`, and restart `dockerd`. Unlimited containers then
  start.

- **`.env` is git-ignored and there is no committed `.env.example`.** Create
  `.env` by hand. A minimal working dev `.env` is:
  ```
  DATABASE_URL="file:./slipway.db"
  NEXTAUTH_SECRET="dev-secret-change-me-0123456789abcdef"
  NEXTAUTH_URL="http://localhost:3000"
  SLIPWAY_ADMIN_USER="admin"
  SLIPWAY_ADMIN_PASSWORD="admin"
  ```

- **First-time DB setup** (only when the SQLite file/schema is missing or the
  schema changed): `bun run db:push` then `bun run db:seed`. Seeding is
  idempotent and creates the `admin` / `admin` login, the `local` server, and the
  `demo-whoami` project. The `prisma/slipway.db` file persists in the VM
  snapshot, so this normally does not need re-running.
