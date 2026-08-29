import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { TwoFactorSetupForm } from "./TwoFactorSetupForm";
import { DisableTwoFactorForm } from "./DisableTwoFactorForm";
import { RegenerateRecoveryCodesForm } from "./RegenerateRecoveryCodesForm";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function TwoFactorSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  if (currentUser.twoFactorEnabledAt) {
    return (
      <div className="settingsSection">
        <h2 className="settingsSectionHeading">Two-factor authentication</h2>
        <p className="mutedText" style={{ marginBottom: "1rem" }}>
          Two-factor authentication is enabled on your account.
        </p>

        <p className="settingsGroupLabel">Recovery codes</p>
        <RegenerateRecoveryCodesForm />

        <p className="settingsGroupLabel" style={{ marginTop: "1.5rem" }}>
          Disable
        </p>
        <DisableTwoFactorForm />
      </div>
    );
  }

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Two-factor authentication</h2>
      <TwoFactorSetupForm />
    </div>
  );
}
