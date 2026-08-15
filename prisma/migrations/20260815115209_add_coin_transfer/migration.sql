-- CreateTable
CREATE TABLE "CoinTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoinTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoinTransfer_fromUserId_createdAt_idx" ON "CoinTransfer"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTransfer_toUserId_createdAt_idx" ON "CoinTransfer"("toUserId", "createdAt");
