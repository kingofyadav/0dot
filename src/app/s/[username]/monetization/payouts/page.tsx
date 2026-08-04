import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getMyPayoutAccount } from "@/lib/payments";
import { PayoutOnboardingForm } from "../../PayoutOnboardingForm";

export default async function PayoutsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const payoutAccount = await getMyPayoutAccount(currentUser.id);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Payouts</h2>
      <PayoutOnboardingForm status={payoutAccount?.status ?? null} />
    </div>
  );
}
