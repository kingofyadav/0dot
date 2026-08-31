import "server-only";
import { Prisma, type LedgerTransaction } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { unitsToCoins } from "@/lib/wallet/limits";
import { ensureBusinessAccounts } from "@/lib/wallet/accounts";

// addendum-coin-wallet-v2.md §4–§5 — the double-entry primitive every coin
// movement goes through. Callers MUST invoke postTransaction (and the
// helpers below) inside a Prisma interactive `db.$transaction(...)`: the
// balance guards throw on insufficient funds and rely on that outer
// transaction to roll the just-written rows back.

const OWNER_ACCOUNT_TYPES = new Set([
  "user_wallet",
  "user_promo",
  "business_wallet",
  "business_promo",
]);

export class WalletError extends Error {
  code: "INSUFFICIENT_FUNDS" | "IMBALANCED" | "BAD_REQUEST";
  constructor(code: WalletError["code"], message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export type PostingInput = { accountId: string; amount: number };

export type PostTransactionInput = {
  kind: string;
  idempotencyKey: string;
  actorUserId?: string | null;
  memo?: string | null;
  relatedObjectType?: string | null;
  relatedObjectId?: string | null;
  paymentTransactionId?: string | null;
  expiresAt?: Date | null; // grant kinds only — drives the promo-expiry sweep
  metadata?: Record<string, unknown>;
  postings: PostingInput[];
};

export type PostTransactionResult = {
  transaction: LedgerTransaction;
  // false on an idempotency-key hit — the transaction already existed and
  // no balances moved. Callers with their own side-effects (a CoinTransfer
  // row, a notification, a feature row) MUST skip them when this is false.
  created: boolean;
};

// Posts one balanced transaction: asserts the postings sum to zero, dedupes
// on idempotencyKey (returning the existing transaction, `created: false`,
// on a hit), writes the transaction + its postings, then moves every
// touched account's cachedBalance in the same DB transaction — guarding
// owner accounts (user_/business_) against going negative.
export async function postTransaction(
  tx: Prisma.TransactionClient,
  input: PostTransactionInput,
): Promise<PostTransactionResult> {
  const { postings } = input;
  if (postings.length < 2) {
    throw new WalletError("IMBALANCED", "a ledger transaction needs at least two postings");
  }
  const sum = postings.reduce((s, p) => s + p.amount, 0);
  if (sum !== 0) {
    throw new WalletError("IMBALANCED", `postings do not sum to zero (got ${sum})`);
  }
  if (postings.some((p) => !Number.isInteger(p.amount) || p.amount === 0)) {
    throw new WalletError("BAD_REQUEST", "every posting amount must be a non-zero integer");
  }

  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { transaction: existing, created: false };

  // Collapse repeated accounts so each guard + cachedBalance update runs once.
  const byAccount = new Map<string, number>();
  for (const p of postings) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? 0) + p.amount);

  const accounts = await tx.ledgerAccount.findMany({
    where: { id: { in: [...byAccount.keys()] } },
    select: { id: true, type: true },
  });
  if (accounts.length !== byAccount.size) {
    throw new WalletError("BAD_REQUEST", "postings reference an unknown ledger account");
  }
  const typeById = new Map(accounts.map((a) => [a.id, a.type]));

