import Link from "next/link";
import { requirePlatformRole } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { markPayoutPaid, rejectPayoutRequest } from "@/app/actions/wallet";
import { EmptyState } from "@/components/EmptyState";

// Mirrors /admin/wallet/topups in the opposite direction — an admin sends
// the money via UPI to the request's snapshotted vpa outside the app, then
// records their own UTR/reference here as proof it went out.
export default async function AdminWalletPayoutsPage() {
  await requirePlatformRole("admin");

  const requests = await db.coinPayoutRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { user: { include: { username: true } } },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Coin payout review</h1>
        <Link href="/admin/wallet" className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← Wallet
        </Link>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Send each amount via UPI to the listed address yourself, then mark it paid with whatever reference your UPI
        app gives you.
      </p>

      {requests.length === 0 ? (
        <EmptyState message="Nothing pending." />
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
                  {request.coinAmount} coins (${request.coinAmount}) — send ₹{request.amountInr}
                </strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {request.user.username?.handle ? `@${request.user.username.handle}` : request.user.email}
                </span>
              </div>
              <p style={{ fontSize: "0.9rem", margin: 0 }}>
                Pay to: <strong>{request.vpa}</strong>
              </p>
              <form
                action={markPayoutPaid}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input
                  type="text"
                  name="paidReference"
                  placeholder="UTR / reference number"
                  className="textInput"
                  style={{ fontSize: "0.85rem", padding: "0.35rem 0.5rem" }}
                  required
                />
                <button type="submit" className="button buttonSmall">
                  Mark paid
                </button>
              </form>
              <form
                action={rejectPayoutRequest}
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
                  Reject &amp; refund coins
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
