-- AlterTable
ALTER TABLE "CreatorPayoutAccount" ADD COLUMN "country" TEXT;

-- Backfill: every existing row was created via the old hardcoded
-- PAYOUT_ACCOUNT_COUNTRY = "IN" path in payments.ts -- record that history
-- rather than leaving it ambiguously null.
UPDATE "CreatorPayoutAccount" SET "country" = 'IN' WHERE "country" IS NULL;
