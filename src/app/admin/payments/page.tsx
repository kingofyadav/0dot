import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";

// No page.tsx existed at this path before — only its sub-route
// (payments/iap-batches) did, so /admin/payments bare-404'd despite being
// a real section. This is a thin landing shell in the same shape as
// /admin/trust-safety: summary + links out, same admin bar as iap-batches.
export default async function AdminPaymentsPage() {
  await requirePlatformRole("admin");

  const [totalBatches, pendingBatches] = await Promise.all([
    db.iapPayoutBatch.count(),
    db.iapPayoutBatch.count({ where: { status: "received" } }),
  ]);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Payments</h1>
        <Link href="/admin" className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← Admin
        </Link>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        In-app-purchase (Apple/Google) payout batches — a different domain from the wallet&apos;s internal coin
        economy.
      </p>

      <Link href="/admin/payments/iap-batches" className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
        <strong>IAP payout batches</strong>
        <span className="mutedText" style={{ fontSize: "0.85rem" }}>
          {totalBatches} recorded{pendingBatches > 0 ? ` · ${pendingBatches} awaiting reconciliation` : ""}
        </span>
      </Link>
    </div>
  );
}
