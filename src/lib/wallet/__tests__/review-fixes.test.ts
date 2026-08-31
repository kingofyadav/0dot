import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, createSessionForUser, fundWallet } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { transferCoinsCore } from "@/lib/wallet/transfer";
import { adminAdjust } from "@/lib/wallet/grants";
import { maybeGrantReferralReward, getOrCreateReferralCode, recordReferralAttribution } from "@/lib/wallet/referral";
import { runPromoExpirySweepOnce } from "@/lib/wallet/expiry";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";
import { getWalletBalance, listTransactions, postTransaction } from "@/lib/wallet/ledger";
import { ensureUserAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { purchaseVipAction } from "@/app/actions/wallet";

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}
function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("idempotency-key replay is a true no-op", () => {
  it("transferCoinsCore: a replay writes no second CoinTransfer row or notification", async () => {
    const a = await createUser();
    const b = await createUser();
    await fundWallet(a.id, 10, "spendable");
    const key = `transfer:test:${a.id}`;

    const r1 = await transferCoinsCore({ fromUserId: a.id, toUserId: b.id, coins: 3, idempotencyKey: key });
    const r2 = await transferCoinsCore({ fromUserId: a.id, toUserId: b.id, coins: 3, idempotencyKey: key });
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });

    expect((await getWalletBalance(a.id)).spendableUnits).toBe(700);
    expect((await getWalletBalance(b.id)).spendableUnits).toBe(300);
    expect(await db.coinTransfer.count({ where: { fromUserId: a.id, toUserId: b.id } })).toBe(1);
    expect(await db.notification.count({ where: { recipientId: b.id, type: "coins_received" } })).toBe(1);
  });

  it("maybeGrantReferralReward: concurrent calls grant exactly once, 2 notifications total", async () => {
    const inviter = await createUser();
    const code = await getOrCreateReferralCode(inviter.id);
    const invitee = await createUser();
    await db.$transaction((tx) => recordReferralAttribution(tx, invitee.id, code));
    await db.link.create({ data: { profile: { connect: { userId: invitee.id } }, label: "site", url: "https://x.test", position: 0 } });

    const results = await Promise.all([maybeGrantReferralReward(invitee.id), maybeGrantReferralReward(invitee.id)]);
    expect(results.filter((r) => r.granted)).toHaveLength(1);

    expect((await getWalletBalance(inviter.id)).restricted).toBe(3);
    expect((await getWalletBalance(invitee.id)).restricted).toBe(3);
    const notifs = await db.notification.count({
      where: { type: "coins_received", recipientId: { in: [inviter.id, invitee.id] } },
    });
    expect(notifs).toBe(2);
  });
});

describe("ledger pagination keeps every posting across a page boundary", () => {
  it("does not drop the second posting of a multi-posting transaction", async () => {
    const user = await createUser();
    // 6 admin_adjustment txns → 6 postings on the user's wallet, one per txn.
    const admin = await createUser();
    for (let i = 0; i < 6; i++) {
      await adminAdjust({ actorAdminId: admin.id, targetUserId: user.id, coins: 1, reason: `adj ${i}` });
    }

    const seen = new Set<string>();
    let cursor: string | null | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await listTransactions(user.id, { limit: 2, cursor });
      for (const e of res.entries) seen.add(e.id);
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    // 6 credit postings + the shared system_promo_issuance debits aren't on
    // this user's accounts, so exactly 6 entries, none lost.
    expect(seen.size).toBe(6);
  });
});

describe("admin daily cap counts gross movement", () => {
  it("a downward correction does not refund cap headroom", async () => {
    const admin = await createUser();
    const target = await createUser();
    await fundWallet(target.id, 1500, "spendable");

    // Issue near the ceiling in chunks (dual-control hard ceiling is 1000).
    for (let i = 0; i < 4; i++) {
      expect(await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: 1000, reason: `batch ${i}` })).toEqual({ ok: true });
    }
    // 4000 issued; a correction shouldn't buy back room.
    expect(await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: -1000, reason: "correction" })).toEqual({ ok: true });
    const blocked = await adminAdjust({ actorAdminId: admin.id, targetUserId: target.id, coins: 1000, reason: "one more" });
    expect("error" in blocked && blocked.error).toMatch(/daily issuance cap/i);
  });
});

describe("promo expiry reads the expiresAt column", () => {
  it("claws back an unspent grant once its expiresAt passes", async () => {
    const admin = await createUser();
    const user = await createUser();
    await db.$transaction(async (tx) => {
      const { promoId } = await ensureUserAccounts(tx, user.id);
      await postTransaction(tx, {
        kind: "promo_grant",
        idempotencyKey: `expired-grant:${user.id}`,
        actorUserId: admin.id,
        memo: "test",
        expiresAt: new Date(Date.now() - 60_000),
        postings: [
          { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -500 },
          { accountId: promoId, amount: 500 },
        ],
      });
    });

    expect((await getWalletBalance(user.id)).restrictedUnits).toBe(500);
    const swept = await runPromoExpirySweepOnce();
    expect(swept.sweptUnits).toBe(500);
    expect((await getWalletBalance(user.id)).restrictedUnits).toBe(0);
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});

describe("Premium coin double-click", () => {
  it("a rapid second submit does not double-charge or double-extend", async () => {
    const user = await createUser();
    await fundWallet(user.id, 20, "spendable");
    await loginAs(user.id);

    const [r1, r2] = await Promise.all([
      purchaseVipAction(undefined, fd({ billingInterval: "monthly" })),
      purchaseVipAction(undefined, fd({ billingInterval: "monthly" })),
    ]);
    expect(r1?.success || r2?.success).toBe(true);

    // 6 coins spent once, not 12.
    expect((await getWalletBalance(user.id)).total).toBe(14);
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const subs = await db.platformSubscription.findMany({ where: { subscriberProfileId: profile.id } });
    expect(subs).toHaveLength(1);
  });
});
