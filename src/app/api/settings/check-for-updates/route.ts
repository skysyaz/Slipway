import { route } from "@/lib/http"
import { APP_VERSION } from "@/config/app"

export const dynamic = "force-dynamic"

// Honest update check: reports the installed version and, if
// SLIPWAY_LATEST_VERSION is set (e.g. by an operator), compares against it.
// Without that env var there is no canonical registry to poll, so we report
// "unknown" rather than fabricating a fake latest version.
export const GET = route(async () => {
  // ponytail: bug 2 — current version comes from the single source of truth
  // (src/config/app), not package.json, so it matches what the UI displays.
  const current = APP_VERSION
  const latest = process.env.SLIPWAY_LATEST_VERSION
  const known = Boolean(latest)
  const upToDate = known ? current === latest : true
  return {
    current,
    latest: latest ?? null,
    upToDate,
    known,
    note: known
      ? upToDate
        ? "You are running the latest version."
        : `Slipway ${latest} is available. Upgrade in a maintenance window.`
      : "No update source configured. Set SLIPWAY_LATEST_VERSION to enable update checks.",
  }
})