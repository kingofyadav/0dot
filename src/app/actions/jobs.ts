"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { canManageCatalog, isBusinessStaff } from "@/lib/businesses";
import { notifyJobApplication, notifyApplicationStatusChange } from "@/lib/notifications";
import { notifyMatchingJobAlerts } from "@/lib/job-alerts";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveMessageAttachment } from "@/lib/uploads";
import type { ActionState } from "@/app/actions/auth";

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship"]);
const APPLICATION_STATUSES = new Set(["submitted", "reviewed", "rejected", "hired"]);

function checkApplicationRateLimit(userId: string): boolean {
  return checkRateLimit(`job-application:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
}

// canManageCatalog-tier (owner|admin|editor) per spec §4.1's role table —
// same tier that manages the catalog/posts.
export async function createJob(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
  if (!business) return { error: "Business not found." };
  if (!(await canManageCatalog(business.id, user.id))) {
    return { error: "You don't have permission to post jobs for this business." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };
  if (description.length < 1 || description.length > 5000) return { error: "Description must be 1-5000 characters." };

  const employmentType = String(formData.get("employmentType") ?? "");
  if (!EMPLOYMENT_TYPES.has(employmentType)) return { error: "Choose an employment type." };

  const location = String(formData.get("location") ?? "").trim() || null;
  const isRemote = formData.get("isRemote") === "true";

  const salaryMinRaw = String(formData.get("salaryMin") ?? "").trim();
  const salaryMaxRaw = String(formData.get("salaryMax") ?? "").trim();
  const salaryMin = salaryMinRaw ? Number(salaryMinRaw) : null;
  const salaryMax = salaryMaxRaw ? Number(salaryMaxRaw) : null;
  if (salaryMin !== null && !Number.isFinite(salaryMin)) return { error: "Salary min must be a number." };
  if (salaryMax !== null && !Number.isFinite(salaryMax)) return { error: "Salary max must be a number." };
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    return { error: "Salary min can't be greater than salary max." };
  }

  const closesAtRaw = String(formData.get("closesAt") ?? "").trim();
  const closesAt = closesAtRaw ? new Date(closesAtRaw) : null;
  if (closesAt && Number.isNaN(closesAt.getTime())) return { error: "Invalid close date." };

  const job = await db.job.create({
    data: {
      businessId: business.id,
      title,
      description,
      location,
      isRemote,
      employmentType,
      salaryMin,
      salaryMax,
      closesAt,
    },
  });

  await notifyMatchingJobAlerts({ ...job, businessSlug: business.slug });

  revalidatePath(`/b/${business.slug}/jobs`);
  redirect(`/b/${business.slug}/jobs`);
}

export async function closeJob(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;

  const job = await db.job.findUnique({ where: { id: jobId }, include: { business: { select: { id: true, slug: true } } } });
  if (!job) return;
  if (!(await canManageCatalog(job.business.id, user.id))) return;

  await db.job.update({ where: { id: jobId }, data: { status: "closed" } });
  revalidatePath(`/b/${job.business.slug}/jobs`);
  revalidatePath(`/b/${job.business.slug}/jobs/${jobId}`);
}

// spec §9.4: a closed job (status = closed OR past closes_at) rejects new
// applications server-side, not just a hidden button — checked here
// regardless of what the UI already hid.
export async function applyToJob(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const jobId = String(formData.get("jobId") ?? "");

  const job = await db.job.findUnique({ where: { id: jobId }, include: { business: { select: { id: true, slug: true } } } });
  if (!job) return { error: "Job not found." };
  if (job.status === "closed" || (job.closesAt && job.closesAt < new Date())) {
    return { error: "This job posting is closed." };
  }

  if (!checkApplicationRateLimit(user.id)) {
    return { error: "You're applying too fast. Please slow down." };
  }

  const coverNote = String(formData.get("coverNote") ?? "").trim();
  if (coverNote.length > 3000) return { error: "Cover note must be 3000 characters or fewer." };

  let resumeUrl: string | null = null;
  const resumeFile = formData.get("resume");
  if (resumeFile instanceof File && resumeFile.size > 0) {
    const result = await saveMessageAttachment(resumeFile, "file", user.id);
    if ("error" in result) return { error: result.error };
    resumeUrl = result.url;
  }

  await db.jobApplication.create({
    data: { jobId: job.id, applicantId: user.id, coverNote, resumeUrl },
  });

  const staff = await db.businessMember.findMany({
    where: { businessId: job.business.id, role: { in: ["owner", "admin"] } },
    select: { userId: true },
  });
  await Promise.all(
    staff.map((m) =>
      notifyJobApplication({ recipientId: m.userId, actorId: user.id, businessSlug: job.business.slug, jobId: job.id })
    )
  );

  revalidatePath(`/b/${job.business.slug}/jobs/${job.id}`);
  return undefined;
}

// admin+-tier only per spec §15.2. Notifies the applicant on any status
// change (spec §9.2).
export async function updateApplicationStatus(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!applicationId || !APPLICATION_STATUSES.has(status)) return;

  const application = await db.jobApplication.findUnique({
    where: { id: applicationId },
    include: { job: { include: { business: { select: { id: true, slug: true } } } } },
  });
  if (!application) return;
  if (!(await isBusinessStaff(application.job.business.id, user.id))) return;

  await db.jobApplication.update({ where: { id: applicationId }, data: { status } });

  await notifyApplicationStatusChange({
    recipientId: application.applicantId,
    actorId: user.id,
    businessSlug: application.job.business.slug,
    jobId: application.job.id,
  });

  revalidatePath(`/b/${application.job.business.slug}/jobs/${application.job.id}/applications`);
}
