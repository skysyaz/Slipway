-- OpenShip port: frozen deploy snapshot + route warnings + changed paths
ALTER TABLE "Deployment" ADD COLUMN "configSnapshot" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "routeWarnings" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "changedPaths" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "forceAll" BOOLEAN NOT NULL DEFAULT false;
