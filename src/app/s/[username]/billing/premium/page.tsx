import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveProfileSubscription, PLAN_PRICES, FREE_LINK_CAP, PREMIUM_LINK_CAP, FREE_ANALYTICS_WINDOW_DAYS } from "@/lib/platform-billing";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { PremiumBillingForm } from "./PremiumBillingForm";

export default async function PremiumBillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  const subscription = await getActiveProfileSubscription(profileRow.id);
  const premiumPresetCount = THEME_PRESETS.filter((p) => p.premiumOnly).length;
  const { checkout } = await searchParams;

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Premium</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        A distinct badge, a raised link cap ({FREE_LINK_CAP} → {PREMIUM_LINK_CAP}), full link-analytics history
        (free shows the last {FREE_ANALYTICS_WINDOW_DAYS} days), {premiumPresetCount} extra theme presets, one
        included custom domain, and a reduced platform fee on your creator earnings.
      </p>

      {checkout === "success" && !subscription && (
        <p className="mutedText" style={{ marginBottom: "1rem" }}>
          Payment received — activating your subscription. Refresh in a moment if it doesn&apos;t show below yet.
        </p>
      )}

      <PremiumBillingForm
        subscription={
          subscription
            ? {
                id: subscription.id,
                status: subscription.status,
                billingInterval: subscription.billingInterval,
                currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
              }
            : null
        }
        prices={PLAN_PRICES.profile_premium}
      />
    </div>
  );
}
