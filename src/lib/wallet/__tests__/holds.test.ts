import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, createSessionForUser, fundWallet } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { purchaseTicket } from "@/app/actions/events";
import { subscribeToTier } from "@/app/actions/memberships";
import { placeHold, releaseHold, runHoldExpirySweepOnce } from "@/lib/wallet/holds";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";
import { SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}
function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("holds primitive", () => {
  it("placeHold escrows the payer's coins (promo first), releaseHold restores the same buckets", async () => {
    const payer = await createUser();
    await fundWallet(payer.id, 3, "promo");
    await fundWallet(payer.id, 5, "spendable");

    const { holdId } = await db.$transaction((tx) =>
      placeHold(tx, {
        payerId: payer.id,
        amountUsd: 5,
        relatedObjectType: "test",
        relatedObjectId: "x",
        expiresAt: new Date(Date.now() + 60_000),
        idempotencyKey: `hold:test:${payer.id}`,
      }),
    );

    let b = await getWalletBalance(payer.id);
    expect(b.restrictedUnits).toBe(0); // 300 promo drawn first
    expect(b.spendableUnits).toBe(300); // then 200 spendable
    const escrow = await db.ledgerAccount.findUniqueOrThrow({ where: { id: SYSTEM_ACCOUNT_IDS.system_escrow } });
    expect(escrow.cachedBalance).toBeGreaterThanOrEqual(500);

    await db.$transaction((tx) => releaseHold(tx, holdId));
    b = await getWalletBalance(payer.id);
    expect(b.restrictedUnits).toBe(300); // promo restored as promo
    expect(b.spendableUnits).toBe(500);
    expect((await db.ledgerHold.findUniqueOrThrow({ where: { id: holdId } })).state).toBe("released");
  });

  it("runHoldExpirySweepOnce releases holds past their expiry", async () => {
    const payer = await createUser();
    await fundWallet(payer.id, 10, "spendable");
    const { holdId } = await db.$transaction((tx) =>
      placeHold(tx, {
        payerId: payer.id,
        amountUsd: 4,
        relatedObjectType: "test",
        relatedObjectId: "y",
        expiresAt: new Date(Date.now() - 1000),
        idempotencyKey: `hold:expired:${payer.id}`,
      }),
    );

    const result = await runHoldExpirySweepOnce();
    expect(result.released).toBeGreaterThanOrEqual(1);
    expect((await db.ledgerHold.findUniqueOrThrow({ where: { id: holdId } })).state).toBe("released");
    expect((await getWalletBalance(payer.id)).spendableUnits).toBe(1000);
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});

describe("event ticket — coin path (placeHold → captureHold)", () => {
  it("issues the ticket, bumps quantitySold, and pays the host in coins", async () => {
    const host = await createUser();
    const buyer = await createUser();
    await fundWallet(buyer.id, 30, "spendable");
    await loginAs(buyer.id);

    const event = await db.event.create({
      data: {
        slug: `ev-${Date.now().toString(36)}`,
        createdBy: host.id,
        hostedByUserId: host.id,
        title: "Show",
        format: "virtual",
        startsAt: new Date(Date.now() + 86_400_000),
        timezone: "UTC",
        status: "published",
      },
    });
    const tt = await db.ticketType.create({
      data: { eventId: event.id, name: "GA", price: 10, currency: "usd", quantityTotal: 5 },
    });

    const result = await purchaseTicket(undefined, fd({ ticketTypeId: tt.id, payWith: "coins" }));
    expect(result).toBeUndefined(); // success path returns undefined

    const tickets = await db.ticket.findMany({ where: { ticketTypeId: tt.id } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].ownerId).toBe(buyer.id);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } })).quantitySold).toBe(1);

    // $10 − 10% fee → host nets 9 coins.
    expect((await getWalletBalance(host.id)).spendableUnits).toBe(900);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(2000);

    const pt = await db.paymentTransaction.findFirstOrThrow({ where: { kind: "ticket_purchase", payerId: buyer.id } });
    expect(pt.processor).toBe("wallet");
    expect(tickets[0].paymentTransactionId).toBe(pt.id);

    const hold = await db.ledgerHold.findFirstOrThrow({ where: { relatedObjectId: tt.id } });
    expect(hold.state).toBe("captured");
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });

  it("rejects a coin ticket the buyer can't afford", async () => {
    const host = await createUser();
    const buyer = await createUser();
    await fundWallet(buyer.id, 2, "spendable");
    await loginAs(buyer.id);
    const event = await db.event.create({
      data: { slug: `ev2-${Date.now().toString(36)}`, createdBy: host.id, hostedByUserId: host.id, title: "T", format: "virtual", startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "published" },
    });
    const tt = await db.ticketType.create({ data: { eventId: event.id, name: "GA", price: 10, currency: "usd" } });

    const result = await purchaseTicket(undefined, fd({ ticketTypeId: tt.id, payWith: "coins" }));
    expect(result?.error).toMatch(/enough coins/i);
    expect(await db.ticket.findMany({ where: { ticketTypeId: tt.id } })).toHaveLength(0);
  });
});

describe("membership — first period in coins", () => {
  it("creates an active coin-funded subscription and pays the creator", async () => {
    const creator = await createUser();
    const fan = await createUser();
    await fundWallet(fan.id, 20, "spendable");
    await loginAs(fan.id);

    const tier = await db.membershipTier.create({
      data: { creatorId: creator.id, name: "Supporter", level: 1, price: 6, currency: "usd", billingInterval: "monthly", status: "active" },
    });

    const result = await subscribeToTier(undefined, fd({ tierId: tier.id, payWith: "coins" }));
    expect(result?.success).toBe(true);

    const sub = await db.membershipSubscription.findFirstOrThrow({ where: { tierId: tier.id, fanId: fan.id } });
    expect(sub.status).toBe("active");
    expect(sub.processorSubscriptionId.startsWith("coin:")).toBe(true);
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

    // $6 − 10% fee → creator nets 5.4 coins.
    expect((await getWalletBalance(creator.id)).spendableUnits).toBe(540);
    expect((await getWalletBalance(fan.id)).spendableUnits).toBe(1400);

    const notif = await db.notification.findFirstOrThrow({ where: { recipientId: creator.id, type: "new_subscriber" } });
    expect(notif.actorId).toBe(fan.id);
  });
});
