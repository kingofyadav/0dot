import { describe, it, expect } from "vitest";
import { transferCoinsAction, purchaseVipAction } from "@/app/actions/wallet";
import { createUser, createSessionForUser } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { db } from "@/lib/db";

async function loginAs(userId: string) {
  const token = await createSessionForUser(userId);
  setSessionCookie(token);
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function coinBalanceOf(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return user.coinBalance;
}

describe("transferCoinsAction", () => {
  it("moves coins from sender to recipient and records a CoinTransfer row", async () => {
    const sender = await createUser();
    await db.user.update({ where: { id: sender.id }, data: { coinBalance: 5 } });
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "3" }));
    expect(result?.success).toBe(true);
    expect(await coinBalanceOf(sender.id)).toBe(2);
    expect(await coinBalanceOf(recipient.id)).toBe(3);

    const transfer = await db.coinTransfer.findFirstOrThrow({ where: { fromUserId: sender.id } });
    expect(transfer.toUserId).toBe(recipient.id);
    expect(transfer.amount).toBe(3);
  });

  it("is case-insensitive on the recipient handle", async () => {
    const sender = await createUser();
    await db.user.update({ where: { id: sender.id }, data: { coinBalance: 5 } });
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle.toUpperCase(), coinAmount: "1" }));
    expect(result?.success).toBe(true);
  });

  it("rejects sending to yourself", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 5 } });
    await loginAs(user.id);

    const result = await transferCoinsAction(undefined, formData({ handle: user.username!.handle, coinAmount: "1" }));
    expect(result?.error).toMatch(/yourself/i);
    expect(await coinBalanceOf(user.id)).toBe(5);
  });

  it("rejects an unknown handle", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 5 } });
    await loginAs(user.id);

    const result = await transferCoinsAction(undefined, formData({ handle: "no-such-user", coinAmount: "1" }));
    expect(result?.error).toMatch(/no user/i);
    expect(await coinBalanceOf(user.id)).toBe(5);
  });

  it("rejects an amount above the per-transfer cap", async () => {
    const sender = await createUser();
    await db.user.update({ where: { id: sender.id }, data: { coinBalance: 100 } });
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "21" }));
    expect(result?.error).toMatch(/between/i);
    expect(await coinBalanceOf(sender.id)).toBe(100);
  });

  it("rejects insufficient balance without debiting", async () => {
    const sender = await createUser();
    await db.user.update({ where: { id: sender.id }, data: { coinBalance: 1 } });
    const recipient = await createUser();
    await loginAs(sender.id);

    const result = await transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "5" }));
    expect(result?.error).toMatch(/only have/i);
    expect(await coinBalanceOf(sender.id)).toBe(1);
    expect(await coinBalanceOf(recipient.id)).toBe(0);
  });

  // Regression coverage matching this file's existing TOCTOU-test style
  // (see purchaseVipAction below): two concurrent transfers of the same
  // near-exhausted balance must never overdraft it.
  it("does not overdraft the sender when two transfers race", async () => {
    const sender = await createUser();
    await db.user.update({ where: { id: sender.id }, data: { coinBalance: 5 } });
    const recipient = await createUser();
    await loginAs(sender.id);

    const results = await Promise.all([
      transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "4" })),
      transferCoinsAction(undefined, formData({ handle: recipient.username!.handle, coinAmount: "4" })),
    ]);

    const succeeded = results.filter((r) => r?.success).length;
    expect(succeeded).toBe(1);
    expect(await coinBalanceOf(sender.id)).toBe(1);
    expect(await coinBalanceOf(recipient.id)).toBe(4);
  });
});

// Regression coverage for the missing-transaction bug fixed alongside this
// feature: a successful purchase must land the coin debit and the
// PlatformSubscription create together, and a failed (insufficient-balance)
// purchase must leave both completely untouched.
describe("purchaseVipAction", () => {
  it("rejects and leaves the balance untouched when coins are insufficient", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 0 } });
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.error).toMatch(/coin/i);
    expect(await coinBalanceOf(user.id)).toBe(0);

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(await db.platformSubscription.findFirst({ where: { subscriberProfileId: profile.id } })).toBeNull();
  });

  it("debits the flat test-mode coin cost and creates a coin-funded active subscription together", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 1 } });
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.success).toBe(true);
    expect(await coinBalanceOf(user.id)).toBe(0); // test-mode VIP costs 1 coin flat

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const subscription = await db.platformSubscription.findFirstOrThrow({ where: { subscriberProfileId: profile.id } });
    expect(subscription.status).toBe("active");
    expect(subscription.plan).toBe("profile_premium");
    expect(subscription.processorSubscriptionId.startsWith("coin:")).toBe(true);
  });
});
