import Link from "next/link";
import { Coins } from "lucide-react";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { getActiveProfileSubscription, PLAN_PRICES, COIN_FUNDED_MARKER } from "@/lib/platform-billing";
import { CreateTopUpForm } from "@/components/CreateTopUpForm";
import { SavePayoutVpaForm } from "@/components/SavePayoutVpaForm";
import { PurchaseVipForm } from "@/components/PurchaseVipForm";
import { RequestPayoutForm } from "@/components/RequestPayoutForm";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  submitted: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  rejected: "Rejected — coins refunded",
};

export default async function WalletPage() {
  const user = await requireVerifiedUser();

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  const [requests, payoutRequests, subscription] = await Promise.all([
    db.coinTopUpRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.coinPayoutRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    profile ? getActiveProfileSubscription(profile.id) : null,
  ]);

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
          prices={PLAN_PRICES.profile_premium}
          coinBalance={user.coinBalance}
        />
      )}

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Top up
      </h2>
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem" }}>
        <CreateTopUpForm />
      </div>

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Recent top-ups
      </h2>
      <div className="settingsGroup" style={{ padding: requests.length ? "0.4rem" : "0.9rem 1rem" }}>
        {requests.length === 0 && <p className="mutedText">No top-up requests yet.</p>}
        {requests.map((request) => (
          <Link
            key={request.id}
            href={`/wallet/topup/${request.id}`}
            className="navLink"
            style={{ justifyContent: "space-between" }}
          >
            <span>{request.coinAmount} coins</span>
            <span className="mutedText">{STATUS_LABELS[request.status] ?? request.status}</span>
          </Link>
        ))}
      </div>

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Payout address
      </h2>
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem" }}>
        <p className="mutedText" style={{ marginBottom: "0.5rem" }}>
          Where a coin-to-cash payout gets sent.
        </p>
        <SavePayoutVpaForm currentVpa={user.payoutUpiVpa} />
      </div>

      <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
        Cash out
      </h2>
      <div className="settingsGroup" style={{ padding: "0.9rem 1rem" }}>
        {user.payoutUpiVpa ? (
          <RequestPayoutForm coinBalance={user.coinBalance} />
        ) : (
          <p className="mutedText">Save a UPI payout address above first.</p>
        )}
      </div>

      {payoutRequests.length > 0 && (
        <>
          <h2 className="settingsSectionHeading" style={{ fontSize: "0.95rem" }}>
            Payout history
          </h2>
          <div className="settingsGroup" style={{ padding: "0.4rem" }}>
            {payoutRequests.map((request) => (
              <div key={request.id} className="navLink" style={{ justifyContent: "space-between" }}>
                <span>{request.coinAmount} coins (₹{request.amountInr})</span>
                <span className="mutedText">{PAYOUT_STATUS_LABELS[request.status] ?? request.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
