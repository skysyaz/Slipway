-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "displayName" TEXT,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'oauth',
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "expiresAt" INTEGER,
    "scope" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "repoUrl" TEXT,
    "folderPath" TEXT,
    "composePath" TEXT,
    "stack" TEXT NOT NULL,
    "stackLabel" TEXT NOT NULL,
    "framework" TEXT,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "lastDeployedAt" DATETIME,
    "url" TEXT,
    "description" TEXT,
    "region" TEXT NOT NULL DEFAULT 'local',
    "memoryMb" INTEGER NOT NULL DEFAULT 512,
    "cpuMilli" INTEGER NOT NULL DEFAULT 400,
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "minReplicas" INTEGER NOT NULL DEFAULT 1,
    "maxReplicas" INTEGER NOT NULL DEFAULT 6,
    "monorepo" BOOLEAN NOT NULL DEFAULT false,
    "monorepoPath" TEXT,
    "autoDeploy" BOOLEAN NOT NULL DEFAULT true,
    "requireTests" BOOLEAN NOT NULL DEFAULT false,
    "autoRollback" BOOLEAN NOT NULL DEFAULT true,
    "pauseDuringWindows" BOOLEAN NOT NULL DEFAULT false,
    "prPreviews" BOOLEAN NOT NULL DEFAULT true,
    "buildCmd" TEXT,
    "startCmd" TEXT,
    "dockerImage" TEXT,
    "dockerContainerId" TEXT,
    "envVarsCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyDeploys" INTEGER NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 100,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "image" TEXT NOT NULL,
    "port" INTEGER,
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "memoryMb" INTEGER NOT NULL DEFAULT 256,
    "cpuMilli" INTEGER NOT NULL DEFAULT 200,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "restarts" INTEGER NOT NULL DEFAULT 0,
    "dockerContainerId" TEXT,
    CONSTRAINT "Service_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'primary',
    "ssl" TEXT NOT NULL DEFAULT 'disabled',
    "sslExpiry" DATETIME,
    "https" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "Domain_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnvVar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "masked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EnvVar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
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
    CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeploymentStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deploymentId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "logLines" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeploymentStep_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatabaseInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "projectId" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5432,
    "storageGb" INTEGER NOT NULL DEFAULT 20,
    "usedGb" REAL NOT NULL DEFAULT 0,
    "connections" INTEGER NOT NULL DEFAULT 0,
    "maxConnections" INTEGER NOT NULL DEFAULT 200,
    "backupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "region" TEXT NOT NULL DEFAULT 'local',
    "dockerContainerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatabaseInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Volume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "mountPath" TEXT NOT NULL DEFAULT '/data',
    "sizeGb" INTEGER NOT NULL DEFAULT 20,
    "usedGb" REAL NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'ssd',
    "server" TEXT NOT NULL DEFAULT 'local',
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "dockerVolumeName" TEXT,
    CONSTRAINT "Volume_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "status" TEXT NOT NULL DEFAULT 'offline',
    "os" TEXT NOT NULL DEFAULT 'Ubuntu 24.04 LTS',
    "cpuCores" INTEGER NOT NULL DEFAULT 4,
    "memoryGb" INTEGER NOT NULL DEFAULT 16,
    "diskGb" INTEGER NOT NULL DEFAULT 200,
    "diskUsedGb" INTEGER NOT NULL DEFAULT 0,
    "dockerVersion" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT 'local',
    "uptimeHours" INTEGER NOT NULL DEFAULT 0,
    "sshUser" TEXT,
    "sshKeyId" TEXT,
    "joinedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SshKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'cluster',
    "fingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Registry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "auth" TEXT NOT NULL DEFAULT 'anonymous',
    "token" TEXT,
    "username" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read',
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "sizeMb" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "schedule" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 14,
    "server" TEXT NOT NULL DEFAULT 'local',
    "projectId" TEXT,
    CONSTRAINT "BackupRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 14,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL DEFAULT 'info',
    "kind" TEXT NOT NULL DEFAULT 'system',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL DEFAULT 'you',
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT,
    "containerId" TEXT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpu" REAL NOT NULL DEFAULT 0,
    "memory" REAL NOT NULL DEFAULT 0,
    "netIn" REAL NOT NULL DEFAULT 0,
    "netOut" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "MetricSample_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LogLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'info',
    "service" TEXT NOT NULL DEFAULT 'app',
    "message" TEXT NOT NULL,
    "projectId" TEXT,
    "containerId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "EnvVar_projectId_key_scope_key" ON "EnvVar"("projectId", "key", "scope");

-- CreateIndex
CREATE INDEX "Deployment_projectId_idx" ON "Deployment"("projectId");

-- CreateIndex
CREATE INDEX "DeploymentStep_deploymentId_idx" ON "DeploymentStep"("deploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_name_key" ON "Server"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LogLine_ts_idx" ON "LogLine"("ts");
