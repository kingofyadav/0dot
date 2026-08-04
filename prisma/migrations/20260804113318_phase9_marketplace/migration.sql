-- CreateTable
CREATE TABLE "OfferingPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offeringId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferingPurchase_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferingPurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferingPurchase_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerType" TEXT NOT NULL,
    "sellerUserId" TEXT,
    "sellerBusinessId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" REAL,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "payload" TEXT NOT NULL,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_sellerBusinessId_fkey" FOREIGN KEY ("sellerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplacePurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "paymentTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplacePurchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplacePurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplacePurchase_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstalledApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "installerType" TEXT NOT NULL,
    "installerUserId" TEXT,
    "installerBusinessId" TEXT,
    "installerCommunityId" TEXT,
    "config" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstalledApp_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstalledApp_installerUserId_fkey" FOREIGN KEY ("installerUserId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstalledApp_installerBusinessId_fkey" FOREIGN KEY ("installerBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstalledApp_installerCommunityId_fkey" FOREIGN KEY ("installerCommunityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplaceListingReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceListingReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListingReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplaceListingReviewResponse" (
    "reviewId" TEXT NOT NULL PRIMARY KEY,
    "responderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceListingReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "MarketplaceListingReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListingReviewResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT,
    "sellerUserId" TEXT,
    "offeringId" TEXT,
    "customerId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("businessId", "createdAt", "customerId", "endsAt", "id", "notes", "offeringId", "startsAt", "status", "teamMemberId") SELECT "businessId", "createdAt", "customerId", "endsAt", "id", "notes", "offeringId", "startsAt", "status", "teamMemberId" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE INDEX "Appointment_businessId_teamMemberId_startsAt_idx" ON "Appointment"("businessId", "teamMemberId", "startsAt");
CREATE INDEX "Appointment_sellerUserId_startsAt_idx" ON "Appointment"("sellerUserId", "startsAt");
CREATE TABLE "new_AvailabilityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT,
    "sellerUserId" TEXT,
    "teamMemberId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startsAtLocal" TEXT NOT NULL,
    "endsAtLocal" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    CONSTRAINT "AvailabilityRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AvailabilityRule_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AvailabilityRule_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AvailabilityRule" ("businessId", "dayOfWeek", "endsAtLocal", "id", "startsAtLocal", "teamMemberId", "timezone") SELECT "businessId", "dayOfWeek", "endsAtLocal", "id", "startsAtLocal", "teamMemberId", "timezone" FROM "AvailabilityRule";
DROP TABLE "AvailabilityRule";
ALTER TABLE "new_AvailabilityRule" RENAME TO "AvailabilityRule";
CREATE INDEX "AvailabilityRule_businessId_teamMemberId_dayOfWeek_idx" ON "AvailabilityRule"("businessId", "teamMemberId", "dayOfWeek");
CREATE INDEX "AvailabilityRule_sellerUserId_dayOfWeek_idx" ON "AvailabilityRule"("sellerUserId", "dayOfWeek");
CREATE TABLE "new_Offering" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT,
    "sellerUserId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imagesJson" TEXT,
    "price" REAL,
    "currency" TEXT,
    "paymentLinkUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sku" TEXT,
    "stockStatus" TEXT,
    "isBookable" BOOLEAN,
    "durationMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offering_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offering_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Offering" ("businessId", "createdAt", "currency", "description", "durationMinutes", "id", "imagesJson", "isBookable", "kind", "name", "paymentLinkUrl", "price", "sku", "status", "stockStatus", "updatedAt") SELECT "businessId", "createdAt", "currency", "description", "durationMinutes", "id", "imagesJson", "isBookable", "kind", "name", "paymentLinkUrl", "price", "sku", "status", "stockStatus", "updatedAt" FROM "Offering";
DROP TABLE "Offering";
ALTER TABLE "new_Offering" RENAME TO "Offering";
CREATE INDEX "Offering_businessId_status_idx" ON "Offering"("businessId", "status");
CREATE INDEX "Offering_sellerUserId_status_idx" ON "Offering"("sellerUserId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OfferingPurchase_paymentTransactionId_key" ON "OfferingPurchase"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "OfferingPurchase_offeringId_idx" ON "OfferingPurchase"("offeringId");

-- CreateIndex
CREATE INDEX "OfferingPurchase_buyerId_idx" ON "OfferingPurchase"("buyerId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_category_idx" ON "MarketplaceListing"("status", "category");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerUserId_idx" ON "MarketplaceListing"("sellerUserId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerBusinessId_idx" ON "MarketplaceListing"("sellerBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePurchase_paymentTransactionId_key" ON "MarketplacePurchase"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_buyerId_idx" ON "MarketplacePurchase"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePurchase_listingId_buyerId_key" ON "MarketplacePurchase"("listingId", "buyerId");

-- CreateIndex
CREATE INDEX "InstalledApp_listingId_idx" ON "InstalledApp"("listingId");

-- CreateIndex
CREATE INDEX "InstalledApp_installerUserId_idx" ON "InstalledApp"("installerUserId");

-- CreateIndex
CREATE INDEX "InstalledApp_installerBusinessId_idx" ON "InstalledApp"("installerBusinessId");

-- CreateIndex
CREATE INDEX "InstalledApp_installerCommunityId_idx" ON "InstalledApp"("installerCommunityId");

-- CreateIndex
CREATE INDEX "MarketplaceListingReview_listingId_idx" ON "MarketplaceListingReview"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingReview_listingId_authorId_key" ON "MarketplaceListingReview"("listingId", "authorId");
