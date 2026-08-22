-- CreateTable
CREATE TABLE "PlatformRole" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: TrustSafetyStaffRole.role "reviewer" -> PlatformRole "support"
INSERT INTO "PlatformRole" ("userId", "role")
SELECT "userId", 'support' FROM "TrustSafetyStaffRole" WHERE "role" = 'reviewer';

-- Backfill: TrustSafetyStaffRole.role "senior_reviewer" | "admin" -> PlatformRole "admin"
INSERT OR REPLACE INTO "PlatformRole" ("userId", "role")
SELECT "userId", 'admin' FROM "TrustSafetyStaffRole" WHERE "role" IN ('senior_reviewer', 'admin');

-- Backfill: User.isPlatformAdmin -> PlatformRole "super_admin" (highest rank wins if a user
-- also had a TrustSafetyStaffRole row, since this INSERT OR REPLACE runs last)
INSERT OR REPLACE INTO "PlatformRole" ("userId", "role")
SELECT "id", 'super_admin' FROM "User" WHERE "isPlatformAdmin" = 1;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TrustSafetyStaffRole";
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
    "coinBalance" INTEGER NOT NULL DEFAULT 0,
    "payoutUpiVpa" TEXT
);
INSERT INTO "new_User" ("accessibilityPrefsJson", "ageVerifiedAt", "coinBalance", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "lastActiveAt", "locale", "passwordHash", "payoutUpiVpa", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt") SELECT "accessibilityPrefsJson", "ageVerifiedAt", "coinBalance", "createdAt", "dateOfBirth", "deletionScheduledFor", "dmcaStrikeCount", "email", "emailVerifiedAt", "id", "lastActiveAt", "locale", "passwordHash", "payoutUpiVpa", "phone", "status", "stripeCustomerId", "timezone", "twoFactorEnabledAt", "twoFactorSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
