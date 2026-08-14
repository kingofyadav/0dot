/*
  Warnings:

  - Added the required column `amountInr` to the `CoinTopUpRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "payoutUpiVpa" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CoinTopUpRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "coinAmount" INTEGER NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "utr" TEXT,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinTopUpRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CoinTopUpRequest" ("coinAmount", "createdAt", "id", "referenceCode", "reviewNote", "reviewedAt", "reviewedByUserId", "status", "submittedAt", "userId", "utr") SELECT "coinAmount", "createdAt", "id", "referenceCode", "reviewNote", "reviewedAt", "reviewedByUserId", "status", "submittedAt", "userId", "utr" FROM "CoinTopUpRequest";
DROP TABLE "CoinTopUpRequest";
ALTER TABLE "new_CoinTopUpRequest" RENAME TO "CoinTopUpRequest";
CREATE UNIQUE INDEX "CoinTopUpRequest_referenceCode_key" ON "CoinTopUpRequest"("referenceCode");
CREATE INDEX "CoinTopUpRequest_userId_status_idx" ON "CoinTopUpRequest"("userId", "status");
CREATE INDEX "CoinTopUpRequest_status_createdAt_idx" ON "CoinTopUpRequest"("status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
