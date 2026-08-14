-- CreateTable
CREATE TABLE "CoinTopUpRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "coinAmount" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "utr" TEXT,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinTopUpRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "dateOfBirth" DATETIME,
    "ageVerifiedAt" DATETIME,
    "dmcaStrikeCount" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "twoFactorSecret" TEXT,
    "twoFactorEnabledAt" DATETIME,
    "locale" TEXT,
    "timezone" TEXT,
    "deletionScheduledFor" DATETIME,
    "accessibilityPrefsJson" TEXT,
    "stripeCustomerId" TEXT,
    "coinBalance" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("accessibilityPrefsJson", "ageVerifiedAt", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "isPlatformAdmin", "lastActiveAt", "locale", "passwordHash", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt") SELECT "accessibilityPrefsJson", "ageVerifiedAt", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "isPlatformAdmin", "lastActiveAt", "locale", "passwordHash", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CoinTopUpRequest_referenceCode_key" ON "CoinTopUpRequest"("referenceCode");

-- CreateIndex
CREATE INDEX "CoinTopUpRequest_userId_status_idx" ON "CoinTopUpRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "CoinTopUpRequest_status_createdAt_idx" ON "CoinTopUpRequest"("status", "createdAt");
