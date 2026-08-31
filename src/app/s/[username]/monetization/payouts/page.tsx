import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getMyPayoutAccount } from "@/lib/payments";
import { PayoutOnboardingForm } from "../../PayoutOnboardingForm";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const payoutAccount = await getMyPayoutAccount(currentUser.id);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Payouts</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Connect a payout account to receive tips, membership dues, and sales. Payments are settled to your bank by our
        payments partner — you only need to set this up once.
      </p>

      <PayoutOnboardingForm
        status={payoutAccount?.status ?? null}
        hasAccount={payoutAccount?.processorAccountId != null}
      />
    </div>
  );
}
