import { describe, it, expect } from "vitest";
import { classifyCheckoutSession, isFulfillableSubscriptionStatus } from "@/lib/stripe-webhook-fulfillment";

type Session = Parameters<typeof classifyCheckoutSession>[0];

const KNOWN_ONE_TIME = new Set(["tip", "donation", "digital_purchase"]);

function makeSession(overrides: Partial<Session>): Session {
  return {
    mode: "payment",
    metadata: {},
    payment_status: "paid",
    subscription: null,
    ...overrides,
  } as Session;
}

describe("classifyCheckoutSession", () => {
  it("defers a one-time payment that has not settled yet", () => {
    const d = classifyCheckoutSession(
      makeSession({ metadata: { kind: "tip" }, payment_status: "unpaid" }),
      KNOWN_ONE_TIME,
    );
    expect(d.action).toBe("defer");
  });

  it("fulfills a paid one-time payment with a recognized kind", () => {
    const d = classifyCheckoutSession(
      makeSession({ metadata: { kind: "tip" }, payment_status: "paid" }),
      KNOWN_ONE_TIME,
    );
    expect(d).toEqual({ action: "one-time", activatorKey: "tip" });
  });

  it("treats no_payment_required as fulfillable", () => {
    const d = classifyCheckoutSession(
      makeSession({ metadata: { kind: "donation" }, payment_status: "no_payment_required" }),
      KNOWN_ONE_TIME,
    );
    expect(d.action).toBe("one-time");
  });

  it("ignores an unrecognized one-time kind", () => {
    const d = classifyCheckoutSession(makeSession({ metadata: { kind: "mystery" } }), KNOWN_ONE_TIME);
    expect(d.action).toBe("ignore");
  });

  it("routes a subscription-mode session by its kind", () => {
    const d = classifyCheckoutSession(
      makeSession({ mode: "subscription", subscription: "sub_123", metadata: { kind: "membership" } }),
      KNOWN_ONE_TIME,
    );
    expect(d).toEqual({ action: "subscription", subscriptionKind: "membership" });
  });

  it("ignores a subscription-mode session with no subscription reference", () => {
    const d = classifyCheckoutSession(
      makeSession({ mode: "subscription", subscription: null, metadata: { kind: "membership" } }),
      KNOWN_ONE_TIME,
    );
    expect(d.action).toBe("ignore");
  });

  it("ignores an unhandled checkout mode", () => {
    expect(classifyCheckoutSession(makeSession({ mode: "setup" }), KNOWN_ONE_TIME).action).toBe("ignore");
  });
});

describe("isFulfillableSubscriptionStatus", () => {
  it("accepts only active and trialing", () => {
    expect(isFulfillableSubscriptionStatus("active")).toBe(true);
    expect(isFulfillableSubscriptionStatus("trialing")).toBe(true);
    expect(isFulfillableSubscriptionStatus("incomplete")).toBe(false);
    expect(isFulfillableSubscriptionStatus("past_due")).toBe(false);
    expect(isFulfillableSubscriptionStatus("canceled")).toBe(false);
  });
});
