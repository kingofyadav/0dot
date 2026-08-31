import { describe, it, expect } from "vitest";
import { transferCoinsAction, purchaseVipAction } from "@/app/actions/wallet";
import { createUser, createSessionForUser, fundWallet } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { db } from "@/lib/db";
import { getWalletBalance } from "@/lib/wallet/ledger";

async function loginAs(userId: string) {
  const token = await createSessionForUser(userId);
  setSessionCookie(token);
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function mirrorAndTotal(userId: string) {
  return getWalletBalance(userId);
}

describe("transferCoinsAction", () => {
  it("moves spendable coins from sender to recipient and records a CoinTransfer row", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 5, "spendable");
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "3" }));
    expect(result?.success).toBe(true);

    expect((await mirrorAndTotal(sender.id)).spendable).toBe(2);
    expect((await mirrorAndTotal(recipient.id)).spendable).toBe(3);

    const transfer = await db.coinTransfer.findFirstOrThrow({ where: { fromUserId: sender.id } });
    expect(transfer.toUserId).toBe(recipient.id);
    expect(transfer.amount).toBe(3);

    const ledgerTxn = await db.ledgerTransaction.findFirstOrThrow({ where: { kind: "transfer", actorUserId: sender.id } });
    const postings = await db.ledgerPosting.findMany({ where: { transactionId: ledgerTxn.id } });
    expect(postings.reduce((s, p) => s + p.amount, 0)).toBe(0);
  });

  it("is case-insensitive on the recipient handle", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 5, "spendable");
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle.toUpperCase(), coinAmount: "1" }));
    expect(result?.success).toBe(true);
  });

  it("rejects sending to yourself", async () => {
    const user = await createUser();
    await fundWallet(user.id, 5, "spendable");
    await loginAs(user.id);

    const result = await transferCoinsAction(undefined, formData({ handle: user.username!.handle, coinAmount: "1" }));
    expect(result?.error).toMatch(/yourself/i);
    expect((await getWalletBalance(user.id)).spendable).toBe(5);
  });

  it("rejects an unknown handle", async () => {
    const user = await createUser();
    await fundWallet(user.id, 5, "spendable");
    await loginAs(user.id);

    const result = await transferCoinsAction(undefined, formData({ handle: "no-such-user", coinAmount: "1" }));
    expect(result?.error).toMatch(/no user/i);
    expect((await getWalletBalance(user.id)).spendable).toBe(5);
  });

  it("rejects an amount above the per-transfer cap", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 100, "spendable");
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "21" }));
    expect(result?.error).toMatch(/between/i);
    expect((await getWalletBalance(sender.id)).spendable).toBe(100);
  });

  it("rejects insufficient spendable balance without debiting", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 1, "spendable");
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "5" }));
    expect(result?.error).toMatch(/spendable/i);
    expect((await mirrorAndTotal(sender.id)).spendable).toBe(1);
    expect((await mirrorAndTotal(recipient.id)).total).toBe(0);
  });

  // Acceptance: "transfers can't spend the promo bucket."
  it("will not transfer restricted (promo) coins", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 5, "promo");
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "3" }));
    expect(result?.error).toMatch(/no spendable coins|can't be transferred/i);

    const senderBalance = await mirrorAndTotal(sender.id);
    expect(senderBalance.restricted).toBe(5);
    expect(senderBalance.spendable).toBe(0);
    expect((await mirrorAndTotal(recipient.id)).total).toBe(0);
  });

  it("does not overdraft the sender when two transfers race", async () => {
    const sender = await createUser();
    await fundWallet(sender.id, 5, "spendable");
    const recipient = await createUser();
    await loginAs(sender.id);

    const results = await Promise.all([
      transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "4" })),
      transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "4" })),
    ]);

    const succeeded = results.filter((r) => r?.success).length;
    expect(succeeded).toBe(1);
    expect((await mirrorAndTotal(sender.id)).spendable).toBe(1);
    expect((await mirrorAndTotal(recipient.id)).spendable).toBe(4);
  });
});

describe("purchaseVipAction", () => {
  it("rejects and leaves the balance untouched when coins are insufficient", async () => {
    const user = await createUser();
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.error).toMatch(/coin/i);
    expect((await mirrorAndTotal(user.id)).total).toBe(0);

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(await db.platformSubscription.findFirst({ where: { subscriberProfileId: profile.id } })).toBeNull();
  });

  it("spends the real coin price — restricted coins included — and creates a coin-funded active subscription", async () => {
    const user = await createUser();
    // profile_premium is $6/mo → 6 coins; split across both buckets.
    await fundWallet(user.id, 4, "promo");
    await fundWallet(user.id, 3, "spendable");
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.success).toBe(true);
    expect((await mirrorAndTotal(user.id)).total).toBe(1); // 7 − 6

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const subscription = await db.platformSubscription.findFirstOrThrow({ where: { subscriberProfileId: profile.id } });
    expect(subscription.status).toBe("active");
    expect(subscription.plan).toBe("profile_premium");
    expect(subscription.processorSubscriptionId.startsWith("coin:")).toBe(true);

    // One PaymentTransaction (processor "wallet") for the coin spend (§14).
    const pt = await db.paymentTransaction.findFirstOrThrow({ where: { kind: "platform_subscription_charge", payerId: user.id } });
    expect(pt.processor).toBe("wallet");
    const purchase = await db.ledgerTransaction.findFirstOrThrow({ where: { kind: "purchase", actorUserId: user.id } });
    const postings = await db.ledgerPosting.findMany({ where: { transactionId: purchase.id } });
    expect(postings.reduce((s, p) => s + p.amount, 0)).toBe(0);
  });
});
