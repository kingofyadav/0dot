import { requirePlatformAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { createIapPayoutBatchAction, reconcileIapPayoutBatchAction } from "@/app/actions/iap-payouts";

// Mobile pro-upgrade addendum M11: the admin trigger surface for
// recordIapPayoutBatch/reconcileIapPayoutBatch (lib/payments.ts), which
// existed with no caller anywhere before this page. A dedicated
// /admin/payments/ area rather than folding into /admin/wallet/ — that
// area is the internal coin economy (CoinTopUpRequest/CoinPayoutRequest),
// a different domain from PaymentTransaction/Stripe Connect real money.
// Deliberately stops at "record the lump sum" and "attribute transactions
// to it" — the two steps lib/payments.ts already implements. No
// "disburse" action here: nothing on this page moves money to a creator,
// and actually paying out through CreatorPayoutAccount per phase-15 §6.3
// is dedicated finance/ops work this addendum was explicit about not
// building.
export default async function AdminIapBatchesPage() {
  await requirePlatformAdmin();

  const batches = await db.iapPayoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { transactions: { select: { amount: true, platformFee: true, storeFee: true } } },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>IAP payout batches</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Records an aggregated Apple/Google lump-sum payout, then attributes every succeeded, not-yet-reconciled
        transaction for that processor within the period to it. Doesn&apos;t disburse anything to creators — that
        step isn&apos;t built (see the mobile pro-upgrade addendum, M11).
      </p>

      <form
        action={createIapPayoutBatchAction}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.5rem" }}
      >
        <select name="processor" required defaultValue="" className="textInput" style={{ flex: "1 1 160px" }}>
          <option value="" disabled>
            Processor
          </option>
          <option value="apple_iap">Apple IAP</option>
          <option value="google_play_billing">Google Play Billing</option>
        </select>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          placeholder="Lump sum received"
          required
          className="textInput"
          style={{ flex: "1 1 160px" }}
        />
        <input type="text" name="currency" defaultValue="usd" placeholder="Currency" className="textInput" style={{ flex: "0 1 90px" }} />
        <input type="date" name="periodStart" required className="textInput" style={{ flex: "1 1 150px" }} />
        <input type="date" name="periodEnd" required className="textInput" style={{ flex: "1 1 150px" }} />
        <button type="submit" className="button buttonSmall">
          Record batch
        </button>
      </form>

      {batches.length === 0 ? (
        <p className="mutedText">No batches recorded yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {batches.map((batch) => {
            const attributed = batch.transactions.length;
            const platformFeeTotal = batch.transactions.reduce((sum, t) => sum + t.platformFee, 0);
            const storeFeeTotal = batch.transactions.reduce((sum, t) => sum + (t.storeFee ?? 0), 0);
            return (
              <div
                key={batch.id}
                className="profileLinkItem"
                style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}
              >
                <div>
                  <strong>
                    {batch.processor === "apple_iap" ? "Apple IAP" : "Google Play Billing"} — {batch.amount} {batch.currency.toUpperCase()}
                  </strong>{" "}
                  <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                    {batch.periodStart.toISOString().slice(0, 10)} → {batch.periodEnd.toISOString().slice(0, 10)} · status:{" "}
                    {batch.status}
                  </span>
                </div>
                <p style={{ fontSize: "0.9rem", margin: 0 }}>
                  {attributed} transaction{attributed === 1 ? "" : "s"} attributed
                  {attributed > 0 ? ` · platform fee ${platformFeeTotal.toFixed(2)} · store fee ${storeFeeTotal.toFixed(2)}` : ""}
                </p>
                {batch.status === "received" ? (
                  <form action={reconcileIapPayoutBatchAction}>
                    <input type="hidden" name="batchId" value={batch.id} />
                    <button type="submit" className="button buttonSmall">
                      Reconcile
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
