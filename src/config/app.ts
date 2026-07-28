// ponytail: SINGLE source of truth for the app identity shown in the UI
// (sidebar footer, login screen, CLI/Desktop install commands + download
// filenames + docker tag). The version is 0.0.1 — the project is in its
// initialization phase. Update it HERE only; every display site reads from
// this so a stale hardcoded version can't drift back in. (bug 2)
export const APP_NAME = 'Slipway'
export const APP_VERSION = '0.0.1'
export const DEPLOY_MODE = 'self-hosted'
// "Slipway v0.0.1 · self-hosted" — the footer/login label.
export const APP_LABEL = `${APP_NAME} v${APP_VERSION} · ${DEPLOY_MODE}`
// Version-only suffix used in download filenames + the docker image tag.
export const APP_TAG = APP_VERSION