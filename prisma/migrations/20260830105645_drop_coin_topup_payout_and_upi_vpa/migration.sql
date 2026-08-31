/*
  Warnings:

  - You are about to drop the `CoinPayoutRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CoinTopUpRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `payoutUpiVpa` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CoinPayoutRequest_status_createdAt_idx";

-- DropIndex
DROP INDEX "CoinPayoutRequest_userId_status_idx";

-- DropIndex
DROP INDEX "CoinTopUpRequest_status_createdAt_idx";

-- DropIndex
DROP INDEX "CoinTopUpRequest_userId_status_idx";

-- DropIndex
DROP INDEX "CoinTopUpRequest_referenceCode_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CoinPayoutRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CoinTopUpRequest";
PRAGMA foreign_keys=on;

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
INSERT INTO "new_User" ("accessibilityPrefsJson", "ageVerifiedAt", "coinBalance", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "lastActiveAt", "locale", "passwordHash", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt") SELECT "accessibilityPrefsJson", "ageVerifiedAt", "coinBalance", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "lastActiveAt", "locale", "passwordHash", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
