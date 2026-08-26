import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, canManageCatalog } from "@/lib/businesses";
import { closeJob } from "@/app/actions/jobs";
import { JobForm } from "./JobForm";
import { EmptyState } from "@/components/EmptyState";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

function salaryRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
  return min !== null ? `From $${min.toLocaleString()}` : `Up to $${max!.toLocaleString()}`;
}

// build plan step 7 / spec §9: a jobs tab on this business's own page, not
// a cross-business job board (§9.3 — no such board is built in Phase 4).
export default async function JobsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const canManage = currentUser ? await canManageCatalog(business.id, currentUser.id) : false;

  const jobs = await db.job.findMany({
    where: {
      businessId: business.id,
      ...(canManage ? {} : { status: "open" }),
    },
    orderBy: { postedAt: "desc" },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Jobs</h1>
        <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to business page
        </Link>
      </div>

      {canManage && (
        <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            Post a job
          </summary>
          <div style={{ marginTop: "0.6rem" }}>
            <JobForm businessId={business.id} />
          </div>
        </details>
      )}

      {jobs.length === 0 && <EmptyState message="No open positions right now." />}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {jobs.map((job) => {
          const closed = job.status === "closed" || (job.closesAt !== null && job.closesAt < new Date());
          const salary = salaryRange(job.salaryMin, job.salaryMax);
          return (
            <div key={job.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Link href={`/b/${business.slug}/jobs/${job.id}`} style={{ fontWeight: 700 }}>
                  {job.title}
                </Link>
                {canManage && (
                  <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                    {closed ? "Closed" : "Open"}
                  </span>
                )}
              </div>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {EMPLOYMENT_TYPE_LABEL[job.employmentType] ?? job.employmentType}
                {job.isRemote ? " · Remote" : job.location ? ` · ${job.location}` : ""}
                {salary ? ` · ${salary}` : ""}
              </span>
              {canManage && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.2rem" }}>
                  <Link href={`/b/${business.slug}/jobs/${job.id}/applications`} className="button buttonSecondary buttonSmall">
                    Applications
                  </Link>
                  {!closed && (
                    <form action={closeJob}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <button type="submit" className="button buttonDanger buttonSmall">
                        Close
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
