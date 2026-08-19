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
    "isPublicClient" BOOLEAN NOT NULL DEFAULT false,
    "redirectUrisJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingPlan" TEXT NOT NULL DEFAULT 'free',
    "lastBilledAt" DATETIME,
    "apiSubscriptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperApp_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeveloperApp_ownerBusinessId_fkey" FOREIGN KEY ("ownerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeveloperApp" ("apiSubscriptionId", "billingPlan", "clientId", "clientSecretHash", "createdAt", "description", "id", "lastBilledAt", "name", "ownerBusinessId", "ownerType", "ownerUserId", "redirectUrisJson", "status") SELECT "apiSubscriptionId", "billingPlan", "clientId", "clientSecretHash", "createdAt", "description", "id", "lastBilledAt", "name", "ownerBusinessId", "ownerType", "ownerUserId", "redirectUrisJson", "status" FROM "DeveloperApp";
DROP TABLE "DeveloperApp";
ALTER TABLE "new_DeveloperApp" RENAME TO "DeveloperApp";
CREATE UNIQUE INDEX "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");
CREATE INDEX "DeveloperApp_ownerUserId_idx" ON "DeveloperApp"("ownerUserId");
CREATE INDEX "DeveloperApp_ownerBusinessId_idx" ON "DeveloperApp"("ownerBusinessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineIndex
DROP INDEX "Session_token_key";
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
