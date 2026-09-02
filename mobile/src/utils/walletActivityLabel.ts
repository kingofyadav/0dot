// Human labels for a wallet-activity row — mirrors
// src/lib/wallet/activity-labels.ts on the web side exactly (same keys, same
// switch/fallback order) so the mobile transaction ledger and web wallet
// page never show different wording for the same entry. Keep these two
// files in sync by inspection if either changes.

type ActivityEntry = { feature: string; kind: string; direction: "in" | "out" };

// PaymentTransaction kinds (the `feature` of a purchase/refund row).
const FEATURE_LABEL: Record<string, string> = {
  digital_purchase: "Digital product",
  course_purchase: "Course",
  membership_charge: "Membership",
  affiliate_commission: "Affiliate commission",
  ticket_purchase: "Ticket",
  business_purchase: "Store sale",
  freelance_purchase: "Service",
  marketplace_purchase: "Marketplace",
  platform_subscription_charge: "Premium",
  api_usage_charge: "API usage",
};

// Ledger kinds — the fallback when a row has no linked PaymentTransaction.
const LEDGER_LABEL: Record<string, string> = {
  signup_grant: "Signup bonus",
  promo_grant: "Promo credit",
  admin_adjustment: "Adjustment",
  referral_reward: "Referral reward",
  transfer: "Transfer",
  purchase: "Purchase",
  refund: "Refund",
  hold: "Held (pending)",
  hold_capture: "Purchase",
  hold_release: "Hold released",
  promo_expiry: "Expired — unused grant coins",
  migration_opening: "Opening balance",
};

export function walletActivityLabel(entry: ActivityEntry): string {
  const inbound = entry.direction === "in";
  switch (entry.feature) {
    case "tip":
      return inbound ? "Tip received" : "Tip sent";
    case "donation":
      return inbound ? "Donation received" : "Donation sent";
    case "transfer":
      return inbound ? "Coins received" : "Coins sent";
    default:
      return (
        FEATURE_LABEL[entry.feature] ??
        LEDGER_LABEL[entry.feature] ??
        LEDGER_LABEL[entry.kind] ??
        entry.kind
      );
  }
}
