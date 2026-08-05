"use server";

import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { createTrustSafetyCase } from "@/lib/trust-safety";
import { REPORT_CATEGORIES } from "@/lib/report-categories";

const CATEGORY_SET = new Set<string>(REPORT_CATEGORIES);

// phase-12 spec §4.1: the one generic report action every reportable
// subjectType uses — no content type gets its own bespoke reporting
// mechanism (§4.3 acceptance criterion). Filing a Report always creates
// exactly one TrustSafetyCase (§4.3), with case_type chosen by whether the
// subject is an account or a piece of content/listing — Report.category
// (which can be ip_infringement, spam, etc.) is orthogonal to that (§7:
// ip_infringement is a category, not its own case_type, since the
// statutory DMCA workflow is Phase 13's scope).
export async function fileReport(params: {
  subjectType: string;
  subjectId: string;
  category: string;
  details?: string;
}): Promise<{ error?: string }> {
  const user = await requireVerifiedUser();

  if (!CATEGORY_SET.has(params.category)) return { error: "Choose a valid report category." };
  const details = (params.details ?? "").trim();
  if (details.length > 2000) return { error: "Details must be 2000 characters or fewer." };
  if (!params.subjectType || !params.subjectId) return { error: "Nothing to report." };

  const trustSafetyCase = await createTrustSafetyCase({
    caseType: params.subjectType === "user" ? "account_report" : "content_report",
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    reportedById: user.id,
    reason: params.category,
  });

  await db.report.create({
    data: {
      reporterId: user.id,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      category: params.category,
      details,
      caseId: trustSafetyCase.id,
    },
  });

  return {};
}
