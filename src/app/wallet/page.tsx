import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { getActiveProfileSubscription, COIN_FUNDED_MARKER, premiumCoinPrice } from "@/lib/platform-billing";
import { getWalletBalance, listTransactions } from "@/lib/wallet/ledger";
import { walletActivityLabel } from "@/lib/wallet/activity-labels";
import { getReferralStats } from "@/lib/wallet/referral";
import { getAppOrigin } from "@/lib/email";
import { PurchaseVipForm } from "@/components/PurchaseVipForm";
import { TransferCoinsForm } from "@/components/TransferCoinsForm";
import { ReferralLinkCard } from "@/components/ReferralLinkCard";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; kind?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { cursor, kind } = await searchParams;

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  const balance = await getWalletBalance(user.id);
  const [subscription, activity, referral] = await Promise.all([
    profile ? getActiveProfileSubscription(profile.id) : null,
    listTransactions(user.id, { cursor: cursor ?? null, kind: kind || undefined, limit: 25 }),
    getReferralStats(user.id),
  ]);

  const filterQuery = kind ? `&kind=${encodeURIComponent(kind)}` : "";

  return (
    <div className="profileCard">
      <h1 className="settingsSectionHeading">Wallet</h1>

      <div className="walletHero">
        <span className="walletHeroLabel">
          <Coins size={16} aria-hidden="true" /> Balance
        </span>
        <span className="walletHeroBalance">
          {balance.total} <small>coins</small>
        </span>
        <span className="walletHeroSub">
          1 coin = $1
          {balance.restricted > 0 && ` · ${balance.restricted} restricted (grant coins, not transferable)`}
        </span>
      </div>

      {profile && (
        <PurchaseVipForm
          subscription={
            subscription
              ? {
                  billingInterval: subscription.billingInterval,
                  currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
                  coinFunded: subscription.processorSubscriptionId.startsWith(COIN_FUNDED_MARKER),
                }
              : null
          }
          prices={{ monthly: premiumCoinPrice("monthly"), yearly: premiumCoinPrice("yearly") }}
          coinBalance={balance.total}
        />
      )}

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>Send coins</h2>
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem" }}>
        <TransferCoinsForm />
      </div>

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>Invite &amp; earn</h2>
      <ReferralLinkCard
        joinUrl={`${getAppOrigin()}/join/${referral.code}`}
        rewardedInvites={referral.rewardedInvites}
        maxRewarded={referral.maxRewarded}
        rewardCoins={referral.rewardCoins}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>Activity</h2>
        {/* A Route Handler that streams a CSV file (download), not a page nav. */}
        <a href="/wallet/statement" className="mutedText" style={{ fontSize: "0.8rem" }} download>
          Download statement (CSV)
        </a>
      </div>
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
      {activity.nextCursor && (
        <Link
          href={`/wallet?cursor=${encodeURIComponent(activity.nextCursor)}${filterQuery}`}
          className="mutedText"
          style={{ fontSize: "0.85rem" }}
        >
          Load older →
        </Link>
      )}
    </div>
  );
}
