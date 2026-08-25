import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";

// No page.tsx existed at this path before — only its two sub-routes
// (wallet/payouts, wallet/topups) did, so /admin/wallet bare-404'd despite
// being a real section. Thin landing shell, same shape as /admin/trust-safety.
export default async function AdminWalletPage() {
  await requirePlatformRole("admin");

  const [pendingPayouts, pendingTopups] = await Promise.all([
    db.coinPayoutRequest.count({ where: { status: "pending" } }),
    db.coinTopUpRequest.count({ where: { status: "submitted" } }),
  ]);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Wallet</h1>
        <Link href="/admin" className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← Admin
        </Link>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        The internal coin economy — no payment gateway confirms these, every request needs a manual UPI
        cross-check.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Link href="/admin/wallet/topups" className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
          <strong>Coin top-up review</strong>
          <span className="mutedText" style={{ fontSize: "0.85rem" }}>
            {pendingTopups > 0 ? `${pendingTopups} pending` : "Nothing pending"}
          </span>
        </Link>
        <Link href="/admin/wallet/payouts" className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
          <strong>Coin payout review</strong>
          <span className="mutedText" style={{ fontSize: "0.85rem" }}>
            {pendingPayouts > 0 ? `${pendingPayouts} pending` : "Nothing pending"}
          </span>
        </Link>
      </div>
    </div>
  );
}
