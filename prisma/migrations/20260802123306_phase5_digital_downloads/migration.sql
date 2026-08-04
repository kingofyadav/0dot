-- CreateTable
CREATE TABLE "DigitalProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "fileKey" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalProduct_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigitalProductPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalProductPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DigitalProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DigitalProductPurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DigitalProductPurchase_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DigitalProduct_creatorId_status_idx" ON "DigitalProduct"("creatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalProductPurchase_paymentTransactionId_key" ON "DigitalProductPurchase"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "DigitalProductPurchase_buyerId_idx" ON "DigitalProductPurchase"("buyerId");

-- CreateIndex
CREATE INDEX "DigitalProductPurchase_productId_idx" ON "DigitalProductPurchase"("productId");
