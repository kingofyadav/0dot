-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN "expiresAt" DATETIME;

-- CreateIndex
CREATE INDEX "LedgerTransaction_kind_expiresAt_idx" ON "LedgerTransaction"("kind", "expiresAt");

-- Backfill: grant expiry used to live in metadataJson.expiresAt (an ISO
-- string). Promote it to the real column so the promo-expiry sweep can
-- query an index instead of scanning every promo account.
UPDATE "LedgerTransaction"
SET "expiresAt" = json_extract("metadataJson", '$.expiresAt')
WHERE "kind" IN ('signup_grant', 'promo_grant', 'referral_reward')
  AND json_valid("metadataJson")
  AND json_extract("metadataJson", '$.expiresAt') IS NOT NULL;
