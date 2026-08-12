-- CreateTable
CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriberType" TEXT NOT NULL,
    "subscriberProfileId" TEXT,
    "subscriberBusinessId" TEXT,
    "subscriberOrganizationId" TEXT,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "processorSubscriptionId" TEXT NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSubscription_subscriberProfileId_fkey" FOREIGN KEY ("subscriberProfileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlatformSubscription_subscriberBusinessId_fkey" FOREIGN KEY ("subscriberBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlatformSubscription_subscriberOrganizationId_fkey" FOREIGN KEY ("subscriberOrganizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerProfileId" TEXT,
    "ownerBusinessId" TEXT,
    "domain" TEXT NOT NULL,
    "isApex" BOOLEAN NOT NULL,
    "dnsTarget" TEXT NOT NULL,
    "routingStatus" TEXT NOT NULL DEFAULT 'pending_dns',
    "sslStatus" TEXT NOT NULL DEFAULT 'pending',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimExpiresAt" DATETIME NOT NULL,
    "dormantAt" DATETIME,
    "lastHealthCheckAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomDomain_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomDomain_ownerBusinessId_fkey" FOREIGN KEY ("ownerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeveloperApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerBusinessId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "redirectUrisJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingPlan" TEXT NOT NULL DEFAULT 'free',
    "lastBilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperApp_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeveloperApp_ownerBusinessId_fkey" FOREIGN KEY ("ownerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeveloperApp" ("clientId", "clientSecretHash", "createdAt", "description", "id", "name", "ownerBusinessId", "ownerType", "ownerUserId", "redirectUrisJson", "status") SELECT "clientId", "clientSecretHash", "createdAt", "description", "id", "name", "ownerBusinessId", "ownerType", "ownerUserId", "redirectUrisJson", "status" FROM "DeveloperApp";
DROP TABLE "DeveloperApp";
ALTER TABLE "new_DeveloperApp" RENAME TO "DeveloperApp";
CREATE UNIQUE INDEX "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");
CREATE INDEX "DeveloperApp_ownerUserId_idx" ON "DeveloperApp"("ownerUserId");
CREATE INDEX "DeveloperApp_ownerBusinessId_idx" ON "DeveloperApp"("ownerBusinessId");
CREATE TABLE "new_Link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT,
    "businessId" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Link_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Link_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Link" ("businessId", "clickCount", "createdAt", "endsAt", "id", "isFeatured", "label", "position", "profileId", "startsAt", "updatedAt", "url") SELECT "businessId", "clickCount", "createdAt", "endsAt", "id", "isFeatured", "label", "position", "profileId", "startsAt", "updatedAt", "url" FROM "Link";
DROP TABLE "Link";
ALTER TABLE "new_Link" RENAME TO "Link";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlatformSubscription_subscriberProfileId_status_idx" ON "PlatformSubscription"("subscriberProfileId", "status");

-- CreateIndex
CREATE INDEX "PlatformSubscription_subscriberBusinessId_status_idx" ON "PlatformSubscription"("subscriberBusinessId", "status");

-- CreateIndex
CREATE INDEX "PlatformSubscription_subscriberOrganizationId_status_idx" ON "PlatformSubscription"("subscriberOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_dnsTarget_key" ON "CustomDomain"("dnsTarget");

-- CreateIndex
CREATE INDEX "CustomDomain_ownerProfileId_idx" ON "CustomDomain"("ownerProfileId");

-- CreateIndex
CREATE INDEX "CustomDomain_ownerBusinessId_idx" ON "CustomDomain"("ownerBusinessId");

-- CreateIndex
CREATE INDEX "CustomDomain_routingStatus_idx" ON "CustomDomain"("routingStatus");

-- CreateIndex
CREATE INDEX "CustomDomain_status_idx" ON "CustomDomain"("status");
