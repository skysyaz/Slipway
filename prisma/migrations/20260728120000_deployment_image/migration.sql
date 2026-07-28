-- Records the image a deployment released, so rollback can re-run a previous
-- one for real instead of only writing a "rolled back" record.
ALTER TABLE "Deployment" ADD COLUMN "image" TEXT;
