-- Bring the migration history back in line with schema.prisma.
--
-- These columns were added to schema.prisma but never got a migration, so
-- `prisma migrate dev` / `prisma migrate deploy` produced a database missing
-- them and the app failed at runtime with e.g.
--   The column `main.Deployment.kind` does not exist in the current database.
-- Production happened to work only because the Dockerfile boots with
-- `prisma db push`, which syncs straight from the schema and bypasses history.
--
--   Deployment.kind          project | database
--   Deployment.error         failure cause shown in the deploy view
--   DeploymentStep.log       failing step's captured output tail
--   DatabaseInstance.environment  env tag used by the env filter

-- AlterTable
ALTER TABLE "DatabaseInstance" ADD COLUMN "environment" TEXT;

-- AlterTable
ALTER TABLE "DeploymentStep" ADD COLUMN "log" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'project',
    "commitSha" TEXT NOT NULL DEFAULT '',
    "commitMessage" TEXT NOT NULL DEFAULT '',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "author" TEXT NOT NULL DEFAULT 'you',
    "environment" TEXT NOT NULL DEFAULT 'production',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "rollbackOfId" TEXT,
    "url" TEXT,
    "image" TEXT,
    "error" TEXT,
    CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Deployment" ("author", "branch", "commitMessage", "commitSha", "createdAt", "durationMs", "environment", "finishedAt", "id", "image", "projectId", "rollbackOfId", "status", "url") SELECT "author", "branch", "commitMessage", "commitSha", "createdAt", "durationMs", "environment", "finishedAt", "id", "image", "projectId", "rollbackOfId", "status", "url" FROM "Deployment";
DROP TABLE "Deployment";
ALTER TABLE "new_Deployment" RENAME TO "Deployment";
CREATE INDEX "Deployment_projectId_idx" ON "Deployment"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

