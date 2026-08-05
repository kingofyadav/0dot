-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "businessId" TEXT,
    "domain" TEXT,
    "domainVerificationToken" TEXT,
    "domainVerifiedAt" DATETIME,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Organization_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Organization_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "department" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("organizationId", "userId"),
    CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SSOConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "idpMetadataJson" TEXT NOT NULL,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SSOConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SSOIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ssoConnectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalSubjectId" TEXT NOT NULL,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SSOIdentity_ssoConnectionId_fkey" FOREIGN KEY ("ssoConnectionId") REFERENCES "SSOConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SSOIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Community" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "createdBy" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "wikiEditPolicy" TEXT NOT NULL DEFAULT 'moderators',
    "restrictedToOrganizationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Community_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Community_restrictedToOrganizationId_fkey" FOREIGN KEY ("restrictedToOrganizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Community" ("avatarUrl", "coverUrl", "createdAt", "createdBy", "description", "id", "memberCount", "name", "slug", "updatedAt", "visibility", "wikiEditPolicy") SELECT "avatarUrl", "coverUrl", "createdAt", "createdBy", "description", "id", "memberCount", "name", "slug", "updatedAt", "visibility", "wikiEditPolicy" FROM "Community";
DROP TABLE "Community";
ALTER TABLE "new_Community" RENAME TO "Community";
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
CREATE INDEX "Community_restrictedToOrganizationId_idx" ON "Community"("restrictedToOrganizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_domain_key" ON "Organization"("domain");

-- CreateIndex
CREATE INDEX "Organization_businessId_idx" ON "Organization"("businessId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SSOConnection_organizationId_key" ON "SSOConnection"("organizationId");

-- CreateIndex
CREATE INDEX "SSOIdentity_userId_idx" ON "SSOIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SSOIdentity_ssoConnectionId_externalSubjectId_key" ON "SSOIdentity"("ssoConnectionId", "externalSubjectId");

-- CreateIndex
CREATE INDEX "OrganizationAuditLog_organizationId_createdAt_idx" ON "OrganizationAuditLog"("organizationId", "createdAt");
