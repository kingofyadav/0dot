import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import { ApplyForm } from "./ApplyForm";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  rejected: "Not selected",
  hired: "Hired",
};

function salaryRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
  return min !== null ? `From $${min.toLocaleString()}` : `Up to $${max!.toLocaleString()}`;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ slug: string; jobId: string }>;
}) {
  const { slug: rawSlug, jobId } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const job = await db.job.findUnique({ where: { id: jobId }, include: { business: true } });
  if (!job || job.business.slug !== slug) notFound();
  const business = job.business;

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const canManage = currentUser ? await isBusinessStaff(business.id, currentUser.id) : false;
  const closed = job.status === "closed" || (job.closesAt !== null && job.closesAt < new Date());
  const salary = salaryRange(job.salaryMin, job.salaryMax);

  const myApplication = currentUser
    ? await db.jobApplication.findFirst({ where: { jobId: job.id, applicantId: currentUser.id } })
    : null;

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{job.title}</h1>
        <Link href={`/b/${business.slug}/jobs`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to jobs
        </Link>
      </div>

      <p className="mutedText" style={{ marginBottom: "0.75rem" }}>
        {business.name} · {EMPLOYMENT_TYPE_LABEL[job.employmentType] ?? job.employmentType}
        {job.isRemote ? " · Remote" : job.location ? ` · ${job.location}` : ""}
        {salary ? ` · ${salary}` : ""}
        {closed ? " · Closed" : ""}
      </p>

      <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>

      {canManage && (
        <div style={{ marginTop: "1rem" }}>
          <Link href={`/b/${business.slug}/jobs/${job.id}/applications`} className="button buttonSecondary buttonSmall">
            View applications
          </Link>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Apply</p>
        {!currentUser ? (
          <p className="mutedText">
            <Link href="/login">Log in</Link> to apply.
          </p>
        ) : myApplication ? (
          <p className="mutedText">
            You applied {"—"} status: {APPLICATION_STATUS_LABEL[myApplication.status] ?? myApplication.status}
          </p>
        ) : closed ? (
          <p className="mutedText">This job posting is closed.</p>
        ) : (
          <ApplyForm jobId={job.id} />
        )}
      </div>
    </div>
  );
}
