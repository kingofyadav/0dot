-- CreateTable
CREATE TABLE "CreatorPayoutAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "processor" TEXT NOT NULL DEFAULT 'stub',
    "processorAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payerId" TEXT,
    "payeeId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "platformFee" REAL NOT NULL,
    "processorReference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "relatedObjectType" TEXT,
    "relatedObjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "toCreatorId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "message" TEXT,
    "paymentTransactionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tip_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tip_toCreatorId_fkey" FOREIGN KEY ("toCreatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tip_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPayoutAccount_userId_key" ON "CreatorPayoutAccount"("userId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_payeeId_createdAt_idx" ON "PaymentTransaction"("payeeId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_payerId_idx" ON "PaymentTransaction"("payerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_paymentTransactionId_key" ON "Tip"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "Tip_toCreatorId_createdAt_idx" ON "Tip"("toCreatorId", "createdAt");
