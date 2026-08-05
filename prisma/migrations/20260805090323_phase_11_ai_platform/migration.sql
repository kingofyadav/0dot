-- CreateTable
CREATE TABLE "AIGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "requestedById" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "modelName" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT NOT NULL,
    "accepted" BOOLEAN,
    "costTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIGeneration_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModerationFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "aiGenerationId" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_human_review',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationFlag_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AIGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModerationFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAccessibilityMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileAssetId" TEXT,
    "legacySubjectType" TEXT,
    "legacySubjectId" TEXT,
    "legacyFieldName" TEXT,
    "altText" TEXT,
    "captionVttUrl" TEXT,
    "transcript" TEXT,
    "aiGenerationId" TEXT NOT NULL,
    "humanEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaAccessibilityMetadata_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAccessibilityMetadata_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AIGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sourceRevisionKey" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "aiGenerationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentTranslation_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AIGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AIGeneration_subjectType_subjectId_idx" ON "AIGeneration"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AIGeneration_requestedById_idx" ON "AIGeneration"("requestedById");

-- CreateIndex
CREATE INDEX "ModerationFlag_subjectType_subjectId_idx" ON "ModerationFlag"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ModerationFlag_status_createdAt_idx" ON "ModerationFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FileAsset_uploadedById_idx" ON "FileAsset"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAccessibilityMetadata_fileAssetId_key" ON "MediaAccessibilityMetadata"("fileAssetId");

-- CreateIndex
CREATE INDEX "MediaAccessibilityMetadata_legacySubjectType_legacySubjectId_idx" ON "MediaAccessibilityMetadata"("legacySubjectType", "legacySubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTranslation_subjectType_subjectId_sourceRevisionKey_targetLanguage_key" ON "ContentTranslation"("subjectType", "subjectId", "sourceRevisionKey", "targetLanguage");
