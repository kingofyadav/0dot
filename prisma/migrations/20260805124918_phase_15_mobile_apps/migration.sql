-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "appClientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationDeliveryPreference" (
    "userId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY ("userId", "notificationType", "channel"),
    CONSTRAINT "NotificationDeliveryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IapPayoutBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processor" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payerId" TEXT,
    "payeeId" TEXT,
    "payeeBusinessId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "platformFee" REAL NOT NULL,
    "processor" TEXT NOT NULL DEFAULT 'stripe_connect',
    "storeFee" REAL,
    "iapPayoutBatchId" TEXT,
    "processorReference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "relatedObjectType" TEXT,
    "relatedObjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_payeeBusinessId_fkey" FOREIGN KEY ("payeeBusinessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_iapPayoutBatchId_fkey" FOREIGN KEY ("iapPayoutBatchId") REFERENCES "IapPayoutBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentTransaction" ("amount", "createdAt", "currency", "id", "kind", "payeeBusinessId", "payeeId", "payerId", "platformFee", "processorReference", "relatedObjectId", "relatedObjectType", "status") SELECT "amount", "createdAt", "currency", "id", "kind", "payeeBusinessId", "payeeId", "payerId", "platformFee", "processorReference", "relatedObjectId", "relatedObjectType", "status" FROM "PaymentTransaction";
DROP TABLE "PaymentTransaction";
ALTER TABLE "new_PaymentTransaction" RENAME TO "PaymentTransaction";
CREATE INDEX "PaymentTransaction_payeeId_createdAt_idx" ON "PaymentTransaction"("payeeId", "createdAt");
CREATE INDEX "PaymentTransaction_payeeBusinessId_createdAt_idx" ON "PaymentTransaction"("payeeBusinessId", "createdAt");
CREATE INDEX "PaymentTransaction_payerId_idx" ON "PaymentTransaction"("payerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DeviceToken_appClientId_idx" ON "DeviceToken"("appClientId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_userId_token_key" ON "DeviceToken"("userId", "token");
