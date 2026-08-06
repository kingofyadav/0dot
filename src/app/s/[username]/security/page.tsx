import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "../ChangePasswordForm";

export default async function SecuritySettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Change password</h2>
      <ChangePasswordForm />
    </div>
  );
}
