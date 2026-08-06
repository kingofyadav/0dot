import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteJobAlert } from "@/app/actions/job-alerts";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { JobAlertForm } from "./JobAlertForm";

type JobAlertFilter = { location?: string; remote?: boolean; employmentType?: string; keywords?: string };

function describeFilter(filter: JobAlertFilter): string {
  const parts: string[] = [];
  if (filter.keywords) parts.push(`"${filter.keywords}"`);
  if (filter.location) parts.push(filter.location);
  if (filter.employmentType) parts.push(filter.employmentType.replace("_", " "));
  if (filter.remote) parts.push("remote");
  return parts.length > 0 ? parts.join(" · ") : "Any job";
}

export default async function JobAlertsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const alerts = await db.jobAlert.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Job alerts</h1>
        <Link href="/jobs" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to jobs
        </Link>
      </div>

      <JobAlertForm />

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {alerts.length === 0 && <EmptyState message="No saved job alerts yet." />}
        {alerts.map((alert) => (
          <div key={alert.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}>
            <span>{describeFilter(JSON.parse(alert.filterCriteria))}</span>
            <form action={deleteJobAlert}>
              <input type="hidden" name="alertId" value={alert.id} />
              <ConfirmButton
                className="button buttonSecondary iconButton"
                aria-label="Delete job alert"
                title="Delete this job alert?"
                description="You'll stop getting notified about matching job postings."
                confirmLabel="Delete"
              >
                ×
              </ConfirmButton>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
