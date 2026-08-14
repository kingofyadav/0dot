import { describe, it, expect } from "vitest";
import {
  createTopUpRequest,
  submitTopUpUtr,
  approveTopUpRequest,
  rejectTopUpRequest,
  savePayoutVpa,
  requestCoinPayout,
  markPayoutPaid,
  rejectPayoutRequest,
  purchaseVipAction,
} from "@/app/actions/wallet";
import { createUser, createSessionForUser } from "@/test/factories";
import { setSessionCookie, redirectState, NextRedirectSignal } from "@/test/next-test-state";
import { db } from "@/lib/db";

async function loginAs(userId: string) {
  const token = await createSessionForUser(userId);
  setSessionCookie(token);
}

async function makeAdmin(userId: string) {
  await db.user.update({ where: { id: userId }, data: { isPlatformAdmin: true } });
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

// createTopUpRequest redirects on success, so callers that want the created
// row need to catch NextRedirectSignal and read the id back out of
// redirectState.url ("/wallet/topup/<id>"), same pattern the "must redirect"
// half of these tests uses throughout.
async function createTopUp(coinAmount: number) {
  try {
    await createTopUpRequest(undefined, formData({ coinAmount: String(coinAmount) }));
  } catch (err) {
    if (!(err instanceof NextRedirectSignal)) throw err;
  }
  const id = redirectState.url?.split("/wallet/topup/")[1];
  if (!id) throw new Error("createTopUpRequest did not redirect to a topup id");
  return db.coinTopUpRequest.findUniqueOrThrow({ where: { id } });
}

describe("createTopUpRequest", () => {
  it("rejects an amount below the minimum", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const result = await createTopUpRequest(undefined, formData({ coinAmount: "1" }));
    expect(result?.error).toMatch(/between/i);
  });

  it("rejects an amount above the maximum", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const result = await createTopUpRequest(undefined, formData({ coinAmount: "5000" }));
    expect(result?.error).toMatch(/between/i);
  });

  it("creates a pending_payment request with a matching amountInr and redirects to it", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);

    expect(request.userId).toBe(user.id);
    expect(request.status).toBe("pending_payment");
    expect(request.amountInr).toBe(50 * 90);
    expect(request.referenceCode).toMatch(/^0DOT-/);
  });
});

describe("submitTopUpUtr", () => {
  it("rejects a malformed UTR", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);

    const result = await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "!!!" }));
    expect(result?.error).toBeDefined();
    expect((await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("pending_payment");
  });

  it("rejects submitting someone else's request", async () => {
    const owner = await createUser();
    await loginAs(owner.id);
    const request = await createTopUp(50);

    const intruder = await createUser();
    await loginAs(intruder.id);
    const result = await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345" }));

    expect(result?.error).toBe("Top-up request not found.");
    expect((await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("pending_payment");
  });

  it("marks a valid submission as submitted", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);

    const result = await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    expect(result?.success).toBe(true);
    const updated = await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("submitted");
    expect(updated.utr).toBe("ABC12345XYZ");
  });

  it("rejects re-submitting an already-submitted request", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);
    await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    const result = await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "DIFFERENT99" }));
    expect(result?.error).toMatch(/already/i);
  });
});

// Regression coverage for the TOCTOU bug fixed alongside this feature: two
// concurrent approvals of the same submitted request must only ever credit
// coinBalance once, not twice.
describe("approveTopUpRequest", () => {
  it("credits coinBalance exactly once even when approved concurrently twice", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);
    await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    const admin = await createUser();
    await makeAdmin(admin.id);
    await loginAs(admin.id);

    await Promise.all([
      approveTopUpRequest(formData({ requestId: request.id })),
      approveTopUpRequest(formData({ requestId: request.id })),
    ]);

    expect(await coinBalanceOf(user.id)).toBe(50);
    expect((await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("approved");
  });

  it("does not credit an already-approved request again", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);
    await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    const admin = await createUser();
    await makeAdmin(admin.id);
    await loginAs(admin.id);
    await approveTopUpRequest(formData({ requestId: request.id }));
    await approveTopUpRequest(formData({ requestId: request.id }));

    expect(await coinBalanceOf(user.id)).toBe(50);
  });

  it("is not reachable by a non-admin", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);
    await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    redirectState.url = null;
    await expect(approveTopUpRequest(formData({ requestId: request.id }))).rejects.toBeInstanceOf(NextRedirectSignal);
    expect((await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("submitted");
    expect(await coinBalanceOf(user.id)).toBe(0);
  });
});

describe("rejectTopUpRequest", () => {
  it("rejects a submitted request without touching coinBalance", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const request = await createTopUp(50);
    await submitTopUpUtr(undefined, formData({ requestId: request.id, utr: "ABC12345XYZ" }));

    const admin = await createUser();
    await makeAdmin(admin.id);
    await loginAs(admin.id);
    await rejectTopUpRequest(formData({ requestId: request.id, reviewNote: "UTR didn't match" }));

    const updated = await db.coinTopUpRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("rejected");
    expect(await coinBalanceOf(user.id)).toBe(0);
  });
});

