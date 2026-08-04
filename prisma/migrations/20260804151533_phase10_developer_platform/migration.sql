-- CreateTable
CREATE TABLE "DeveloperApp" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperApp_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeveloperApp_ownerBusinessId_fkey" FOREIGN KEY ("ownerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthScope" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DeveloperAppScope" (
    "appId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,

    PRIMARY KEY ("appId", "scopeKey"),
    CONSTRAINT "DeveloperAppScope_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeveloperAppScope_scopeKey_fkey" FOREIGN KEY ("scopeKey") REFERENCES "OAuthScope" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopesJson" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAuthorizationCode_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedScopesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "OAuthAuthorization_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuthAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorizationId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthToken_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "OAuthAuthorization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "eventTypesJson" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookSubscription_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" DATETIME,
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiUsageCounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ApiUsageCounter_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerType" TEXT NOT NULL,
    "sellerUserId" TEXT,
    "sellerBusinessId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" REAL,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "payload" TEXT NOT NULL,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "developerAppId" TEXT,
    CONSTRAINT "MarketplaceListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_sellerBusinessId_fkey" FOREIGN KEY ("sellerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_developerAppId_fkey" FOREIGN KEY ("developerAppId") REFERENCES "DeveloperApp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MarketplaceListing" ("averageRating", "category", "createdAt", "currency", "description", "id", "payload", "price", "purchaseCount", "reviewCount", "sellerBusinessId", "sellerType", "sellerUserId", "status", "title", "updatedAt") SELECT "averageRating", "category", "createdAt", "currency", "description", "id", "payload", "price", "purchaseCount", "reviewCount", "sellerBusinessId", "sellerType", "sellerUserId", "status", "title", "updatedAt" FROM "MarketplaceListing";
DROP TABLE "MarketplaceListing";
ALTER TABLE "new_MarketplaceListing" RENAME TO "MarketplaceListing";
CREATE INDEX "MarketplaceListing_status_category_idx" ON "MarketplaceListing"("status", "category");
CREATE INDEX "MarketplaceListing_sellerUserId_idx" ON "MarketplaceListing"("sellerUserId");
CREATE INDEX "MarketplaceListing_sellerBusinessId_idx" ON "MarketplaceListing"("sellerBusinessId");
CREATE INDEX "MarketplaceListing_developerAppId_idx" ON "MarketplaceListing"("developerAppId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");

-- CreateIndex
CREATE INDEX "DeveloperApp_ownerUserId_idx" ON "DeveloperApp"("ownerUserId");

-- CreateIndex
CREATE INDEX "DeveloperApp_ownerBusinessId_idx" ON "DeveloperApp"("ownerBusinessId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_appId_idx" ON "OAuthAuthorizationCode"("appId");

-- CreateIndex
CREATE INDEX "OAuthAuthorization_userId_idx" ON "OAuthAuthorization"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorization_appId_userId_key" ON "OAuthAuthorization"("appId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_accessTokenHash_key" ON "OAuthToken"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_refreshTokenHash_key" ON "OAuthToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_authorizationId_idx" ON "OAuthToken"("authorizationId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_appId_idx" ON "WebhookSubscription"("appId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_subscriptionId_status_idx" ON "WebhookDelivery"("subscriptionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiUsageCounter_appId_windowStart_key" ON "ApiUsageCounter"("appId", "windowStart");
