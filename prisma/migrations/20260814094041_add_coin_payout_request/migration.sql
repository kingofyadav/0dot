-- CreateTable
CREATE TABLE "CoinPayoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "coinAmount" INTEGER NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "vpa" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidReference" TEXT,
    "reviewedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinPayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoinPayoutRequest_userId_status_idx" ON "CoinPayoutRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "CoinPayoutRequest_status_createdAt_idx" ON "CoinPayoutRequest"("status", "createdAt");
