import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import { JsonLd } from "@/components/JsonLd";
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

// schema.org/Google's JobPosting enum, not this app's own employmentType
// values — see https://developers.google.com/search/docs/appearance/structured-data/job-posting.
const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

// The single highest-ROI item in the whole SEO plan (Phase 3) — Google for
// Jobs is a dedicated, high-intent traffic surface that only shows postings
// carrying this exact schema. "$" is hardcoded here the same way
// salaryRange above already hardcodes it for display — this app has no
// stored currency field on Job, so USD matches the existing (if imperfect)
// assumption rather than inventing a new one. validThrough is only set when
// job.closesAt actually exists — Google recommends it, but a fabricated
// expiry date to satisfy that recommendation would be actively wrong.
function jobPostingJsonLd(job: {
  title: string;
  description: string;
  postedAt: Date;
  closesAt: Date | null;
  employmentType: string;
  isRemote: boolean;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}, business: { name: string; slug: string; logoUrl: string | null }) {
  const salary = job.salaryMin !== null || job.salaryMax !== null;
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.postedAt.toISOString(),
    ...(job.closesAt ? { validThrough: job.closesAt.toISOString() } : {}),
    employmentType: EMPLOYMENT_TYPE_SCHEMA[job.employmentType] ?? "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: business.name,
      sameAs: `https://0dot.in/b/${business.slug}`,
      ...(business.logoUrl ? { logo: business.logoUrl } : {}),
    },
    ...(job.isRemote
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirement: { "@type": "Country", name: "Anywhere" } }
      : job.location
        ? { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } } }
        : {}),
    ...(salary
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: {
              "@type": "QuantitativeValue",
              ...(job.salaryMin !== null && job.salaryMax !== null
                ? { minValue: job.salaryMin, maxValue: job.salaryMax }
                : { value: job.salaryMin ?? job.salaryMax }),
              unitText: "YEAR",
            },
          },
        }
      : {}),
  };
}

// A "pending" business's jobs 404 for everyone but its own team (matching
// the page component's own gate below) — same "no description leak to a
// scraper that never reaches the page" posture as the business page's own
// generateMetadata.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  const job = await db.job.findUnique({ where: { id: jobId }, include: { business: { select: { name: true, status: true } } } });
  if (!job || job.business.status === "pending") return {};

  const title = `${job.title} at ${job.business.name}`;
  const description = job.description;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
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
      {/* Only for an open posting — Google's own guidance is not to mark up
          expired/filled positions as active JobPostings. */}
      {!closed && <JsonLd data={jobPostingJsonLd(job, business)} />}
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
