import "server-only";
import { db } from "@/lib/db";
import { notifyJobAlertMatch } from "@/lib/notifications";

type JobAlertFilter = {
  location?: string;
  remote?: boolean;
  employmentType?: string;
  keywords?: string;
};

function jobMatchesFilter(
  job: { title: string; description: string; location: string | null; isRemote: boolean; employmentType: string },
  filter: JobAlertFilter
): boolean {
  if (filter.remote && !job.isRemote) return false;
  if (filter.employmentType && filter.employmentType !== job.employmentType) return false;
  if (filter.location && !(job.location ?? "").toLowerCase().includes(filter.location.toLowerCase())) return false;
  if (filter.keywords) {
    const haystack = `${job.title} ${job.description}`.toLowerCase();
    if (!filter.keywords
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => haystack.includes(word))) {
      return false;
    }
  }
  return true;
}

// phase-16 spec §4: called once, right after a Job is created
// (src/app/actions/jobs.ts's createJob) — notifies every JobAlert owner
// whose saved search matches, without requiring them to re-search manually
// (§4.1's acceptance criterion).
export async function notifyMatchingJobAlerts(job: {
  id: string;
  title: string;
  description: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  businessSlug: string;
}): Promise<void> {
  const alerts = await db.jobAlert.findMany({ select: { userId: true, filterCriteria: true } });

  await Promise.all(
    alerts
      .filter((alert) => jobMatchesFilter(job, JSON.parse(alert.filterCriteria) as JobAlertFilter))
      .map((alert) => notifyJobAlertMatch({ recipientId: alert.userId, businessSlug: job.businessSlug, jobId: job.id }))
  );
}
