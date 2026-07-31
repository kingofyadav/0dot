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
    "replyToId" TEXT,
    "repostOfId" TEXT,
    "postType" TEXT NOT NULL DEFAULT 'standard',
    "acceptedAnswerId" TEXT,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_flairId_fkey" FOREIGN KEY ("flairId") REFERENCES "CommunityPostFlair" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Post" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Post_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "Post" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Post_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
INSERT INTO "new_Post" ("authorId", "body", "communityId", "createdAt", "deletedAt", "flairId", "id", "likeCount", "pinnedAt", "replyCount", "replyToId", "repostCount", "repostOfId", "trendingScore") SELECT "authorId", "body", "communityId", "createdAt", "deletedAt", "flairId", "id", "likeCount", "pinnedAt", "replyCount", "replyToId", "repostCount", "repostOfId", "trendingScore" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");
CREATE INDEX "Post_replyToId_idx" ON "Post"("replyToId");
CREATE INDEX "Post_repostOfId_idx" ON "Post"("repostOfId");
CREATE INDEX "Post_trendingScore_idx" ON "Post"("trendingScore");
CREATE INDEX "Post_communityId_createdAt_idx" ON "Post"("communityId", "createdAt");
CREATE INDEX "Post_communityId_flairId_idx" ON "Post"("communityId", "flairId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
