import { describe, it, expect } from "vitest";
import { activateTip } from "@/app/actions/tips";
import { createUser } from "@/test/factories";
import { db } from "@/lib/db";

// Regression coverage for the payment-webhook idempotency fix: Stripe
// redelivers webhooks at-least-once, and PaymentTransaction previously had
// no unique constraint backstopping the app-level "already processed"
// check — two near-simultaneous deliveries for the same event could both
// pass the check and double-credit. Now backed by
// @@unique([processorReference, kind]) plus a P2002 catch in activateTip
// (and every sibling activateXxx).
describe("activateTip", () => {
  it("records exactly one PaymentTransaction/Tip when the same webhook event is delivered twice concurrently", async () => {
    const payer = await createUser();
    const payee = await createUser();
    const processorReference = `cs_test_${Math.random().toString(36).slice(2)}`;
    const metadata = {
      payerId: payer.id,
      payeeId: payee.id,
      amount: "5",
      currency: "usd",
      message: "",
    };

    await Promise.all([activateTip(metadata, processorReference), activateTip(metadata, processorReference)]);

    const transactions = await db.paymentTransaction.findMany({ where: { processorReference, kind: "tip" } });
    expect(transactions).toHaveLength(1);

    const tips = await db.tip.findMany({ where: { toCreatorId: payee.id } });
    expect(tips).toHaveLength(1);
  });

  it("is a no-op on a later redelivery of an already-processed event", async () => {
    const payer = await createUser();
    const payee = await createUser();
    const processorReference = `cs_test_${Math.random().toString(36).slice(2)}`;
    const metadata = {
      payerId: payer.id,
      payeeId: payee.id,
      amount: "5",
      currency: "usd",
      message: "",
    };

    await activateTip(metadata, processorReference);
    await activateTip(metadata, processorReference); // simulated redelivery, sequential this time

    const transactions = await db.paymentTransaction.findMany({ where: { processorReference, kind: "tip" } });
    expect(transactions).toHaveLength(1);
  });
});
