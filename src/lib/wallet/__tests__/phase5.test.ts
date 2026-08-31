import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, fundWallet, blockUser } from "@/test/factories";
import { transferCoinsCore } from "@/lib/wallet/transfer";
import { issuePromoGrant, adminAdjust } from "@/lib/wallet/grants";
import { getWalletBalance, listTransactions } from "@/lib/wallet/ledger";
import { runWalletReconciliationOnce, getWalletOverview } from "@/lib/wallet/reconcile";

function key() {
  return `t:${Math.random().toString(36).slice(2)}`;
}

describe("transfer eligibility", () => {
  it("blocks a transfer when either party has blocked the other", async () => {
    const a = await createUser();
    const b = await createUser();
    await fundWallet(a.id, 10, "spendable");
    await blockUser(b.id, a.id); // b blocked a

    const r = await transferCoinsCore({ fromUserId: a.id, toUserId: b.id, coins: 2, idempotencyKey: key() });
    expect("error" in r && r.error).toMatch(/can't send coins/i);
    expect((await getWalletBalance(a.id)).spendableUnits).toBe(1000);
  });

  it("blocks a brand-new account and an unverified account", async () => {
    const fresh = await createUser({ createdAt: new Date() });
    const unverified = await createUser({ emailVerifiedAt: null });
    const recipient = await createUser();
    await fundWallet(fresh.id, 10, "spendable");
    await fundWallet(unverified.id, 10, "spendable");

    const r1 = await transferCoinsCore({ fromUserId: fresh.id, toUserId: recipient.id, coins: 1, idempotencyKey: key() });
    expect("error" in r1 && r1.error).toMatch(/new accounts/i);

    const r2 = await transferCoinsCore({ fromUserId: unverified.id, toUserId: recipient.id, coins: 1, idempotencyKey: key() });
    expect("error" in r2 && r2.error).toMatch(/verify your email/i);
  });
});

describe("transfer velocity", () => {
  it("enforces the per-day coin ceiling", async () => {
    const sender = await createUser();
    const r1 = await createUser();
    const r2 = await createUser();
    await fundWallet(sender.id, 200, "spendable");

    // TRANSFER_MAX_COINS_PER_DAY = 100, per-tx cap = 20 → 5 transfers of 20.
    for (let i = 0; i < 5; i++) {
      const ok = await transferCoinsCore({ fromUserId: sender.id, toUserId: r1.id, coins: 20, idempotencyKey: key() });
      expect(ok).toEqual({ ok: true });
    }
    const over = await transferCoinsCore({ fromUserId: sender.id, toUserId: r2.id, coins: 5, idempotencyKey: key() });
    expect("error" in over && over.error).toMatch(/daily send limit/i);
  });
});

describe("admin grants", () => {
  it("issuePromoGrant credits the restricted bucket and is audited", async () => {
    const admin = await createUser();
    const target = await createUser();

    const r = await issuePromoGrant({ actorAdminId: admin.id, targetUserId: target.id, coins: 25, reason: "beta tester" });
    expect(r).toEqual({ ok: true });

    const bal = await getWalletBalance(target.id);
    expect(bal.restricted).toBe(25);
    expect(bal.spendable).toBe(0);

    const txn = await db.ledgerTransaction.findFirstOrThrow({ where: { kind: "promo_grant", actorUserId: admin.id } });
    expect(txn.memo).toBe("beta tester");

    const notif = await db.notification.findFirst({ where: { recipientId: target.id, type: "coins_received" } });
    expect(notif).not.toBeNull();
  });

  it("adminAdjust credits spendable coins and can correct downward", async () => {
    const admin = await createUser();
    const target = await createUser();

    expect(await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: 30, reason: "goodwill" })).toEqual({ ok: true });
    expect((await getWalletBalance(target.id)).spendable).toBe(30);

    expect(await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: -10, reason: "clawback" })).toEqual({ ok: true });
    expect((await getWalletBalance(target.id)).spendable).toBe(20);

    const overdraw = await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: -999, reason: "too much" });
    expect("error" in overdraw && overdraw.error).toMatch(/overdraw/i);
  });

  it("refuses amounts over the dual-control ceiling and requires a reason", async () => {
    const admin = await createUser();
    const target = await createUser();

    const huge = await issuePromoGrant({ actorAdminId: admin.id, targetUserId: target.id, coins: 5000, reason: "campaign" });
    expect("error" in huge && huge.error).toMatch(/finance sign-off/i);

    const noReason = await issuePromoGrant({ actorAdminId: admin.id, targetUserId: target.id, coins: 10, reason: "" });
    expect("error" in noReason && noReason.error).toMatch(/reason is required/i);
  });

  it("keeps the ledger balanced through grants and adjustments", async () => {
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
    const overview = await getWalletOverview();
    expect(overview.promoLiabilityCoins).toBeGreaterThanOrEqual(0);
  });
});

describe("listTransactions pagination", () => {
  it("pages through a user's ledger with a cursor", async () => {
    const admin = await createUser();
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      const r = await adminAdjust({ actorAdminId: admin.id, targetUserId: user.id, coins: 1, reason: `adj ${i}` });
      expect(r, JSON.stringify(r)).toEqual({ ok: true });
    }
    expect((await getWalletBalance(user.id)).spendable).toBe(5);
    const page1 = await listTransactions(user.id, { limit: 3 });
    expect(page1.entries.length).toBe(3);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await listTransactions(user.id, { limit: 3, cursor: page1.nextCursor });
    expect(page2.entries.length).toBeGreaterThanOrEqual(2);
  });
});
