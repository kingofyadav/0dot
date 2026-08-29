import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveProfileSubscription, FREE_LINK_CAP, PREMIUM_LINK_CAP, FREE_ANALYTICS_WINDOW_DAYS } from "@/lib/platform-billing";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { PremiumBillingForm } from "./PremiumBillingForm";

export const metadata: Metadata = { title: "Premium" };

export default async function PremiumBillingPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  const subscription = await getActiveProfileSubscription(profileRow.id);
  const premiumPresetCount = THEME_PRESETS.filter((p) => p.premiumOnly).length;

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Premium</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        A distinct badge, a raised link cap ({FREE_LINK_CAP} → {PREMIUM_LINK_CAP}), full link-analytics history
        (free shows the last {FREE_ANALYTICS_WINDOW_DAYS} days), {premiumPresetCount} extra theme presets, one
        included custom domain, and a reduced platform fee on your creator earnings.
      </p>

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
      />
    </div>
  );
}
