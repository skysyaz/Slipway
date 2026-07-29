-- ApiToken.lookupHash: the indexed SHA-256 that turns Bearer auth into a single
-- row lookup instead of a bcrypt compare against every stored token.
--
-- The column was added to schema.prisma without a migration, so
-- `prisma migrate deploy` built a database without it and every token request
-- failed with:
--   The column `main.ApiToken.lookupHash` does not exist in the current database
-- Production masked it because the container boots with `prisma db push`, which
-- syncs from the schema and ignores migration history.
ALTER TABLE "ApiToken" ADD COLUMN "lookupHash" TEXT;
CREATE UNIQUE INDEX "ApiToken_lookupHash_key" ON "ApiToken"("lookupHash");
