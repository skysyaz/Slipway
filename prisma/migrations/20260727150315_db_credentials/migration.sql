-- AlterTable
ALTER TABLE "DatabaseInstance" ADD COLUMN "dbName" TEXT;
ALTER TABLE "DatabaseInstance" ADD COLUMN "internalPort" INTEGER;
ALTER TABLE "DatabaseInstance" ADD COLUMN "password" TEXT;
ALTER TABLE "DatabaseInstance" ADD COLUMN "username" TEXT;
