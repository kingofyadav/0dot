import { redirect } from "next/navigation";
import { Mail, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { sendIssue, deleteIssue } from "@/app/actions/newsletter";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { NewsletterIssueForm } from "../../NewsletterIssueForm";

export default async function NewsletterSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.username) redirect("/login");

  const [issues, myTiers, subscriberCount] = await Promise.all([
    db.newsletterIssue.findMany({ where: { creatorId: currentUser.id }, orderBy: { createdAt: "desc" } }),
    db.membershipTier.findMany({ where: { creatorId: currentUser.id, status: "active" }, orderBy: { level: "asc" } }),
    db.newsletterSubscription.count({ where: { creatorId: currentUser.id, unsubscribedAt: null } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Newsletter</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>{subscriberCount} active subscriber{subscriberCount === 1 ? "" : "s"}</p>

      {issues.length === 0 && <EmptyState message="No issues yet." />}
      {issues.map((issue) => (
        <div key={issue.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={Mail}
            label={issue.subject}
            description={issue.status}
            trailing={
              issue.status === "draft" ? (
                <>
                  <form action={sendIssue}>
                    <input type="hidden" name="issueId" value={issue.id} />
                    <button type="submit" className="button buttonSmall">Send</button>
                  </form>
                  <form action={deleteIssue}>
                    <input type="hidden" name="issueId" value={issue.id} />
                    <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
                  </form>
                </>
              ) : undefined
            }
          />
          {issue.status === "draft" && (
            <details>
              <summary className="settingsRow settingsAddTrigger">
                <span className="settingsRowIcon" aria-hidden="true">
                  <Pencil size={16} />
                </span>
                <span className="settingsRowText">
                  <span className="settingsRowLabel">Edit draft</span>
                </span>
              </summary>
              <div className="settingsAddPanelBody">
                <NewsletterIssueForm issue={issue} ownTiers={myTiers} />
              </div>
            </details>
          )}
        </div>
      ))}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Write a new issue</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <NewsletterIssueForm ownTiers={myTiers} />
        </div>
      </details>
    </div>
  );
}
