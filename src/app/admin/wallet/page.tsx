import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { getWalletOverview } from "@/lib/wallet/reconcile";
import { SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { EmptyState } from "@/components/EmptyState";
import { GrantCoinsForm } from "./GrantCoinsForm";

const AUDIT_LABEL: Record<string, string> = {
  signup_grant: "signup",
  promo_grant: "promo",
  admin_adjustment: "adjustment",
  referral_reward: "referral",
};

// addendum-coin-wallet-v2.md §13.3 — the internal coin-economy console.
// The manual UPI top-up/payout queues that used to live here are gone; the
// closed-loop ledger's own invariants (reconciliation cron §11.1) plus the
// capped, audited grant tool below are the fraud controls now.
export default async function AdminWalletPage() {
  await requirePlatformRole("admin");

  const overview = await getWalletOverview();

  const issuance = await db.ledgerTransaction.findMany({
    where: { kind: { in: ["promo_grant", "admin_adjustment", "signup_grant", "referral_reward"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { postings: true },
  });
  const actorIds = [...new Set(issuance.map((t) => t.actorUserId).filter((x): x is string => Boolean(x)))];
  const actors = await db.username.findMany({ where: { userId: { in: actorIds } }, select: { userId: true, handle: true } });
  const actorHandle = new Map(actors.map((a) => [a.userId, a.handle]));

  const stat = (label: string, value: string) => (
    <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.1rem" }}>
      <span className="mutedText" style={{ fontSize: "0.8rem" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Wallet</h1>
        <Link href="/admin" className="mutedText" style={{ fontSize: "0.85rem" }}>← Admin</Link>
      </div>

      <p className="sectionHeading">Overview</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {stat("Coins outstanding", `${overview.outstandingCoins.toLocaleString()}`)}
        {stat("Promo liability", `${overview.promoLiabilityCoins.toLocaleString()}`)}
        {stat("Platform coin revenue", `${overview.platformRevenueCoins.toLocaleString()}`)}
        {stat("Held in escrow", `${overview.escrowCoins.toLocaleString()}`)}
        {stat("Grants today", `${overview.grantsToday}`)}
        {stat("Coin purchases today", `${overview.purchasesToday}`)}
      </div>

      <p className="sectionHeading">Grant tool</p>
      <p className="mutedText" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        Per-admin daily cap and a hard ceiling apply; every grant is audited below.
      </p>
      <GrantCoinsForm />

      <p className="sectionHeading" style={{ marginTop: "1.5rem" }}>Issuance audit</p>
      <div className="settingsGroup" style={{ padding: issuance.length ? "0.4rem" : "0.9rem 1rem" }}>
        {issuance.length === 0 && <EmptyState message="No grants yet." />}
        {issuance.map((t) => {
          // The issuance posting on system_promo_issuance carries the true
          // amount moved: negative = coins issued, positive = clawed back.
          const issuancePosting = t.postings.find((p) => p.accountId === SYSTEM_ACCOUNT_IDS.system_promo_issuance);
          const coins = -(issuancePosting?.amount ?? 0) / 100;
          return (
            <div key={t.id} className="navLink" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem" }}>
                <strong>{AUDIT_LABEL[t.kind] ?? t.kind}</strong>
                {t.actorUserId ? ` by @${actorHandle.get(t.actorUserId) ?? "?"}` : " (system)"}
                {t.memo ? ` — ${t.memo}` : ""}
                <span className="mutedText"> · {t.createdAt.toLocaleDateString()}</span>
              </span>
              <span className="mutedText" style={{ whiteSpace: "nowrap" }}>{coins > 0 ? "+" : ""}{coins} coins</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
