import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { PrivacySettingsForm } from "./PrivacySettingsForm";

export default async function PrivacySettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.profile) redirect("/login");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Privacy</h2>
      <PrivacySettingsForm
        allowDmsFrom={currentUser.profile.allowDmsFrom}
        allowTagging={currentUser.profile.allowTagging}
        discoverableInSearch={currentUser.profile.discoverableInSearch}
      />
    </div>
  );
}
