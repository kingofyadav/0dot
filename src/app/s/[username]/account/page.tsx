import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DeactivateAccountAction, RequestAccountDeletionAction } from "./AccountLifecycleActions";

export default async function AccountManagementPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Account management</h2>

      <p className="settingsGroupLabel">Export your data</p>
      <p className="mutedText" style={{ marginBottom: "0.75rem" }}>
        Download a copy of your profile, links, posts, articles, projects, and bookmarks as JSON.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download (Content-Disposition: attachment), not a page navigation next/link's client-side router applies to. */}
      <a href="/api/account/export" className="button buttonSecondary">
        Download my data
      </a>

      <p className="settingsGroupLabel" style={{ marginTop: "2rem" }}>
        Deactivate account
      </p>
      <p className="mutedText" style={{ marginBottom: "0.75rem" }}>
        Hides your profile and signs you out everywhere. Log back in within 30 days to reactivate — after
        that, your account is permanently deleted.
      </p>
      <DeactivateAccountAction />

      <p className="settingsGroupLabel" style={{ marginTop: "2rem" }}>
        Delete account
      </p>
      <p className="mutedText" style={{ marginBottom: "0.75rem" }}>
        Schedules your account for permanent deletion in 30 days. Logging back in before then cancels it.
      </p>
      <RequestAccountDeletionAction />
    </div>
  );
}
