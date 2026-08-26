import Link from "next/link";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
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

// phase-16 spec §4: a cross-business search/browse surface querying
// Phase 4's existing Job rows across every business — no new
// Job-equivalent table, same query-time-union principle as this doc's
// other aggregation modules.
export default async function JobsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; remote?: string; employmentType?: string; q?: string }>;
}) {
  const params = await searchParams;

  const where: Prisma.JobWhereInput = {
    status: "open",
    business: { status: "active" },
    ...(params.remote === "true" ? { isRemote: true } : {}),
    ...(params.employmentType ? { employmentType: params.employmentType } : {}),
    ...(params.location ? { location: { contains: params.location } } : {}),
    ...(params.q ? { OR: [{ title: { contains: params.q } }, { description: { contains: params.q } }] } : {}),
  };

  const jobs = await db.job.findMany({
    where,
    include: { business: { select: { slug: true, name: true, logoUrl: true } } },
    orderBy: { postedAt: "desc" },
    take: 50,
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Jobs</h1>
        <Link href="/jobs/alerts" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Job alerts
        </Link>
      </div>

      <form style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <input name="q" placeholder="Keywords" defaultValue={params.q} className="textInput" style={{ flex: "2 1 160px" }} />
        <input name="location" placeholder="Location" defaultValue={params.location} className="textInput" style={{ flex: "1 1 140px" }} />
        <select name="employmentType" defaultValue={params.employmentType ?? ""} className="textInput" style={{ flex: "1 1 140px" }}>
          <option value="">Any type</option>
          {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input type="checkbox" name="remote" value="true" defaultChecked={params.remote === "true"} />
          Remote only
        </label>
        <button type="submit" className="button">Search</button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {jobs.length === 0 && <EmptyState message="No open jobs match your search." />}
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/b/${job.business.slug}/jobs/${job.id}`}
            style={{ display: "block", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem 1rem" }}
          >
            <strong>{job.title}</strong>
            <span className="mutedText"> at {job.business.name}</span>
            <p className="mutedText" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
              {EMPLOYMENT_TYPE_LABEL[job.employmentType]}
              {job.isRemote && " · Remote"}
              {job.location && ` · ${job.location}`}
              {salaryRange(job.salaryMin, job.salaryMax) && ` · ${salaryRange(job.salaryMin, job.salaryMax)}`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
