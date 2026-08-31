-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerBusinessId" TEXT,
    "cachedBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorUserId" TEXT,
    "memo" TEXT,
    "relatedObjectType" TEXT,
    "relatedObjectId" TEXT,
    "paymentTransactionId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LedgerPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "relatedObjectType" TEXT,
    "relatedObjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerHold_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LedgerAccount_ownerUserId_idx" ON "LedgerAccount"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_type_ownerUserId_key" ON "LedgerAccount"("type", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_type_ownerBusinessId_key" ON "LedgerAccount"("type", "ownerBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerTransaction_kind_createdAt_idx" ON "LedgerTransaction"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_actorUserId_createdAt_idx" ON "LedgerTransaction"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerPosting_accountId_createdAt_idx" ON "LedgerPosting"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerPosting_transactionId_idx" ON "LedgerPosting"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerHold_transactionId_key" ON "LedgerHold"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerHold_state_expiresAt_idx" ON "LedgerHold"("state", "expiresAt");

-- ─────────────────────────────────────────────────────────────────────────
-- Seed + backfill (addendum-coin-wallet-v2.md §16 steps 1–2).
-- IDs are generated with lower(hex(randomblob(16))) — SQLite/libSQL have no
-- uuid() and Prisma's @default(uuid()) is client-side only. The fixed
-- system-account IDs below are mirrored in src/lib/wallet/accounts.ts.
-- ─────────────────────────────────────────────────────────────────────────

-- System accounts (one row each, owner columns null).
INSERT INTO "LedgerAccount" ("id", "type", "cachedBalance") VALUES
  ('00000000-0000-4000-8000-000000000001', 'system_platform_revenue', 0),
  ('00000000-0000-4000-8000-000000000002', 'system_promo_issuance', 0),
  ('00000000-0000-4000-8000-000000000003', 'system_escrow', 0),
  ('00000000-0000-4000-8000-000000000004', 'system_refund_source', 0),
  ('00000000-0000-4000-8000-000000000005', 'system_external_suspense', 0);

-- Per-user account pair. user_wallet (spendable) opens at zero; the whole
-- existing coinBalance lands in user_promo (restricted) — every coin issued
-- to date was a signup bonus, which is restricted going forward.
INSERT INTO "LedgerAccount" ("id", "type", "ownerUserId", "cachedBalance")
SELECT lower(hex(randomblob(16))), 'user_wallet', "id", 0 FROM "User";

INSERT INTO "LedgerAccount" ("id", "type", "ownerUserId", "cachedBalance")
SELECT lower(hex(randomblob(16))), 'user_promo', "id", "coinBalance" * 100 FROM "User";

-- One migration_opening transaction per user with a balance, keyed by user
-- id so the postings below can join back to it.
INSERT INTO "LedgerTransaction" ("id", "kind", "idempotencyKey", "memo")
SELECT lower(hex(randomblob(16))), 'migration_opening', 'migration_opening:' || "id",
       'Opening balance migrated from User.coinBalance'
FROM "User" WHERE "coinBalance" > 0;

-- Credit the user's promo account…
INSERT INTO "LedgerPosting" ("id", "transactionId", "accountId", "amount")
SELECT lower(hex(randomblob(16))), t."id", a."id", u."coinBalance" * 100
FROM "User" u
JOIN "LedgerTransaction" t ON t."idempotencyKey" = 'migration_opening:' || u."id"
JOIN "LedgerAccount" a ON a."type" = 'user_promo' AND a."ownerUserId" = u."id"
WHERE u."coinBalance" > 0;

-- …against system_promo_issuance (which runs negative by design — it is the
-- source of all granted coins).
INSERT INTO "LedgerPosting" ("id", "transactionId", "accountId", "amount")
SELECT lower(hex(randomblob(16))), t."id", '00000000-0000-4000-8000-000000000002', -(u."coinBalance" * 100)
FROM "User" u
JOIN "LedgerTransaction" t ON t."idempotencyKey" = 'migration_opening:' || u."id"
WHERE u."coinBalance" > 0;

UPDATE "LedgerAccount"
SET "cachedBalance" = -(SELECT COALESCE(SUM("coinBalance"), 0) * 100 FROM "User" WHERE "coinBalance" > 0)
WHERE "id" = '00000000-0000-4000-8000-000000000002';
