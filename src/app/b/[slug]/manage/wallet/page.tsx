import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import { getActiveBusinessSubscription } from "@/lib/platform-billing";
import { getBusinessWalletBalance, listBusinessTransactions } from "@/lib/wallet/ledger";
import { walletActivityLabel } from "@/lib/wallet/activity-labels";
import { EmptyState } from "@/components/EmptyState";
import { BusinessManageNav } from "../BusinessManageNav";
import { BusinessSubscribeWithCoinsForm } from "./BusinessWalletForms";

export const metadata: Metadata = { title: "Wallet" };

export default async function BusinessWalletPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  // Any team member can view the wallet; only owner/admin can spend it (§6.5).
  const member = await getBusinessMember(business.id, currentUser.id);
  if (!member) redirect(`/b/${business.slug}`);
  const canSpend = await isBusinessStaff(business.id, currentUser.id);

  const [balance, activity, subscription, newContactMessageCount] = await Promise.all([
    getBusinessWalletBalance(business.id),
    listBusinessTransactions(business.id, { limit: 25 }),
    getActiveBusinessSubscription(business.id),
    db.contactMessage.count({ where: { businessId: business.id, status: "new" } }),
  ]);

  return (
    <div className="profileCard">
      <BusinessManageNav
        slug={business.slug}
        businessName={business.name}
        title={`Wallet — ${business.name}`}
        current="wallet"
        contactCount={newContactMessageCount}
      />

      <div className="walletHero">
        <span className="walletHeroLabel">Business balance</span>
        <span className="walletHeroBalance">
          {balance.total} <small>coins</small>
        </span>
        <span className="walletHeroSub">
          1 coin = $1
          {balance.restricted > 0 && ` · ${balance.restricted} restricted (promo credit)`}
        </span>
      </div>

      <p className="mutedText" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        Coin sales from this business&apos;s Store and events land here. The balance spends only on
        0dot goods (your subscription) — it can&apos;t be sent to a person or cashed out.
      </p>

      <p className="sectionHeading">Subscription</p>
      {subscription ? (
        <p className="mutedText" style={{ fontSize: "0.9rem" }}>
          Active until {subscription.currentPeriodEnd.toLocaleDateString()}
          {subscription.processorSubscriptionId.startsWith("coin:") ? " (coin-funded)." : "."}
        </p>
      ) : canSpend ? (
        <BusinessSubscribeWithCoinsForm businessId={business.id} />
      ) : (
        <p className="mutedText" style={{ fontSize: "0.9rem" }}>
          No active subscription. An owner or admin can pay it from this wallet.
        </p>
      )}

      <p className="sectionHeading" style={{ marginTop: "1.25rem" }}>Recent activity</p>
      <div className="settingsGroup" style={{ padding: activity.entries.length ? "0.4rem" : "0.9rem 1rem" }}>
        {activity.entries.length === 0 && <EmptyState message="No wallet activity yet." />}
        {activity.entries.map((e) => (
          <div key={e.id} className="navLink" style={{ justifyContent: "space-between" }}>
            <span>{walletActivityLabel(e)}{e.memo ? ` — ${e.memo}` : ""}</span>
            <span className="mutedText">
              {e.amountCoins > 0 ? "+" : ""}
              {e.amountCoins} coin{Math.abs(e.amountCoins) === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
