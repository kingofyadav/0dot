-- Closes a read-then-write race on installApp (src/app/actions/marketplace.ts):
-- a findFirst-then-create check with no DB backstop let two concurrent
-- installs for the same listing+installer both pass the check and create
-- duplicate InstalledApp rows (same shape as docs/BUGS.md's already-fixed
-- toggleRepost race). Each InstalledApp row has exactly one of
-- installerUserId/installerBusinessId/installerCommunityId set (the other
-- two null, per installerType) — a plain `@@unique` compound index on all
-- three columns wouldn't actually catch this, since SQLite (like standard
-- SQL) treats NULL as distinct from NULL, so two rows that both have their
-- unused columns NULL wouldn't collide. Three partial unique indexes, one
-- per installer type, close the race for each type independently — hence
-- raw SQL here rather than a declarative `@@unique` in schema.prisma, which
-- has no syntax for a partial/filtered index on any provider.
-- CreateIndex
CREATE UNIQUE INDEX "InstalledApp_listing_user_unique" ON "InstalledApp"("listingId", "installerUserId") WHERE "installerUserId" IS NOT NULL;
CREATE UNIQUE INDEX "InstalledApp_listing_business_unique" ON "InstalledApp"("listingId", "installerBusinessId") WHERE "installerBusinessId" IS NOT NULL;
CREATE UNIQUE INDEX "InstalledApp_listing_community_unique" ON "InstalledApp"("listingId", "installerCommunityId") WHERE "installerCommunityId" IS NOT NULL;
