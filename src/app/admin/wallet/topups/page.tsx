import { requirePlatformAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { approveTopUpRequest, rejectTopUpRequest } from "@/app/actions/wallet";

// A dedicated finance-review page rather than folding into the unified
// /admin/trust-safety queue (TrustSafetyCase) — verifying a bank transfer
// and crediting real value is a reconciliation task, not a content-report
// judgment call, so it stays off the moderation staff's plate. See the
// coin-wallet plan doc for the fuller reasoning if this gets revisited.
export default async function AdminWalletTopUpsPage() {
  await requirePlatformAdmin();

  const requests = await db.coinTopUpRequest.findMany({
    where: { status: "submitted" },
    orderBy: { submittedAt: "asc" },
    take: 50,
    include: { user: { include: { username: true } } },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Coin top-up review</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        No payment gateway confirms these — cross-check each UTR against the platform&apos;s own UPI/bank statement
        before approving.
      </p>

      {requests.length === 0 ? (
        <p className="mutedText">Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {requests.map((request) => (
            <div
              key={request.id}
              className="profileLinkItem"
              style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}
            >
              <div>
                <strong>
                  {request.coinAmount} coins (${request.coinAmount}) — expect ₹{request.amountInr}
                </strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {request.user.username?.handle ? `@${request.user.username.handle}` : request.user.email} ·
                  reference {request.referenceCode}
                </span>
              </div>
              <p style={{ fontSize: "0.9rem", margin: 0 }}>
                UTR: <strong>{request.utr}</strong>
              </p>
              <form
                action={approveTopUpRequest}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <button type="submit" className="button buttonSmall">
                  Approve
                </button>
              </form>
              <form
                action={rejectTopUpRequest}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input
                  type="text"
                  name="reviewNote"
                  placeholder="Rejection reason (optional)"
                  className="textInput"
                  style={{ fontSize: "0.85rem", padding: "0.35rem 0.5rem" }}
                />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Reject
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
