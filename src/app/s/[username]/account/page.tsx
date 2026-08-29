import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { SettingsRow } from "@/components/SettingsRow";
import { DeactivateAccountAction, RequestAccountDeletionAction } from "./AccountLifecycleActions";

export const metadata: Metadata = { title: "Account management" };

export default async function AccountManagementPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Account management</h2>

      <div className="settingsGroup">
        <SettingsRow
          label="Export your data"
          description="Download a copy of your profile, links, posts, articles, projects, and bookmarks as JSON."
          trailing={
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download (Content-Disposition: attachment), not a page navigation next/link's client-side router applies to.
            <a href="/api/account/export" className="button buttonSecondary buttonSmall">
              Download
            </a>
          }
        />
      </div>

      <p className="settingsGroupLabel">Danger zone</p>
      <div className="settingsCard settingsCardDanger">
        <p className="settingsCardDangerHeading">
          <AlertTriangle size={16} aria-hidden="true" />
          Irreversible actions
        </p>

        <div className="settingsDangerRow">
          <div className="settingsDangerRowText">
            <span className="settingsDangerRowLabel">Deactivate account</span>
            <span className="settingsDangerRowDescription">
              Hides your profile and signs you out everywhere. Log back in within 30 days to reactivate —
              after that, your account is permanently deleted.
            </span>
          </div>
          <DeactivateAccountAction />
        </div>

        <div className="settingsDangerRow">
          <div className="settingsDangerRowText">
            <span className="settingsDangerRowLabel">Delete account</span>
            <span className="settingsDangerRowDescription">
              Schedules your account for permanent deletion in 30 days. Logging back in before then cancels
              it.
            </span>
          </div>
          <RequestAccountDeletionAction />
        </div>
      </div>
    </div>
  );
}
