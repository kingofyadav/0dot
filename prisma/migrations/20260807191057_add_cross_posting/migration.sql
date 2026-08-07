-- CreateTable
CREATE TABLE "ExternalSocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalSocialAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledCrossPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledCrossPost_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrossPostTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledPostId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalPostId" TEXT,
    "externalPostUrl" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" DATETIME,
    "nextRetryAt" DATETIME,
    CONSTRAINT "CrossPostTarget_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledCrossPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrossPostTarget_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalSocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSocialAccount_profileId_platform_externalAccountId_key" ON "ExternalSocialAccount"("profileId", "platform", "externalAccountId");

-- CreateIndex
CREATE INDEX "ScheduledCrossPost_status_scheduledFor_idx" ON "ScheduledCrossPost"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "CrossPostTarget_scheduledPostId_idx" ON "CrossPostTarget"("scheduledPostId");

-- CreateIndex
CREATE INDEX "CrossPostTarget_status_nextRetryAt_idx" ON "CrossPostTarget"("status", "nextRetryAt");
