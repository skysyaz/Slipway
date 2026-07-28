-- Records which archive file a backup produced inside the slipway-backups volume.
ALTER TABLE "BackupRecord" ADD COLUMN "fileName" TEXT;
