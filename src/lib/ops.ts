/**
 * Operations layer — routes every orchestration op to the real Docker
 * implementation (src/lib/docker-ops.ts). No simulation fallback: if the Docker
 * engine is down or an op fails, the deployment is recorded as failed and the
 * error surfaces honestly.
 *
 * Rollback is metadata-level (records a rollback deployment); a real
 * container rollback re-runs the previous image.
 */
import {
  realDeploy,
  realRestart,
  realBackup,
  realStop,
  realRemove,
  realScale,
} from "./docker-ops"
import { simulateRollback, type DeployOptions } from "./simulate"

export type { DeployOptions }

export const deployProject = realDeploy
export const restartService = realRestart
export const runBackup = realBackup
export const stopProject = realStop
export const removeProject = realRemove
export const scaleProject = realScale

export async function rollbackDeployment(deploymentId: string, actor = "you") {
  return simulateRollback(deploymentId, actor)
}