describe("savePayoutVpa", () => {
  it("rejects an invalid VPA", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const result = await savePayoutVpa(undefined, formData({ vpa: "not-a-vpa" }));
    expect(result?.error).toBeDefined();
  });

  it("saves a valid VPA", async () => {
    const user = await createUser();
    await loginAs(user.id);
    const result = await savePayoutVpa(undefined, formData({ vpa: "someone@upi" }));
    expect(result?.success).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).payoutUpiVpa).toBe("someone@upi");
  });
});

describe("requestCoinPayout", () => {
  it("rejects when no payout VPA is on file", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 100 } });
    await loginAs(user.id);

    const result = await requestCoinPayout(undefined, formData({ coinAmount: "50" }));
    expect(result?.error).toMatch(/UPI payout address/i);
  });

  it("rejects insufficient balance without debiting", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 10, payoutUpiVpa: "someone@upi" } });
    await loginAs(user.id);

    const result = await requestCoinPayout(undefined, formData({ coinAmount: "50" }));
    expect(result?.error).toMatch(/only have/i);
    expect(await coinBalanceOf(user.id)).toBe(10);
  });

  it("debits the balance and snapshots the vpa on a valid request", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 100, payoutUpiVpa: "someone@upi" } });
    await loginAs(user.id);

    const result = await requestCoinPayout(undefined, formData({ coinAmount: "60" }));
    expect(result?.success).toBe(true);
    expect(await coinBalanceOf(user.id)).toBe(40);

    const payout = await db.coinPayoutRequest.findFirstOrThrow({ where: { userId: user.id } });
    expect(payout.coinAmount).toBe(60);
    expect(payout.vpa).toBe("someone@upi");
    expect(payout.status).toBe("pending");
  });
});

// Regression coverage for the reject-refund TOCTOU fix, mirroring
// approveTopUpRequest's concurrent-approve test above but in the payout
// direction: rejecting the same pending payout twice must only ever refund
// the escrowed coins once.
describe("rejectPayoutRequest", () => {
  it("refunds the escrowed coins exactly once even when rejected concurrently twice", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 100, payoutUpiVpa: "someone@upi" } });
    await loginAs(user.id);
    await requestCoinPayout(undefined, formData({ coinAmount: "60" }));
    expect(await coinBalanceOf(user.id)).toBe(40);

    const payout = await db.coinPayoutRequest.findFirstOrThrow({ where: { userId: user.id } });
    const admin = await createUser();
    await makeAdmin(admin.id);
    await loginAs(admin.id);

    await Promise.all([
      rejectPayoutRequest(formData({ requestId: payout.id })),
      rejectPayoutRequest(formData({ requestId: payout.id })),
    ]);

    expect(await coinBalanceOf(user.id)).toBe(100);
    expect((await db.coinPayoutRequest.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe("rejected");
  });
});

describe("markPayoutPaid", () => {
  it("marks a pending payout paid with the given reference", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 100, payoutUpiVpa: "someone@upi" } });
    await loginAs(user.id);
    await requestCoinPayout(undefined, formData({ coinAmount: "60" }));
    const payout = await db.coinPayoutRequest.findFirstOrThrow({ where: { userId: user.id } });

    const admin = await createUser();
    await makeAdmin(admin.id);
    await loginAs(admin.id);
    await markPayoutPaid(formData({ requestId: payout.id, paidReference: "UPI-REF-1" }));

    const updated = await db.coinPayoutRequest.findUniqueOrThrow({ where: { id: payout.id } });
    expect(updated.status).toBe("paid");
    expect(updated.paidReference).toBe("UPI-REF-1");
  });
});

// Regression coverage for the missing-transaction bug fixed alongside this
// feature: a successful purchase must land the coin debit and the
// PlatformSubscription create together, and a failed (insufficient-balance)
// purchase must leave both completely untouched.
describe("purchaseVipAction", () => {
  it("rejects and leaves the balance untouched when coins are insufficient", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 2 } });
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.error).toMatch(/coins/i);
    expect(await coinBalanceOf(user.id)).toBe(2);

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(await db.platformSubscription.findFirst({ where: { subscriberProfileId: profile.id } })).toBeNull();
  });

  it("debits the coin cost and creates a coin-funded active subscription together", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { coinBalance: 10 } });
    await loginAs(user.id);

    const result = await purchaseVipAction(undefined, formData({ billingInterval: "monthly" }));
    expect(result?.success).toBe(true);
    expect(await coinBalanceOf(user.id)).toBe(4); // profile_premium monthly costs 6 coins

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const subscription = await db.platformSubscription.findFirstOrThrow({ where: { subscriberProfileId: profile.id } });
    expect(subscription.status).toBe("active");
    expect(subscription.plan).toBe("profile_premium");
    expect(subscription.processorSubscriptionId.startsWith("coin:")).toBe(true);
  });
});
