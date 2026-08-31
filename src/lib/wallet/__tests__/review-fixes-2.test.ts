import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  createUser,
  createSessionForUser,
  createBusiness,
  fundWallet,
} from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { sendTip } from "@/app/actions/tips";
import { purchaseTicket } from "@/app/actions/events";
import { transferCoinsCore } from "@/lib/wallet/transfer";
import { adminAdjust } from "@/lib/wallet/grants";
import { runPromoExpirySweepOnce } from "@/lib/wallet/expiry";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";
import {
  getWalletBalance,
  getBusinessWalletBalance,
  listTransactions,
  postTransaction,
} from "@/lib/wallet/ledger";
import { ensureBusinessAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { walletActivityLabel } from "@/lib/wallet/activity-labels";
import { GET as statementGET } from "@/app/wallet/statement/route";

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}
function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("finding #1 — client idempotency token, not a 30s bucket", () => {
  it("a genuine repeat coin tip with a fresh token is NOT collapsed onto the first", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 20, "spendable");
    await loginAs(tipper.id);

    const base = { creatorHandle: creator.username!.handle, amount: "5", message: "", payWith: "coins" };
    const a = await sendTip(undefined, fd({ ...base, idempotencyKey: "replaytokenone" }));
    const b = await sendTip(undefined, fd({ ...base, idempotencyKey: "replaytokentwo" }));

    expect(a?.success).toBe(true);
    expect(b?.success).toBe(true);
    expect(await db.tip.count({ where: { toCreatorId: creator.id } })).toBe(2);
    expect((await getWalletBalance(tipper.id)).spendableUnits).toBe(1000); // 20 − 5 − 5
  });

  it("a double-submit sharing one token charges exactly once", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 20, "spendable");
    await loginAs(tipper.id);

    const form = { creatorHandle: creator.username!.handle, amount: "5", message: "", payWith: "coins", idempotencyKey: "sharedtoken01" };
    const a = await sendTip(undefined, fd(form));
    const b = await sendTip(undefined, fd(form));

    expect(a?.success).toBe(true);
    expect(b?.success).toBe(true);
    expect(await db.tip.count({ where: { toCreatorId: creator.id } })).toBe(1);
    expect((await getWalletBalance(tipper.id)).spendableUnits).toBe(1500);
    expect(await db.notification.count({ where: { recipientId: creator.id, type: "tip_received" } })).toBe(1);
  });
});

describe("finding #2 — wallet activity labels off the PaymentTransaction kind", () => {
  it("labels a coin tip 'Tip sent' for the payer and 'Tip received' for the payee", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 20, "spendable");
    await loginAs(tipper.id);

    await sendTip(undefined, fd({ creatorHandle: creator.username!.handle, amount: "5", message: "", payWith: "coins", idempotencyKey: "labeltokenaa" }));

    const payerEntry = (await listTransactions(tipper.id)).entries[0];
    expect(payerEntry.feature).toBe("tip");
    expect(walletActivityLabel(payerEntry)).toBe("Tip sent");

    const payeeEntry = (await listTransactions(creator.id)).entries[0];
    expect(walletActivityLabel(payeeEntry)).toBe("Tip received");
  });
});

describe("finding #3 — deduped coin-ticket resubmit fires no second notification", () => {
  it("reissues no ticket, bumps no sold count, sends no second 'ticket purchased'", async () => {
    const host = await createUser();
    const buyer = await createUser();
    await fundWallet(buyer.id, 30, "spendable");
    await loginAs(buyer.id);

    const event = await db.event.create({
      data: { slug: `rf2-${Date.now().toString(36)}`, createdBy: host.id, hostedByUserId: host.id, title: "T", format: "virtual", startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "published" },
    });
    const tt = await db.ticketType.create({ data: { eventId: event.id, name: "GA", price: 10, currency: "usd" } });

    const form = { ticketTypeId: tt.id, payWith: "coins", idempotencyKey: "tickettoken01" };
    expect(await purchaseTicket(undefined, fd(form))).toBeUndefined();
    expect(await purchaseTicket(undefined, fd(form))).toBeUndefined();

    expect(await db.ticket.count({ where: { ticketTypeId: tt.id } })).toBe(1);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } })).quantitySold).toBe(1);
    expect(await db.notification.count({ where: { recipientId: buyer.id, type: "ticket_purchased" } })).toBe(1);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(2000); // charged once
  });
});

describe("finding #5 — business promo grants expire too", () => {
  it("the sweep claws back an expired business_promo grant", async () => {
    const owner = await createUser();
    const business = await createBusiness({ creatorId: owner.id, status: "active" });

    await db.$transaction(async (tx) => {
      const { promoId } = await ensureBusinessAccounts(tx, business.id);
      await postTransaction(tx, {
        kind: "promo_grant",
        idempotencyKey: `biz-expired:${business.id}`,
        actorUserId: owner.id,
        memo: "biz promo",
        expiresAt: new Date(Date.now() - 60_000),
        postings: [
          { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -400 },
          { accountId: promoId, amount: 400 },
        ],
      });
    });

    expect((await getBusinessWalletBalance(business.id)).restrictedUnits).toBe(400);
    const swept = await runPromoExpirySweepOnce();
    expect(swept.sweptUnits).toBeGreaterThanOrEqual(400);
    expect((await getBusinessWalletBalance(business.id)).restrictedUnits).toBe(0);
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});

describe("finding #6 — transfer velocity holds under concurrency", () => {
  it("concurrent transfers can't jointly exceed the daily coin ceiling", async () => {
    const sender = await createUser();
    const recipient = await createUser();
    await fundWallet(sender.id, 300, "spendable");

    // TRANSFER_MAX_COINS_PER_DAY = 100, per-tx cap = 20 → at most 5 succeed.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        transferCoinsCore({ fromUserId: sender.id, toUserId: recipient.id, coins: 20, idempotencyKey: `vel:${sender.id}:${i}` }),
      ),
    );

    const ok = results.filter((r) => "ok" in r).length;
    expect(ok).toBe(5);
    expect((await getWalletBalance(recipient.id)).spendableUnits).toBe(10_000); // 100 coins
    expect(await db.coinTransfer.count({ where: { fromUserId: sender.id } })).toBe(5);
  });
});

describe("finding #7 — CSV statement neutralizes formula-leading memos", () => {
  it("prefixes a memo starting with '=' so it can't execute in a spreadsheet", async () => {
    const user = await createUser();
    const admin = await createUser();
    await loginAs(user.id);

    await adminAdjust({ actorAdminId: admin.id, targetUserId: user.id, coins: 5, reason: "=HYPERLINK(\"http://evil\")" });

    const res = await statementGET(new Request("http://localhost/wallet/statement"));
    const body = await res.text();
    expect(body).toContain("\"'=HYPERLINK");
    expect(body).not.toContain(",=HYPERLINK");
  });
});
