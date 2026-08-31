-- addendum-coin-wallet-v2.md §16 step 5 — the coin ledger
-- (LedgerAccount/LedgerTransaction/LedgerPosting) is now the sole source of
-- truth for coin balances; the dual-written User.coinBalance mirror is
-- retired. The column has no index, FK, or constraint beyond its default,
-- so a plain DROP COLUMN (SQLite >= 3.35 / libSQL) is safe.
ALTER TABLE "User" DROP COLUMN "coinBalance";
