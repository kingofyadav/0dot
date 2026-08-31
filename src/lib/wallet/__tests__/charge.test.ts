import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, createSessionForUser, fundWallet } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { sendTip } from "@/app/actions/tips";
import { purchaseProduct } from "@/app/actions/digital-products";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { refundToWallet } from "@/lib/wallet/charge";
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

describe("coin tip (Phase 2 acceptance)", () => {
  it("produces one PaymentTransaction (processor wallet), one balanced LedgerTransaction, one Tip, one notification", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 10, "spendable");
    await loginAs(tipper.id);

    const result = await sendTip(undefined, fd({ creatorHandle: creator.username!.handle, amount: "5", message: "nice work", payWith: "coins" }));
    expect(result?.success).toBe(true);

    const pts = await db.paymentTransaction.findMany({ where: { kind: "tip", payeeId: creator.id } });
    expect(pts).toHaveLength(1);
    expect(pts[0].processor).toBe("wallet");
    expect(pts[0].status).toBe("succeeded");

    const tips = await db.tip.findMany({ where: { toCreatorId: creator.id } });
    expect(tips).toHaveLength(1);
    expect(tips[0].amount).toBe(5);
    expect(tips[0].paymentTransactionId).toBe(pts[0].id);

    const ledgerTxn = await db.ledgerTransaction.findFirstOrThrow({ where: { id: pts[0].processorReference } });
    const postings = await db.ledgerPosting.findMany({ where: { transactionId: ledgerTxn.id } });
    expect(postings.reduce((s, p) => s + p.amount, 0)).toBe(0);

    // 10% platform fee on $5: payer −500, creator +450, platform revenue +50.
    const feePosting = postings.find((p) => p.accountId === SYSTEM_ACCOUNT_IDS.system_platform_revenue);
    expect(feePosting?.amount).toBe(50);
    expect((await getWalletBalance(creator.id)).spendableUnits).toBe(450);
    expect((await getWalletBalance(tipper.id)).spendableUnits).toBe(500);

    const notifs = await db.notification.findMany({ where: { recipientId: creator.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("tip_received");

    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });

  it("rejects a coin tip the payer can't afford, creating nothing", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 2, "spendable");
    await loginAs(tipper.id);

    const result = await sendTip(undefined, fd({ creatorHandle: creator.username!.handle, amount: "5", message: "", payWith: "coins" }));
    expect(result?.error).toMatch(/enough coins/i);
    expect(await db.tip.findMany({ where: { toCreatorId: creator.id } })).toHaveLength(0);
    expect(await db.paymentTransaction.findMany({ where: { payeeId: creator.id } })).toHaveLength(0);
    expect((await getWalletBalance(tipper.id)).spendableUnits).toBe(200);
  });

  it("lets a creator receive a coin tip with no payout account (restricted coins spend too)", async () => {
    const tipper = await createUser();
    const creator = await createUser();
    await fundWallet(tipper.id, 3, "promo");
    await fundWallet(tipper.id, 3, "spendable");
    await loginAs(tipper.id);

    const result = await sendTip(undefined, fd({ creatorHandle: creator.username!.handle, amount: "4", message: "", payWith: "coins" }));
    expect(result?.success).toBe(true);
    // promo drawn first: 300 units promo + 100 units wallet spent.
    const b = await getWalletBalance(tipper.id);
    expect(b.restrictedUnits).toBe(0);
    expect(b.spendableUnits).toBe(200);
  });
});

describe("coin digital-product purchase", () => {
  it("grants the product, credits the creator's wallet, and blocks a second purchase", async () => {
    const buyer = await createUser();
    const creator = await createUser();
    await fundWallet(buyer.id, 50, "spendable");
    await loginAs(buyer.id);

    const product = await db.digitalProduct.create({
      data: { creatorId: creator.id, title: "Preset Pack", description: "", price: 10, currency: "usd", status: "active", fileKey: "k", fileMimeType: "application/zip", fileSizeBytes: 10 },
    });

    const first = await purchaseProduct(undefined, fd({ productId: product.id, payWith: "coins" }));
    expect(first?.success).toBe(true);
    expect(await db.digitalProductPurchase.findMany({ where: { productId: product.id } })).toHaveLength(1);
    expect((await getWalletBalance(creator.id)).spendableUnits).toBe(900); // $10 − 10% fee

    const second = await purchaseProduct(undefined, fd({ productId: product.id, payWith: "coins" }));
    expect(second?.error).toMatch(/already own/i);
  });
});

describe("refundToWallet", () => {
  it("credits the payer's spendable wallet, marks the original refunded, and is idempotent", async () => {
    const buyer = await createUser();
    const creator = await createUser();
    await fundWallet(buyer.id, 20, "spendable");
    await loginAs(buyer.id);

    const product = await db.digitalProduct.create({
      data: { creatorId: creator.id, title: "X", description: "", price: 10, currency: "usd", status: "active", fileKey: "k2", fileMimeType: "application/zip", fileSizeBytes: 1 },
    });
    await purchaseProduct(undefined, fd({ productId: product.id, payWith: "coins" }));
    const pt = await db.paymentTransaction.findFirstOrThrow({ where: { kind: "digital_purchase", payerId: buyer.id } });

    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(1000); // 20 coins − 10 spent

    const r1 = await refundToWallet({ paymentTransactionId: pt.id, amountUsd: 10, reason: "goodwill" });
    expect(r1).toEqual({ ok: true, alreadyRefunded: false });
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(2000); // + 10 refunded
    expect((await db.paymentTransaction.findUniqueOrThrow({ where: { id: pt.id } })).status).toBe("refunded");

    // Replay is an idempotent no-op success, not an error.
    const r2 = await refundToWallet({ paymentTransactionId: pt.id, amountUsd: 10, reason: "again" });
    expect(r2).toEqual({ ok: true, alreadyRefunded: true });
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(2000);
  });
});
