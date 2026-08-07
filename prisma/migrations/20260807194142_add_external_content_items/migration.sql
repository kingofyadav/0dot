-- AlterTable
ALTER TABLE "ExternalSocialAccount" ADD COLUMN "lastContentSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "ExternalContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalAccountId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "contentUrl" TEXT NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "ExternalContentItem_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalSocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExternalContentItem_externalAccountId_publishedAt_idx" ON "ExternalContentItem"("externalAccountId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalContentItem_externalAccountId_externalItemId_key" ON "ExternalContentItem"("externalAccountId", "externalItemId");
