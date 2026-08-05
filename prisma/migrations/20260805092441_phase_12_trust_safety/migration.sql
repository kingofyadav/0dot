-- AlterTable
ALTER TABLE "User" ADD COLUMN "ageVerifiedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATETIME;

-- CreateTable
CREATE TABLE "TrustSafetyStaffRole" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    CONSTRAINT "TrustSafetyStaffRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrustSafetyCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseType" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reportedById" TEXT,
    "linkedAiGenerationId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedToId" TEXT,
    "resolutionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "TrustSafetyCase_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TrustSafetyCase_linkedAiGenerationId_fkey" FOREIGN KEY ("linkedAiGenerationId") REFERENCES "AIGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TrustSafetyCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporterId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "caseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TrustSafetyCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalCaseId" TEXT NOT NULL,
    "filedById" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appeal_originalCaseId_fkey" FOREIGN KEY ("originalCaseId") REFERENCES "TrustSafetyCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appeal_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appeal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountRiskSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "aiGenerationId" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountRiskSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountRiskSignal_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AIGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrustSafetyCase_status_createdAt_idx" ON "TrustSafetyCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrustSafetyCase_subjectType_subjectId_idx" ON "TrustSafetyCase"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "TrustSafetyCase_caseType_status_idx" ON "TrustSafetyCase"("caseType", "status");

-- CreateIndex
CREATE INDEX "Report_subjectType_subjectId_idx" ON "Report"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Appeal_originalCaseId_idx" ON "Appeal"("originalCaseId");

-- CreateIndex
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccountRiskSignal_userId_detectedAt_idx" ON "AccountRiskSignal"("userId", "detectedAt");
