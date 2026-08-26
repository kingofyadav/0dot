import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBusinessStaff } from "@/lib/businesses";
import { updateApplicationStatus } from "@/app/actions/jobs";
import { EmptyState } from "@/components/EmptyState";

const STATUS_OPTIONS = ["submitted", "reviewed", "rejected", "hired"];
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  rejected: "Not selected",
  hired: "Hired",
};

// admin+-tier only (spec §15.2: "resumeUrl/coverNote... visible only to
// admin+ team members and the applicant themself") — the applicant's own
// view of their status lives on the job detail page instead, not here.
export default async function JobApplicationsPage({
  params,
}: {
  params: Promise<{ slug: string; jobId: string }>;
}) {
  const { slug: rawSlug, jobId } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const job = await db.job.findUnique({ where: { id: jobId }, include: { business: true } });
  if (!job || job.business.slug !== slug) notFound();
  const business = job.business;

  if (!(await isBusinessStaff(business.id, currentUser.id))) {
    redirect(`/b/${business.slug}/jobs/${job.id}`);
  }

  const applications = await db.jobApplication.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { applicant: { include: { username: true, profile: true } } },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Applications — {job.title}</h1>
        <Link href={`/b/${business.slug}/jobs/${job.id}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to job
        </Link>
      </div>

      {applications.length === 0 && <EmptyState message="No applications yet." />}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {applications.map((application) => {
          const applicantName = application.applicant.profile?.displayName ?? application.applicant.username?.handle ?? "Unknown";
          return (
            <div key={application.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{applicantName}</strong>
                <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                  {STATUS_LABEL[application.status] ?? application.status}
                </span>
              </div>
              {application.coverNote && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{application.coverNote}</p>}
              {application.resumeUrl && (
                <a href={application.resumeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem" }}>
                  View resume
                </a>
              )}
              <form action={updateApplicationStatus} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input type="hidden" name="applicationId" value={application.id} />
                <select name="status" defaultValue={application.status} className="textInput" style={{ width: "auto" }}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="button buttonSecondary buttonSmall">
                  Update status
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