  let created;
  try {
    created = await tx.ledgerTransaction.create({
      data: {
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId ?? null,
        memo: input.memo ?? null,
        relatedObjectType: input.relatedObjectType ?? null,
        relatedObjectId: input.relatedObjectId ?? null,
        paymentTransactionId: input.paymentTransactionId ?? null,
        expiresAt: input.expiresAt ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        postings: { create: postings.map((p) => ({ accountId: p.accountId, amount: p.amount })) },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const now = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (now) return { transaction: now, created: false };
    }
    throw err;
  }

  for (const [accountId, delta] of byAccount) {
    const guard = OWNER_ACCOUNT_TYPES.has(typeById.get(accountId)!) && delta < 0;
    if (guard) {
      const res = await tx.ledgerAccount.updateMany({
        where: { id: accountId, cachedBalance: { gte: -delta } },
        data: { cachedBalance: { increment: delta } },
      });
      if (res.count === 0) {
        throw new WalletError("INSUFFICIENT_FUNDS", "insufficient wallet balance");
      }
    } else {
      await tx.ledgerAccount.update({
        where: { id: accountId },
        data: { cachedBalance: { increment: delta } },
      });
    }
  }

  return { transaction: created, created: true };
}

export type WalletBalance = {
  spendable: number;
  restricted: number;
  total: number;
  spendableUnits: number;
  restrictedUnits: number;
  totalUnits: number;
};

export async function getWalletBalance(userId: string): Promise<WalletBalance> {
  const accounts = await db.ledgerAccount.findMany({
    where: { ownerUserId: userId, type: { in: ["user_wallet", "user_promo"] } },
    select: { type: true, cachedBalance: true },
  });
  const spendableUnits = accounts.find((a) => a.type === "user_wallet")?.cachedBalance ?? 0;
  const restrictedUnits = accounts.find((a) => a.type === "user_promo")?.cachedBalance ?? 0;
  return {
    spendable: unitsToCoins(spendableUnits),
    restricted: unitsToCoins(restrictedUnits),
    total: unitsToCoins(spendableUnits + restrictedUnits),
    spendableUnits,
    restrictedUnits,
    totalUnits: spendableUnits + restrictedUnits,
  };
}

export async function getBusinessWalletBalance(businessId: string): Promise<WalletBalance> {
  const accounts = await db.ledgerAccount.findMany({
    where: { ownerBusinessId: businessId, type: { in: ["business_wallet", "business_promo"] } },
    select: { type: true, cachedBalance: true },
  });
  const spendableUnits = accounts.find((a) => a.type === "business_wallet")?.cachedBalance ?? 0;
  const restrictedUnits = accounts.find((a) => a.type === "business_promo")?.cachedBalance ?? 0;
  return {
    spendable: unitsToCoins(spendableUnits),
    restricted: unitsToCoins(restrictedUnits),
    total: unitsToCoins(spendableUnits + restrictedUnits),
    spendableUnits,
    restrictedUnits,
    totalUnits: spendableUnits + restrictedUnits,
  };
}

// A Business spending its own wallet on platform goods it buys from 0dot
// (its subscription today). Promo (restricted) bucket first, then spendable,
// crediting `creditAccountId`. The user counterpart is chargeWallet with no
// external payee.
export async function spendBusinessCoins(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    units: number;
    creditAccountId: string;
    kind: string;
    idempotencyKey: string;
    actorUserId?: string | null;
    relatedObjectType?: string | null;
    relatedObjectId?: string | null;
    memo?: string | null;
  },
) {
  const { walletId, promoId } = await ensureBusinessAccounts(tx, params.businessId);
  const promo = await tx.ledgerAccount.findUniqueOrThrow({
    where: { id: promoId },
    select: { cachedBalance: true },
  });
  const fromPromo = Math.min(Math.max(promo.cachedBalance, 0), params.units);
  const fromWallet = params.units - fromPromo;

  const postings: PostingInput[] = [{ accountId: params.creditAccountId, amount: params.units }];
  if (fromPromo > 0) postings.push({ accountId: promoId, amount: -fromPromo });
  if (fromWallet > 0) postings.push({ accountId: walletId, amount: -fromWallet });

  return postTransaction(tx, {
    kind: params.kind,
    idempotencyKey: params.idempotencyKey,
    actorUserId: params.actorUserId,
    memo: params.memo,
    relatedObjectType: params.relatedObjectType,
    relatedObjectId: params.relatedObjectId,
    postings,
  });
}

type ListOpts = { cursor?: string | null; kind?: string; limit?: number };

export function listTransactions(userId: string, opts: ListOpts = {}) {
  return listLedgerEntries({ ownerUserId: userId }, opts);
}

export function listBusinessTransactions(businessId: string, opts: ListOpts = {}) {
  return listLedgerEntries({ ownerBusinessId: businessId }, opts);
}

// A single ledger transaction writes 2–3 postings with an identical
// createdAt, so a createdAt-only cursor drops the rest of a transaction
// straddling a page boundary. Cursor is a `<iso>|<postingId>` tuple,
// matched with the standard keyset OR (same convention as Notification).
function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.lastIndexOf("|");
  if (sep < 0) return null;
  const createdAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  return Number.isNaN(createdAt.getTime()) || !id ? null : { createdAt, id };
}

async function listLedgerEntries(
  accountWhere: { ownerUserId: string } | { ownerBusinessId: string },
  { cursor, kind, limit = 20 }: ListOpts,
) {
  const accounts = await db.ledgerAccount.findMany({
    where: accountWhere,
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return { entries: [], nextCursor: null as string | null };

  const after = decodeCursor(cursor);
  const rows = await db.ledgerPosting.findMany({
    where: {
      accountId: { in: accountIds },
      ...(kind ? { transaction: { is: { kind } } } : {}),
      ...(after
        ? {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { transaction: true },
  });

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null;

  // The ledger `kind` is coarse ("purchase" / "hold_capture" for every coin
  // sale, whatever the feature). The feature is on the linked
  // PaymentTransaction's `kind` (tip | donation | business_purchase |
  // ticket_purchase | ...) — resolve it so the wallet activity list can
  // label a coin sale for what it actually was (review finding #2). One
  // extra query per page; there is no Prisma relation to `include`.
  const ptIds = [
    ...new Set(page.map((p) => p.transaction.paymentTransactionId).filter((id): id is string => Boolean(id))),
  ];
  const ptKindById = new Map<string, string>();
  if (ptIds.length) {
    const pts = await db.paymentTransaction.findMany({
      where: { id: { in: ptIds } },
      select: { id: true, kind: true },
    });
    for (const pt of pts) ptKindById.set(pt.id, pt.kind);
  }

  return {
    entries: page.map((p) => {
      const ptKind = p.transaction.paymentTransactionId
        ? ptKindById.get(p.transaction.paymentTransactionId)
        : undefined;
      return {
        id: p.id,
        transactionId: p.transactionId,
        kind: p.transaction.kind,
        // What moved the coins: the PaymentTransaction kind for a
        // purchase/refund row, else the ledger kind itself.
        feature: ptKind ?? p.transaction.kind,
        direction: p.amount > 0 ? ("in" as const) : ("out" as const),
        amountCoins: unitsToCoins(p.amount),
        memo: p.transaction.memo,
        createdAt: p.createdAt,
      };
    }),
    nextCursor,
  };
}
