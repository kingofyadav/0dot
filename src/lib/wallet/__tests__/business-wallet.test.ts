import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  createUser,
  createBusiness,
  createSessionForUser,
  fundWallet,
  fundBusinessWallet,
  addBusinessMember,
} from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { purchaseOffering } from "@/app/actions/offerings";
import { purchaseTicket } from "@/app/actions/events";
import { subscribeBusinessWithCoinsAction } from "@/app/actions/platform-billing";
import { getBusinessWalletBalance, getWalletBalance } from "@/lib/wallet/ledger";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}
function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("business wallet — Store coin sale (Phase 4 acceptance)", () => {
  it("credits the business wallet and keeps the global sum zero", async () => {
    const owner = await createUser();
    const business = await createBusiness({ creatorId: owner.id, status: "active" });
    await addBusinessMember(business.id, owner.id, "owner");
    const buyer = await createUser();
    await fundWallet(buyer.id, 50, "spendable");
    await loginAs(buyer.id);

    const offering = await db.offering.create({
      data: { businessId: business.id, kind: "product", name: "Mug", price: 10, currency: "usd", status: "active" },
    });

    const result = await purchaseOffering(undefined, fd({ offeringId: offering.id, quantity: "2", payWith: "coins" }));
    expect(result?.success).toBe(true);

    // $20 − 10% fee → business nets 18 coins.
    expect((await getBusinessWalletBalance(business.id)).spendableUnits).toBe(1800);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(3000);

    const purchase = await db.offeringPurchase.findFirstOrThrow({ where: { offeringId: offering.id } });
    expect(purchase.quantity).toBe(2);
    const pt = await db.paymentTransaction.findFirstOrThrow({ where: { kind: "business_purchase" } });
    expect(pt.processor).toBe("wallet");
    expect(pt.payeeBusinessId).toBe(business.id);

    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});

describe("business wallet — spend guard", () => {
  it("lets an owner pay the subscription from the wallet but not an editor", async () => {
    const owner = await createUser();
    const editor = await createUser();
    const business = await createBusiness({ creatorId: owner.id, status: "active" });
    await addBusinessMember(business.id, owner.id, "owner");
    await addBusinessMember(business.id, editor.id, "editor");
    await fundBusinessWallet(business.id, 30, "spendable");

    await loginAs(editor.id);
    const denied = await subscribeBusinessWithCoinsAction(undefined, fd({ businessId: business.id, billingInterval: "monthly" }));
    expect(denied?.error).toMatch(/owner or admin/i);
    expect(await db.platformSubscription.findFirst({ where: { subscriberBusinessId: business.id } })).toBeNull();

    await loginAs(owner.id);
    const ok = await subscribeBusinessWithCoinsAction(undefined, fd({ businessId: business.id, billingInterval: "monthly" }));
    expect(ok?.success).toBe(true);
    const sub = await db.platformSubscription.findFirstOrThrow({ where: { subscriberBusinessId: business.id } });
    expect(sub.status).toBe("active");
    expect(sub.processorSubscriptionId.startsWith("coin:")).toBe(true);
    expect((await getBusinessWalletBalance(business.id)).totalUnits).toBe(1000); // 30 − 20/mo business plan
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});

describe("business wallet — business-hosted ticket", () => {
  it("pays the host business in coins through a hold", async () => {
    const owner = await createUser();
    const business = await createBusiness({ creatorId: owner.id, status: "active" });
    await addBusinessMember(business.id, owner.id, "owner");
    const buyer = await createUser();
    await fundWallet(buyer.id, 30, "spendable");
    await loginAs(buyer.id);

    const event = await db.event.create({
      data: {
        slug: `bev-${Date.now().toString(36)}`,
        createdBy: owner.id,
        hostedByBusinessId: business.id,
        title: "Biz Show",
        format: "virtual",
        startsAt: new Date(Date.now() + 86_400_000),
        timezone: "UTC",
        status: "published",
      },
    });
    const tt = await db.ticketType.create({ data: { eventId: event.id, name: "GA", price: 10, currency: "usd" } });

    const result = await purchaseTicket(undefined, fd({ ticketTypeId: tt.id, payWith: "coins" }));
    expect(result).toBeUndefined();

    expect(await db.ticket.findMany({ where: { ticketTypeId: tt.id } })).toHaveLength(1);
    expect((await getBusinessWalletBalance(business.id)).spendableUnits).toBe(900);
    const hold = await db.ledgerHold.findFirstOrThrow({ where: { relatedObjectId: tt.id } });
    expect(hold.state).toBe("captured");
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });
});
