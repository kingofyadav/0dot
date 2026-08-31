import "server-only";
import { Prisma } from "@/generated/prisma/client";

// addendum-coin-wallet-v2.md §5 — account resolution for the coin ledger.
// Every wallet mutation takes an explicit userId and runs inside a Prisma
// interactive transaction; these helpers take that transaction client so
// account creation and the postings that touch it commit together.

// Fixed IDs, seeded once by migration 20260830110844_add_coin_ledger.
// Mirrored there — do not change without a migration.
export const SYSTEM_ACCOUNT_IDS = {
  system_platform_revenue: "00000000-0000-4000-8000-000000000001",
  system_promo_issuance: "00000000-0000-4000-8000-000000000002",
  system_escrow: "00000000-0000-4000-8000-000000000003",
  system_refund_source: "00000000-0000-4000-8000-000000000004",
  system_external_suspense: "00000000-0000-4000-8000-000000000005",
} as const;

export type SystemAccountType = keyof typeof SYSTEM_ACCOUNT_IDS;

export type UserAccounts = { walletId: string; promoId: string };

// Idempotent: creates the user_wallet + user_promo pair on first use and
// returns both ids. Safe to call on every wallet mutation.
export async function ensureUserAccounts(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<UserAccounts> {
  for (const type of ["user_wallet", "user_promo"] as const) {
    await tx.ledgerAccount.upsert({
      where: { type_ownerUserId: { type, ownerUserId: userId } },
      create: { type, ownerUserId: userId },
      update: {},
    });
  }

  const accounts = await tx.ledgerAccount.findMany({
    where: { ownerUserId: userId, type: { in: ["user_wallet", "user_promo"] } },
    select: { id: true, type: true },
  });
  const walletId = accounts.find((a) => a.type === "user_wallet")?.id;
  const promoId = accounts.find((a) => a.type === "user_promo")?.id;
  if (!walletId || !promoId) {
    throw new Error(`ensureUserAccounts: could not resolve accounts for user ${userId}`);
  }
  return { walletId, promoId };
}

export type BusinessAccounts = { walletId: string; promoId: string };

// addendum-coin-wallet-v2.md §6.5 — a Business's spendable + restricted
// account pair, created lazily on first credit or first visit to its
// wallet screen.
export async function ensureBusinessAccounts(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<BusinessAccounts> {
  for (const type of ["business_wallet", "business_promo"] as const) {
    await tx.ledgerAccount.upsert({
      where: { type_ownerBusinessId: { type, ownerBusinessId: businessId } },
      create: { type, ownerBusinessId: businessId },
      update: {},
    });
  }

  const accounts = await tx.ledgerAccount.findMany({
    where: { ownerBusinessId: businessId, type: { in: ["business_wallet", "business_promo"] } },
    select: { id: true, type: true },
  });
  const walletId = accounts.find((a) => a.type === "business_wallet")?.id;
  const promoId = accounts.find((a) => a.type === "business_promo")?.id;
  if (!walletId || !promoId) {
    throw new Error(`ensureBusinessAccounts: could not resolve accounts for business ${businessId}`);
  }
  return { walletId, promoId };
}
