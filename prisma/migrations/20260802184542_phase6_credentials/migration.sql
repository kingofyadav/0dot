-- CreateTable
CREATE TABLE "ResearchPaper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "venue" TEXT,
    "publishDate" DATETIME,
    "doiOrUrl" TEXT,
    "fileUrl" TEXT,
    "abstract" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ResearchPaper_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResearchPaper_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingOrg" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "expiryDate" DATETIME,
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "badgeImageUrl" TEXT,
    CONSTRAINT "Certificate_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingOrg" TEXT,
    "awardedDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    CONSTRAINT "Award_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ResearchPaper_profileId_idx" ON "ResearchPaper"("profileId");

-- CreateIndex
CREATE INDEX "Certificate_profileId_idx" ON "Certificate"("profileId");

-- CreateIndex
CREATE INDEX "Award_profileId_idx" ON "Award"("profileId");
