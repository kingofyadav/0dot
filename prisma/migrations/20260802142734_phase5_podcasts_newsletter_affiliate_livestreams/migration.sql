-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "rssSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Podcast_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PodcastEpisode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "podcastId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fileKey" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL,
    "publishAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredTierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PodcastEpisode_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PodcastEpisode_requiredTierId_fkey" FOREIGN KEY ("requiredTierId") REFERENCES "MembershipTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PodcastFeedToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "podcastId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "PodcastFeedToken_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PodcastFeedToken_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsletterSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "subscriberUserId" TEXT,
    "subscriberEmail" TEXT NOT NULL,
    "unsubscribeToken" TEXT NOT NULL,
    "subscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" DATETIME,
    CONSTRAINT "NewsletterSubscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsletterSubscription_subscriberUserId_fkey" FOREIGN KEY ("subscriberUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requiredTierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsletterIssue_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsletterIssue_requiredTierId_fkey" FOREIGN KEY ("requiredTierId") REFERENCES "MembershipTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "offeringType" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "commissionPercent" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateProgram_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateLink_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateLinkId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerHost" TEXT,
    CONSTRAINT "AffiliateClick_affiliateLinkId_fkey" FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateLinkId" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "commissionAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateConversion_affiliateLinkId_fkey" FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateConversion_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Livestream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "requiredTierId" TEXT,
    "ingestKey" TEXT NOT NULL,
    "playbackUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Livestream_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Livestream_requiredTierId_fkey" FOREIGN KEY ("requiredTierId") REFERENCES "MembershipTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LivestreamChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "livestreamId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "LivestreamChatMessage_livestreamId_fkey" FOREIGN KEY ("livestreamId") REFERENCES "Livestream" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LivestreamChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_rssSlug_key" ON "Podcast"("rssSlug");

-- CreateIndex
CREATE INDEX "Podcast_creatorId_idx" ON "Podcast"("creatorId");

-- CreateIndex
CREATE INDEX "PodcastEpisode_podcastId_episodeNumber_idx" ON "PodcastEpisode"("podcastId", "episodeNumber");

-- CreateIndex
CREATE INDEX "PodcastEpisode_requiredTierId_idx" ON "PodcastEpisode"("requiredTierId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastFeedToken_token_key" ON "PodcastFeedToken"("token");

-- CreateIndex
CREATE INDEX "PodcastFeedToken_podcastId_subscriberId_idx" ON "PodcastFeedToken"("podcastId", "subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_unsubscribeToken_key" ON "NewsletterSubscription"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_creatorId_idx" ON "NewsletterSubscription"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_creatorId_subscriberEmail_key" ON "NewsletterSubscription"("creatorId", "subscriberEmail");

-- CreateIndex
CREATE INDEX "NewsletterIssue_creatorId_status_idx" ON "NewsletterIssue"("creatorId", "status");

-- CreateIndex
CREATE INDEX "AffiliateProgram_creatorId_idx" ON "AffiliateProgram"("creatorId");

-- CreateIndex
CREATE INDEX "AffiliateProgram_offeringType_offeringId_idx" ON "AffiliateProgram"("offeringType", "offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_programId_idx" ON "AffiliateLink"("programId");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "AffiliateLink"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateLinkId_occurredAt_idx" ON "AffiliateClick"("affiliateLinkId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateConversion_paymentTransactionId_key" ON "AffiliateConversion"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "AffiliateConversion_affiliateLinkId_idx" ON "AffiliateConversion"("affiliateLinkId");

-- CreateIndex
CREATE INDEX "Livestream_creatorId_status_idx" ON "Livestream"("creatorId", "status");

-- CreateIndex
CREATE INDEX "Livestream_requiredTierId_idx" ON "Livestream"("requiredTierId");

-- CreateIndex
CREATE INDEX "LivestreamChatMessage_livestreamId_createdAt_idx" ON "LivestreamChatMessage"("livestreamId", "createdAt");
