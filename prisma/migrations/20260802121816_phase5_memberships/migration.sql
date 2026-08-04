-- CreateTable
CREATE TABLE "MembershipTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "billingInterval" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipTier_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MembershipSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tierId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" DATETIME NOT NULL,
    "processorSubscriptionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipSubscription_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "MembershipTier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MembershipSubscription_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "trendingScore" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "communityId" TEXT,
    "pinnedAt" DATETIME,
    "flairId" TEXT,
    "businessAuthorId" TEXT,
    "replyToId" TEXT,
    "repostOfId" TEXT,
    "postType" TEXT NOT NULL DEFAULT 'standard',
    "acceptedAnswerId" TEXT,
    "requiredTierId" TEXT,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_flairId_fkey" FOREIGN KEY ("flairId") REFERENCES "CommunityPostFlair" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_businessAuthorId_fkey" FOREIGN KEY ("businessAuthorId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Post" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Post_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "Post" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Post_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "Post_requiredTierId_fkey" FOREIGN KEY ("requiredTierId") REFERENCES "MembershipTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("acceptedAnswerId", "authorId", "body", "businessAuthorId", "communityId", "createdAt", "deletedAt", "flairId", "id", "likeCount", "pinnedAt", "postType", "replyCount", "replyToId", "repostCount", "repostOfId", "trendingScore") SELECT "acceptedAnswerId", "authorId", "body", "businessAuthorId", "communityId", "createdAt", "deletedAt", "flairId", "id", "likeCount", "pinnedAt", "postType", "replyCount", "replyToId", "repostCount", "repostOfId", "trendingScore" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");
CREATE INDEX "Post_replyToId_idx" ON "Post"("replyToId");
CREATE INDEX "Post_repostOfId_idx" ON "Post"("repostOfId");
CREATE INDEX "Post_trendingScore_idx" ON "Post"("trendingScore");
CREATE INDEX "Post_communityId_createdAt_idx" ON "Post"("communityId", "createdAt");
CREATE INDEX "Post_communityId_flairId_idx" ON "Post"("communityId", "flairId");
CREATE INDEX "Post_requiredTierId_idx" ON "Post"("requiredTierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MembershipTier_creatorId_status_idx" ON "MembershipTier"("creatorId", "status");

-- CreateIndex
CREATE INDEX "MembershipSubscription_fanId_status_idx" ON "MembershipSubscription"("fanId", "status");

-- CreateIndex
CREATE INDEX "MembershipSubscription_tierId_status_idx" ON "MembershipSubscription"("tierId", "status");
