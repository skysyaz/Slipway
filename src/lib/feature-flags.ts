/**
 * Feature flags for OpenShip-ported subsystems.
 *
 * Flag OFF (explicit 0/false/off/no) restores pre-port Slipway behavior
 * bit-for-bit for that subsystem. Unset or any other value → ON so the
 * ported fixes ship by default after this integration.
 *
 *   SLIPWAY_FF_ROUTE_AFTER_DEPLOY  — P1/P5: rewire domains after healthy deploy;
 *                                    routing/TLS failures never fail the deploy
 *   SLIPWAY_FF_DEPLOY_SNAPSHOT     — P3: freeze build/start/port/env into Deployment
 *   SLIPWAY_FF_STACK_DETECT        — P2: richer zero-config stack detection
 *   SLIPWAY_FF_SMART_MONOREPO      — P4: changed-files / monorepo skip-rebuild
 */

function isOff(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase()
  return v === "0" || v === "false" || v === "off" || v === "no"
}

function flag(envName: string): boolean {
  return !isOff(process.env[envName])
}

export const FF = {
  routeAfterDeploy: () => flag("SLIPWAY_FF_ROUTE_AFTER_DEPLOY"),
  deploySnapshot: () => flag("SLIPWAY_FF_DEPLOY_SNAPSHOT"),
  stackDetect: () => flag("SLIPWAY_FF_STACK_DETECT"),
  smartMonorepo: () => flag("SLIPWAY_FF_SMART_MONOREPO"),
} as const

/** Test helper — evaluate all flags from a fake env map without mutating process.env. */
export function flagsFromEnv(env: Record<string, string | undefined>): {
  routeAfterDeploy: boolean
  deploySnapshot: boolean
  stackDetect: boolean
  smartMonorepo: boolean
} {
  const on = (k: string) => !isOff(env[k])
  return {
    routeAfterDeploy: on("SLIPWAY_FF_ROUTE_AFTER_DEPLOY"),
    deploySnapshot: on("SLIPWAY_FF_DEPLOY_SNAPSHOT"),
    stackDetect: on("SLIPWAY_FF_STACK_DETECT"),
    smartMonorepo: on("SLIPWAY_FF_SMART_MONOREPO"),
  }
}
