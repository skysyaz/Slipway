/**
 * Operations layer — routes every orchestration op to the real Docker
 * implementation (src/lib/docker-ops.ts). No simulation fallback: if the Docker
 * engine is down or an op fails, the deployment is recorded as failed and the
 * error surfaces honestly.
 *
 * ponytail: rollback used to be the one exception — it pointed at
 * `simulateRollback`, which wrote a "healthy" rollback record with invented
 * timings and never touched a container. It now points at realRollback, which
 * recreates the container from the target deployment's recorded image and fails
 * honestly when there is nothing to roll back to.
 */
import {
  realDeploy,
  realRestart,
  realBackup,
  realStop,
  realRemove,
  realScale,
  realUpdateContainer,
  realReconcile,
  realRestartDatabase,
  realRollback,
  stopService as realStopService,
} from "./docker-ops"
import type { DeployOptions } from "./simulate"

export type { DeployOptions }

export const deployProject = realDeploy
export const restartService = realRestart
export const stopService = realStopService
export const runBackup = realBackup
export const stopProject = realStop
export const removeProject = realRemove
export const scaleProject = realScale
export const updateContainer = realUpdateContainer
export const reconcileProject = realReconcile
export const restartDatabase = realRestartDatabase
export const rollbackDeployment = realRollback
