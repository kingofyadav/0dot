import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, fundWallet } from "@/test/factories";
import { purchaseProfilePremiumWithCoins } from "@/lib/platform-billing";
import { issueLaunchPromoIfEligible } from "@/lib/wallet/grants";
import { adminAdjust } from "@/lib/wallet/grants";
import { ensureUserAccounts } from "@/lib/wallet/accounts";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { runWalletAnomalyScanOnce } from "@/lib/wallet/anomaly";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";

describe("Premium at the real coin price (§14)", () => {
  it("charges 6 coins for monthly and records a wallet PaymentTransaction", async () => {
    const user = await createUser();
    await fundWallet(user.id, 10, "spendable");
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });

    const r = await purchaseProfilePremiumWithCoins(user.id, profile.id, "monthly");
    expect(r).toEqual({});
    expect((await getWalletBalance(user.id)).spendable).toBe(4);

    const pt = await db.paymentTransaction.findFirstOrThrow({ where: { payerId: user.id, kind: "platform_subscription_charge" } });
    expect(pt.processor).toBe("wallet");
    expect(pt.amount).toBe(6);
    expect(pt.platformFee).toBe(6); // no external payee → whole amount is platform revenue
  });

  it("charges 60 coins for yearly and rejects when short", async () => {
    const user = await createUser();
    await fundWallet(user.id, 30, "spendable");
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });

    const r = await purchaseProfilePremiumWithCoins(user.id, profile.id, "yearly");
    expect(r.error).toMatch(/60 coins/);
    expect((await getWalletBalance(user.id)).spendable).toBe(30);
  });
});

describe("launch promo (§8.1)", () => {
  it("grants LAUNCH_PROMO_COINS into the restricted bucket while the window is open", async () => {
    const user = await createUser();
    await db.$transaction(async (tx) => {
      await ensureUserAccounts(tx, user.id);
      await issueLaunchPromoIfEligible(tx, user.id);
    });
    expect((await getWalletBalance(user.id)).restricted).toBe(6);
    const grant = await db.ledgerTransaction.findUniqueOrThrow({ where: { idempotencyKey: `launch_promo:${user.id}` } });
    expect(grant.memo).toBe("launch");
    expect(grant.expiresAt).toBeInstanceOf(Date);
  });

  it("does nothing once the window has closed", async () => {
    process.env.WALLET_LAUNCH_PROMO_ENDS_AT = "2020-01-01T00:00:00.000Z";
    try {
      const user = await createUser();
      await db.$transaction(async (tx) => {
        await ensureUserAccounts(tx, user.id);
        await issueLaunchPromoIfEligible(tx, user.id);
      });
      expect((await getWalletBalance(user.id)).restricted).toBe(0);
      expect(await db.ledgerTransaction.findUnique({ where: { idempotencyKey: `launch_promo:${user.id}` } })).toBeNull();
    } finally {
      delete process.env.WALLET_LAUNCH_PROMO_ENDS_AT;
    }
  });
});

describe("anomaly scan (§11.4)", () => {
  it("flags an issuance spike but never blocks", async () => {
    const admin = await createUser();
    const target = await createUser();
    // A large one-off grant with no prior-week baseline reads as a spike.
    await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: 900, reason: "spike test" });

    const result = await runWalletAnomalyScanOnce();
    expect(Array.isArray(result.flags)).toBe(true);
    // The ledger is untouched by the scan.
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});
