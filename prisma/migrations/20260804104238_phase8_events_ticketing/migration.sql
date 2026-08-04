-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "hostedByUserId" TEXT,
    "hostedByBusinessId" TEXT,
    "hostedByCommunityId" TEXT,
    "createdBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "format" TEXT NOT NULL,
    "location" TEXT,
    "virtualJoinUrl" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capacity" INTEGER,
    "attendeeListVisibility" TEXT NOT NULL DEFAULT 'public',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_hostedByUserId_fkey" FOREIGN KEY ("hostedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_hostedByBusinessId_fkey" FOREIGN KEY ("hostedByBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_hostedByCommunityId_fkey" FOREIGN KEY ("hostedByCommunityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRSVP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRSVP_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventRSVP_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL,
    "currency" TEXT,
    "quantityTotal" INTEGER,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "salesStartAt" DATETIME,
    "salesEndAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketTypeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "paymentTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "qrCodeToken" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ticket_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreatorPayoutAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "businessId" TEXT,
    "processor" TEXT NOT NULL DEFAULT 'stub',
    "processorAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatorPayoutAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreatorPayoutAccount" ("createdAt", "id", "processor", "processorAccountId", "status", "userId") SELECT "createdAt", "id", "processor", "processorAccountId", "status", "userId" FROM "CreatorPayoutAccount";
DROP TABLE "CreatorPayoutAccount";
ALTER TABLE "new_CreatorPayoutAccount" RENAME TO "CreatorPayoutAccount";
CREATE UNIQUE INDEX "CreatorPayoutAccount_userId_key" ON "CreatorPayoutAccount"("userId");
CREATE UNIQUE INDEX "CreatorPayoutAccount_businessId_key" ON "CreatorPayoutAccount"("businessId");
CREATE TABLE "new_Livestream" (
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
    "eventId" TEXT,
    "isRecorded" BOOLEAN NOT NULL DEFAULT false,
    "recordingUrl" TEXT,
    "recordingRetentionDays" INTEGER,
    CONSTRAINT "Livestream_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Livestream_requiredTierId_fkey" FOREIGN KEY ("requiredTierId") REFERENCES "MembershipTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Livestream_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Livestream" ("createdAt", "creatorId", "endedAt", "id", "ingestKey", "playbackUrl", "requiredTierId", "scheduledAt", "startedAt", "status", "title") SELECT "createdAt", "creatorId", "endedAt", "id", "ingestKey", "playbackUrl", "requiredTierId", "scheduledAt", "startedAt", "status", "title" FROM "Livestream";
DROP TABLE "Livestream";
ALTER TABLE "new_Livestream" RENAME TO "Livestream";
CREATE INDEX "Livestream_creatorId_status_idx" ON "Livestream"("creatorId", "status");
CREATE INDEX "Livestream_requiredTierId_idx" ON "Livestream"("requiredTierId");
CREATE INDEX "Livestream_eventId_idx" ON "Livestream"("eventId");
CREATE TABLE "new_PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payerId" TEXT,
    "payeeId" TEXT,
    "payeeBusinessId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "platformFee" REAL NOT NULL,
    "processorReference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "relatedObjectType" TEXT,
    "relatedObjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_payeeBusinessId_fkey" FOREIGN KEY ("payeeBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PaymentTransaction" ("amount", "createdAt", "currency", "id", "kind", "payeeId", "payerId", "platformFee", "processorReference", "relatedObjectId", "relatedObjectType", "status") SELECT "amount", "createdAt", "currency", "id", "kind", "payeeId", "payerId", "platformFee", "processorReference", "relatedObjectId", "relatedObjectType", "status" FROM "PaymentTransaction";
DROP TABLE "PaymentTransaction";
ALTER TABLE "new_PaymentTransaction" RENAME TO "PaymentTransaction";
CREATE INDEX "PaymentTransaction_payeeId_createdAt_idx" ON "PaymentTransaction"("payeeId", "createdAt");
CREATE INDEX "PaymentTransaction_payeeBusinessId_createdAt_idx" ON "PaymentTransaction"("payeeBusinessId", "createdAt");
CREATE INDEX "PaymentTransaction_payerId_idx" ON "PaymentTransaction"("payerId");
CREATE TABLE "new_VoiceRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "startsAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentSpeakerId" TEXT,
    "currentSpeakerSince" DATETIME,
    "eventId" TEXT,
    "isRecorded" BOOLEAN NOT NULL DEFAULT false,
    "recordingUrl" TEXT,
    "recordingRetentionDays" INTEGER,
    CONSTRAINT "VoiceRoom_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceRoom_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceRoom_currentSpeakerId_fkey" FOREIGN KEY ("currentSpeakerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VoiceRoom_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VoiceRoom" ("communityId", "createdAt", "createdBy", "currentSpeakerId", "currentSpeakerSince", "endedAt", "id", "startsAt", "status", "title") SELECT "communityId", "createdAt", "createdBy", "currentSpeakerId", "currentSpeakerSince", "endedAt", "id", "startsAt", "status", "title" FROM "VoiceRoom";
DROP TABLE "VoiceRoom";
ALTER TABLE "new_VoiceRoom" RENAME TO "VoiceRoom";
CREATE INDEX "VoiceRoom_eventId_idx" ON "VoiceRoom"("eventId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_hostedByUserId_idx" ON "Event"("hostedByUserId");

-- CreateIndex
CREATE INDEX "Event_hostedByBusinessId_idx" ON "Event"("hostedByBusinessId");

-- CreateIndex
CREATE INDEX "Event_hostedByCommunityId_idx" ON "Event"("hostedByCommunityId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "EventRSVP_eventId_status_idx" ON "EventRSVP"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRSVP_eventId_userId_key" ON "EventRSVP"("eventId", "userId");

-- CreateIndex
CREATE INDEX "TicketType_eventId_idx" ON "TicketType"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_paymentTransactionId_key" ON "Ticket"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrCodeToken_key" ON "Ticket"("qrCodeToken");

-- CreateIndex
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- CreateIndex
CREATE INDEX "Ticket_ticketTypeId_idx" ON "Ticket"("ticketTypeId");
