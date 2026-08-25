-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FundraisingCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizerType" TEXT NOT NULL,
    "organizerUserId" TEXT,
    "organizerBusinessId" TEXT,
    "organizerOrganizationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "goalAmount" REAL,
    "currency" TEXT NOT NULL,
    "raisedAmount" REAL NOT NULL DEFAULT 0,
    "endsAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundraisingCampaign_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FundraisingCampaign_organizerBusinessId_fkey" FOREIGN KEY ("organizerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FundraisingCampaign_organizerOrganizationId_fkey" FOREIGN KEY ("organizerOrganizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FundraisingCampaign" ("createdAt", "currency", "endsAt", "goalAmount", "id", "organizerBusinessId", "organizerOrganizationId", "organizerType", "organizerUserId", "raisedAmount", "status", "title") SELECT "createdAt", "currency", "endsAt", "goalAmount", "id", "organizerBusinessId", "organizerOrganizationId", "organizerType", "organizerUserId", "raisedAmount", "status", "title" FROM "FundraisingCampaign";
DROP TABLE "FundraisingCampaign";
ALTER TABLE "new_FundraisingCampaign" RENAME TO "FundraisingCampaign";
CREATE INDEX "FundraisingCampaign_organizerUserId_idx" ON "FundraisingCampaign"("organizerUserId");
CREATE INDEX "FundraisingCampaign_organizerBusinessId_idx" ON "FundraisingCampaign"("organizerBusinessId");
CREATE INDEX "FundraisingCampaign_organizerOrganizationId_idx" ON "FundraisingCampaign"("organizerOrganizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
