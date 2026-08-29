import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { getActiveProfileSubscription, COIN_FUNDED_MARKER, TEST_MODE_VIP_COIN_COST } from "@/lib/platform-billing";
import { PurchaseVipForm } from "@/components/PurchaseVipForm";
import { TransferCoinsForm } from "@/components/TransferCoinsForm";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage() {
  const user = await requireVerifiedUser();

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  const [subscription, sentTransfers, receivedTransfers] = await Promise.all([
    profile ? getActiveProfileSubscription(profile.id) : null,
    db.coinTransfer.findMany({
      where: { fromUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { toUser: { include: { username: true } } },
    }),
    db.coinTransfer.findMany({
      where: { toUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { fromUser: { include: { username: true } } },
    }),
  ]);

  const transfers = [
    ...sentTransfers.map((t) => ({ id: t.id, createdAt: t.createdAt, amount: t.amount, direction: "sent" as const, otherHandle: t.toUser.username?.handle ?? "unknown" })),
    ...receivedTransfers.map((t) => ({ id: t.id, createdAt: t.createdAt, amount: t.amount, direction: "received" as const, otherHandle: t.fromUser.username?.handle ?? "unknown" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="profileCard">
      <h1 className="settingsSectionHeading">Wallet</h1>

      <div className="walletHero">
        <span className="walletHeroLabel">
          <Coins size={16} aria-hidden="true" /> Balance
        </span>
        <span className="walletHeroBalance">
          {user.coinBalance} <small>coins</small>
        </span>
        <span className="walletHeroSub">1 coin = $1</span>
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
          coinPrice={TEST_MODE_VIP_COIN_COST}
          coinBalance={user.coinBalance}
        />
      )}

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Send coins
      </h2>
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem" }}>
        <TransferCoinsForm />
      </div>

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Recent transfers
      </h2>
      <div className="settingsGroup" style={{ padding: transfers.length ? "0.4rem" : "0.9rem 1rem" }}>
        {transfers.length === 0 && <EmptyState message="No transfers yet." />}
        {transfers.map((t) => (
          <div key={t.id} className="navLink" style={{ justifyContent: "space-between" }}>
            <span>
              {t.direction === "sent" ? `Sent to @${t.otherHandle}` : `Received from @${t.otherHandle}`}
            </span>
            <span className="mutedText">
              {t.direction === "sent" ? "-" : "+"}
              {t.amount} coin{t.amount === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
