-- CreateTable
CREATE TABLE "GitRepository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "primaryLanguage" TEXT,
    "starCount" INTEGER,
    "lastSyncedAt" DATETIME,
    CONSTRAINT "GitRepository_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GitRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GitRepository_profileId_idx" ON "GitRepository"("profileId");

-- CreateIndex
CREATE INDEX "GitRepository_projectId_idx" ON "GitRepository"("projectId");
