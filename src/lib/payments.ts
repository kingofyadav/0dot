import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

// phase-5 build plan §0 / spec §3.2: no finance decision on fee rates
// exists yet, so this is a single flat placeholder applied to every
// PaymentTransaction kind rather than per-kind rates (spec §14 flags rates
// could differ by feature — deferred until finance actually decides).
// Captured per-row at transaction time (recordPaymentTransaction below), so
// changing this constant later never rewrites the story of a past
// transaction.
export const PLATFORM_FEE_PERCENT = 0.1;

export type PayoutAccountStatus = "onboarding" | "active" | "restricted";

// spec §3: every feature that moves money (tips now; memberships/digital
// downloads/courses/affiliate commissions later) goes through this
// interface, never talks to a processor SDK directly. Swapping in real
// Stripe Connect later means writing a second class implementing this same
// shape and changing getPaymentProcessor() below — nothing above this file
// needs to change shape when that happens.
export interface PaymentProcessor {
  readonly name: string;
  createPayoutAccount(user: { id: string; email: string }): Promise<{
    processorAccountId: string;
    status: PayoutAccountStatus;
  }>;
  charge(params: {
    amount: number;
    currency: string;
    payerId: string;
    payeeId: string;
  }): Promise<{ processorReference: string; status: "succeeded" | "failed" }>;
}

// Stub only — no real hosted onboarding or card network exists to wait on,
// so this short-circuits straight to `active`/`succeeded`. Real Stripe
// Connect's account status genuinely starts `onboarding` until a webhook
// confirms it (spec §3.1/§4.3) and a real charge can fail (declined card,
// etc.) — this stub is a local-testing shortcut, not a model for how the
// real integration should behave.
class StubPaymentProcessor implements PaymentProcessor {
  readonly name = "stub";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is the PaymentProcessor interface contract; the stub doesn't need the argument.
  async createPayoutAccount(user: { id: string; email: string }) {
    return {
      processorAccountId: `stub_acct_${randomBytes(8).toString("hex")}`,
      status: "active" as const,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is the PaymentProcessor interface contract; the stub doesn't need the argument.
  async charge(params: { amount: number; currency: string; payerId: string; payeeId: string }) {
    return {
      processorReference: `stub_ch_${randomBytes(12).toString("hex")}`,
      status: "succeeded" as const,
    };
  }
}

const processor: PaymentProcessor = new StubPaymentProcessor();

export function getPaymentProcessor(): PaymentProcessor {
  return processor;
}

export function getMyPayoutAccount(userId: string) {
  return db.creatorPayoutAccount.findUnique({ where: { userId } });
}

// phase-8 spec §5.2: business-hosted paid events need a payout account too
// — same shape as getMyPayoutAccount, keyed on businessId instead of userId.
export function getBusinessPayoutAccount(businessId: string) {
  return db.creatorPayoutAccount.findUnique({ where: { businessId } });
}

// spec §3.5's "every kind produces exactly one PaymentTransaction row with
// a non-null platform_fee and processor_reference" criterion is enforced by
// funneling every money-moving feature through this one function, not by
// convention. Runs inside the caller's transaction so the ledger write and
// the feature's own row (Tip, later MembershipSubscription, etc.) can never
// drift apart.
// phase-8 build plan §5: payeeId/payeeBusinessId — exactly one set, mutual
// exclusivity enforced by the caller (purchaseTicket, events.ts), not here.
// Every pre-phase-8 caller (tip/digital/course/affiliate) keeps passing
// payeeId only, unaffected.
export async function recordPaymentTransaction(
  tx: Prisma.TransactionClient,
  params: {
    kind: string;
    payerId: string | null;
    payeeId?: string | null;
    payeeBusinessId?: string | null;
    amount: number;
    currency: string;
    processorReference: string;
    status: "pending" | "succeeded" | "failed" | "refunded";
    relatedObjectType?: string;
    relatedObjectId?: string;
  }
) {
  const platformFee = Math.round(params.amount * PLATFORM_FEE_PERCENT * 100) / 100;
  return tx.paymentTransaction.create({
    data: {
      kind: params.kind,
      payerId: params.payerId,
      payeeId: params.payeeId ?? null,
      payeeBusinessId: params.payeeBusinessId ?? null,
      amount: params.amount,
      currency: params.currency,
      platformFee,
      processorReference: params.processorReference,
      status: params.status,
      relatedObjectType: params.relatedObjectType,
      relatedObjectId: params.relatedObjectId,
    },
  });
}
