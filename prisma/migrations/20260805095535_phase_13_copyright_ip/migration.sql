-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentRevision_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentLicense" (
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "customTerms" TEXT,
    "declaredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("subjectType", "subjectId")
);

-- CreateTable
CREATE TABLE "DMCATakedownNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trustSafetyCaseId" TEXT NOT NULL,
    "complainantName" TEXT NOT NULL,
    "complainantContact" TEXT NOT NULL,
    "copyrightedWorkDescription" TEXT NOT NULL,
    "infringingContentSubjectType" TEXT NOT NULL,
    "infringingContentSubjectId" TEXT NOT NULL,
    "goodFaithStatementAccepted" BOOLEAN NOT NULL,
    "accuracyPerjuryStatementAccepted" BOOLEAN NOT NULL,
    "signature" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'received',
    CONSTRAINT "DMCATakedownNotice_trustSafetyCaseId_fkey" FOREIGN KEY ("trustSafetyCaseId") REFERENCES "TrustSafetyCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DMCACounterNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalNoticeId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "goodFaithStatementAccepted" BOOLEAN NOT NULL,
    "consentToJurisdiction" BOOLEAN NOT NULL,
    "signature" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restorationEligibleAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    CONSTRAINT "DMCACounterNotice_originalNoticeId_fkey" FOREIGN KEY ("originalNoticeId") REFERENCES "DMCATakedownNotice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DMCACounterNotice_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OwnershipTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "transferredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    CONSTRAINT "OwnershipTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OwnershipTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JurisdictionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "region" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FileAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "watermarkedUrl" TEXT,
    CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FileAsset" ("contentType", "createdAt", "id", "uploadedById", "url") SELECT "contentType", "createdAt", "id", "uploadedById", "url" FROM "FileAsset";
DROP TABLE "FileAsset";
ALTER TABLE "new_FileAsset" RENAME TO "FileAsset";
CREATE INDEX "FileAsset_uploadedById_idx" ON "FileAsset"("uploadedById");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "dateOfBirth" DATETIME,
    "ageVerifiedAt" DATETIME,
    "dmcaStrikeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("ageVerifiedAt", "createdAt", "dateOfBirth", "email", "emailVerifiedAt", "id", "isPlatformAdmin", "passwordHash", "status", "updatedAt") SELECT "ageVerifiedAt", "createdAt", "dateOfBirth", "email", "emailVerifiedAt", "id", "isPlatformAdmin", "passwordHash", "status", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContentRevision_subjectType_subjectId_createdAt_idx" ON "ContentRevision"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DMCATakedownNotice_trustSafetyCaseId_key" ON "DMCATakedownNotice"("trustSafetyCaseId");

-- CreateIndex
CREATE INDEX "DMCATakedownNotice_infringingContentSubjectType_infringingContentSubjectId_idx" ON "DMCATakedownNotice"("infringingContentSubjectType", "infringingContentSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "DMCACounterNotice_originalNoticeId_key" ON "DMCACounterNotice"("originalNoticeId");

-- CreateIndex
CREATE INDEX "DMCACounterNotice_status_restorationEligibleAt_idx" ON "DMCACounterNotice"("status", "restorationEligibleAt");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_subjectType_subjectId_idx" ON "OwnershipTransfer"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionRule_region_ruleType_key" ON "JurisdictionRule"("region", "ruleType");
