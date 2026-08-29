import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ChangePhoneForm } from "./ChangePhoneForm";

export const metadata: Metadata = { title: "Email & phone" };

export default async function ContactSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Email & phone</h2>

      <p className="settingsGroupLabel">Email address</p>
      <ChangeEmailForm currentEmail={currentUser.email} />

      <p className="settingsGroupLabel" style={{ marginTop: "1.5rem" }}>
        Mobile number
      </p>
      <ChangePhoneForm currentPhone={currentUser.phone} />
    </div>
  );
}
