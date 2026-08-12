import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { recordPaymentTransaction } from "@/lib/payments";

// billing addendum §4.1: meters against Phase 10 §5.3's *existing*
// aggregated ApiUsageCounter rows — no parallel per-request billing log.
// Prices are finance-TBD placeholders, same posture as
// PLATFORM_FEE_PERCENT/PLAN_PRICES elsewhere in this billing layer.
const INCLUDED_FREE_REQUESTS_PER_PERIOD = 10_000; // pay_as_you_go's first N requests/period are free, matching the free plan's own rough hourly cap scaled to a month
const PRICE_PER_1000_REQUESTS_OVER = 0.5; // usd
const COMMITTED_PLAN_FLAT_PRICE = 49; // usd/period — a prepaid commitment, charged regardless of usage
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

async function resolveAppPayerUserId(app: { ownerUserId: string | null; ownerBusinessId: string | null }): Promise<string | null> {
  if (app.ownerUserId) return app.ownerUserId;
  if (app.ownerBusinessId) {
    const owner = await db.businessMember.findFirst({ where: { businessId: app.ownerBusinessId, role: "owner" }, select: { userId: true } });
    return owner?.userId ?? null;
  }
  return null;
}

// Settles one DeveloperApp's usage since its lastBilledAt (or creation, on
// the first run) against the current period's counters, charges if
// anything is owed, and advances the watermark regardless — a
// zero-request pay_as_you_go period still needs lastBilledAt to move
// forward so the next sweep doesn't re-bill the same window.
export async function settleAppUsage(appId: string): Promise<void> {
  const app = await db.developerApp.findUniqueOrThrow({ where: { id: appId } });
  if (app.billingPlan === "free") return;

  const periodStart = app.lastBilledAt ?? app.createdAt;
  const now = new Date();

  const payerId = await resolveAppPayerUserId(app);
  if (!payerId) {
    await db.developerApp.update({ where: { id: app.id }, data: { lastBilledAt: now } });
    return;
  }

  let amount = 0;
  if (app.billingPlan === "committed") {
    amount = COMMITTED_PLAN_FLAT_PRICE;
  } else {
    const usage = await db.apiUsageCounter.aggregate({
      where: { appId: app.id, windowStart: { gte: periodStart, lt: now } },
      _sum: { requestCount: true },
    });
    const totalRequests = usage._sum.requestCount ?? 0;
    const overage = Math.max(0, totalRequests - INCLUDED_FREE_REQUESTS_PER_PERIOD);
    amount = Math.round((overage / 1000) * PRICE_PER_1000_REQUESTS_OVER * 100) / 100;
  }

  if (amount > 0) {
    await db.$transaction(async (tx) => {
      await recordPaymentTransaction(tx, {
        kind: "api_usage_charge",
        payerId,
        payeeId: null,
        amount,
        currency: "usd",
        // No real processor call exists for this stub settlement job — a
        // locally-generated reference, same "no card network to wait on"
        // stub posture as StubPaymentProcessor's charge().
        processorReference: `stub_usage_${randomBytes(8).toString("hex")}`,
        status: "succeeded",
        relatedObjectType: "developer_app",
        relatedObjectId: app.id,
      });
    });
  }

  await db.developerApp.update({ where: { id: app.id }, data: { lastBilledAt: now } });
}

async function sweepDueSettlements(): Promise<void> {
  const due = await db.developerApp.findMany({
    where: {
      billingPlan: { in: ["pay_as_you_go", "committed"] },
      OR: [{ lastBilledAt: null }, { lastBilledAt: { lt: new Date(Date.now() - BILLING_PERIOD_MS) } }],
    },
    select: { id: true },
  });
  for (const { id } of due) await settleAppUsage(id);
}

const SETTLEMENT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // periods are month-long — checking a few times a day is plenty

const globalForApiUsageBilling = globalThis as unknown as { apiUsageBillingSchedulerStarted?: boolean };

export function startApiUsageBillingScheduler(): void {
  if (globalForApiUsageBilling.apiUsageBillingSchedulerStarted) return;
  globalForApiUsageBilling.apiUsageBillingSchedulerStarted = true;

  const tick = () => void sweepDueSettlements();
  tick();
  setInterval(tick, SETTLEMENT_CHECK_INTERVAL_MS);
}
