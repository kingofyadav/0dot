import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { sendIssue, deleteIssue } from "@/app/actions/newsletter";
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
      <p className="mutedText">{subscriberCount} active subscriber{subscriberCount === 1 ? "" : "s"}</p>

      {issues.length === 0 && <p className="mutedText">No issues yet.</p>}
      {issues.map((issue) => (
        <div key={issue.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{issue.subject}</strong> <span className="mutedText">· {issue.status}</span>
            </span>
            {issue.status === "draft" && (
              <span style={{ display: "flex", gap: "0.35rem" }}>
                <form action={sendIssue}>
                  <input type="hidden" name="issueId" value={issue.id} />
                  <button type="submit" className="button buttonSmall">Send</button>
                </form>
                <form action={deleteIssue}>
                  <input type="hidden" name="issueId" value={issue.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
                </form>
              </span>
            )}
          </div>
          {issue.status === "draft" && (
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit draft</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <NewsletterIssueForm issue={issue} ownTiers={myTiers} />
              </div>
            </details>
          )}
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Write a new issue</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <NewsletterIssueForm ownTiers={myTiers} />
        </div>
      </details>
    </div>
  );
}
