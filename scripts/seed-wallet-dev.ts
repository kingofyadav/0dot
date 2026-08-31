import { randomUUID } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Dev/staging only: credit a user's coin ledger so you can exercise the
// wallet UI. Writes a balanced double-entry pair per bucket and re-checks
// the global sum-zero invariant afterward — nothing here can corrupt the
// ledger.
//
// Usage:
//   DATABASE_URL="file:./prisma/prod.db" npx tsx scripts/seed-wallet-dev.ts <handle> [spendableCoins=50] [promoCoins=20]
//   DATABASE_URL="file:./prisma/prod.db" npx tsx scripts/seed-wallet-dev.ts --all 50 20

const SYSTEM_PROMO_ISSUANCE = "00000000-0000-4000-8000-000000000002";
const COIN_UNIT = 100;

const url = process.env.DATABASE_URL ?? "file:./prisma/prod.db";
const db = new PrismaClient({
  adapter: new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
});

async function ensureAccounts(userId: string): Promise<{ walletId: string; promoId: string }> {
  for (const type of ["user_wallet", "user_promo"] as const) {
    await db.ledgerAccount.upsert({
      where: { type_ownerUserId: { type, ownerUserId: userId } },
      create: { type, ownerUserId: userId },
      update: {},
    });
  }
  const rows = await db.ledgerAccount.findMany({
    where: { ownerUserId: userId, type: { in: ["user_wallet", "user_promo"] } },
    select: { id: true, type: true },
  });
  return {
    walletId: rows.find((r) => r.type === "user_wallet")!.id,
    promoId: rows.find((r) => r.type === "user_promo")!.id,
  };
}

async function post(kind: string, expiresAt: Date | null, postings: { accountId: string; amount: number }[]) {
  await db.$transaction(async (tx) => {
    await tx.ledgerTransaction.create({
      data: {
        kind,
        idempotencyKey: `dev-seed:${kind}:${randomUUID()}`,
        memo: "dev seed",
        expiresAt,
        postings: { create: postings },
      },
    });
    for (const p of postings) {
      await tx.ledgerAccount.update({
        where: { id: p.accountId },
        data: { cachedBalance: { increment: p.amount } },
      });
    }
  });
}

async function fund(userId: string, spendable: number, promo: number) {
  const { walletId, promoId } = await ensureAccounts(userId);
  if (spendable > 0) {
    await post("admin_adjustment", null, [
      { accountId: walletId, amount: spendable * COIN_UNIT },
      { accountId: SYSTEM_PROMO_ISSUANCE, amount: -spendable * COIN_UNIT },
    ]);
  }
  if (promo > 0) {
    await post("promo_grant", new Date(Date.now() + 90 * 864e5), [
      { accountId: SYSTEM_PROMO_ISSUANCE, amount: -promo * COIN_UNIT },
      { accountId: promoId, amount: promo * COIN_UNIT },
    ]);
  }
}

async function main() {
  if (url.startsWith("libsql:") && process.env.CONFIRM_SEED_REMOTE !== url) {
    throw new Error("refusing to seed a remote database (set CONFIRM_SEED_REMOTE to the exact DATABASE_URL to override)");
  }

  const [target, spendableRaw, promoRaw] = process.argv.slice(2);
  if (!target) throw new Error("pass a username handle, or --all");
  const spendable = Number(spendableRaw ?? 50);
  const promo = Number(promoRaw ?? 20);

  const userIds =
    target === "--all"
      ? (await db.user.findMany({ where: { status: "active" }, select: { id: true } })).map((u) => u.id)
      : [(await db.username.findUniqueOrThrow({ where: { handle: target.toLowerCase() }, select: { userId: true } })).userId];

  for (const id of userIds) {
    await fund(id, spendable, promo);
    console.log(`funded ${id}: +${spendable} spendable, +${promo} promo`);
  }

  const globalSum = (await db.ledgerPosting.aggregate({ _sum: { amount: true } }))._sum.amount ?? 0;
  console.log(`global posting sum: ${globalSum} (must be 0)`);
  await db.$disconnect();
  if (globalSum !== 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
