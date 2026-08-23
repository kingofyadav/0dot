import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getMyPayoutAccount } from "@/lib/payments";
import { SettingsRow } from "@/components/SettingsRow";
import { PayoutOnboardingForm } from "../../PayoutOnboardingForm";

export default async function PayoutsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const payoutAccount = await getMyPayoutAccount(currentUser.id);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Payouts</h2>
      <div className="settingsGroup">
        <SettingsRow
          icon={Wallet}
          label="Payout account"
          trailing={<PayoutOnboardingForm status={payoutAccount?.status ?? null} hasAccount={payoutAccount?.processorAccountId != null} />}
        />
      </div>
    </div>
  );
}
