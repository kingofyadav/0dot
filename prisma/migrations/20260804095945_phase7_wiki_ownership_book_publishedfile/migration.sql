-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "ebookFileUrl" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Book_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishedFile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishedFileDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerHost" TEXT,
    CONSTRAINT "PublishedFileDownload_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "PublishedFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WikiPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT,
    "profileId" TEXT,
    "bookId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'wiki',
    "parentPageId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT,
    "currentRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WikiPage_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_parentPageId_fkey" FOREIGN KEY ("parentPageId") REFERENCES "WikiPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "WikiRevision" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_WikiPage" ("communityId", "createdAt", "currentRevisionId", "id", "slug", "title", "updatedAt") SELECT "communityId", "createdAt", "currentRevisionId", "id", "slug", "title", "updatedAt" FROM "WikiPage";
DROP TABLE "WikiPage";
ALTER TABLE "new_WikiPage" RENAME TO "WikiPage";
CREATE UNIQUE INDEX "WikiPage_currentRevisionId_key" ON "WikiPage"("currentRevisionId");
CREATE INDEX "WikiPage_profileId_parentPageId_position_idx" ON "WikiPage"("profileId", "parentPageId", "position");
CREATE INDEX "WikiPage_bookId_parentPageId_position_idx" ON "WikiPage"("bookId", "parentPageId", "position");
CREATE UNIQUE INDEX "WikiPage_communityId_slug_key" ON "WikiPage"("communityId", "slug");
CREATE UNIQUE INDEX "WikiPage_profileId_slug_key" ON "WikiPage"("profileId", "slug");
CREATE UNIQUE INDEX "WikiPage_bookId_slug_key" ON "WikiPage"("bookId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Book_visibility_status_idx" ON "Book"("visibility", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Book_profileId_slug_key" ON "Book"("profileId", "slug");

-- CreateIndex
CREATE INDEX "PublishedFile_visibility_publishedAt_idx" ON "PublishedFile"("visibility", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedFile_profileId_slug_key" ON "PublishedFile"("profileId", "slug");

-- CreateIndex
CREATE INDEX "PublishedFileDownload_fileId_occurredAt_idx" ON "PublishedFileDownload"("fileId", "occurredAt");
