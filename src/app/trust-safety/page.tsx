import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { fileAppealAction } from "@/app/actions/trust-safety";
import { DmcaCounterNoticeForm } from "./DmcaCounterNoticeForm";

const CASE_TYPE_LABELS: Record<string, string> = {
  content_report: "Content removed following a report",
  account_report: "Account action following a report",
  business_claim_review: "Business claim rejected",
  marketplace_listing_review: "Marketplace listing rejected",
  ai_moderation_flag: "Content removed by AI-assisted moderation",
  dmca_takedown: "Content removed following a DMCA takedown notice",
};

// phase-12 spec §5: platform-level enforcement actions taken against the
// current user, each appealable exactly once (§5.4's fairness requirement
// gets a real reviewer-differs check in reviewAppeal, trust-safety.ts).
// Deliberately excludes community_escalation — routine community
// moderation stays with each community's own governance (§5.3), not this
// page.
export default async function TrustSafetyPage() {
  const user = await requireVerifiedUser();

  const [postIds, articleIds, commentIds, businessIds, listingIds] = await Promise.all([
    db.post.findMany({ where: { authorId: user.id }, select: { id: true } }).then((r) => r.map((x) => x.id)),
    db.article.findMany({ where: { authorId: user.id }, select: { id: true } }).then((r) => r.map((x) => x.id)),
    db.comment.findMany({ where: { authorId: user.id }, select: { id: true } }).then((r) => r.map((x) => x.id)),
    db.business.findMany({ where: { createdBy: user.id }, select: { id: true } }).then((r) => r.map((x) => x.id)),
    db.marketplaceListing.findMany({ where: { sellerUserId: user.id }, select: { id: true } }).then((r) => r.map((x) => x.id)),
  ]);

  const cases = await db.trustSafetyCase.findMany({
    where: {
      status: "resolved_upheld",
      OR: [
        { subjectType: "user", subjectId: user.id },
        { subjectType: "post", subjectId: { in: postIds } },
        { subjectType: "article", subjectId: { in: articleIds } },
        { subjectType: "comment", subjectId: { in: commentIds } },
        { subjectType: "business", subjectId: { in: businessIds } },
        { subjectType: "marketplace_listing", subjectId: { in: listingIds } },
      ],
    },
    include: {
      appeals: { where: { filedById: user.id } },
      dmcaTakedownNotice: { include: { counterNotice: true } },
    },
    orderBy: { resolvedAt: "desc" },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Enforcement actions on your account</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Platform-level actions you can appeal. Each appeal is reviewed by someone other than the original
        reviewer wherever staffing allows (spec §5.2).
      </p>

      {cases.length === 0 ? (
        <p className="mutedText">No enforcement actions on file.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {cases.map((c) => {
            const appeal = c.appeals[0];
            return (
              <div key={c.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
                <div>
                  <strong>{CASE_TYPE_LABELS[c.caseType] ?? c.caseType}</strong>{" "}
                  <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                    {c.resolvedAt?.toLocaleDateString()}
                    {c.resolutionNotes ? ` · ${c.resolutionNotes}` : ""}
                  </span>
                </div>
                {c.caseType === "dmca_takedown" && c.dmcaTakedownNotice ? (
                  // phase-13 spec §4.2: DMCA's statutory remedy is a
                  // counter-notice, not the general platform Appeal — a
                  // deliberately different path for this one case type.
                  <DmcaCounterNoticeForm
                    noticeId={c.dmcaTakedownNotice.id}
                    noticeStatus={c.dmcaTakedownNotice.status}
                    counterNotice={c.dmcaTakedownNotice.counterNotice}
                  />
                ) : appeal ? (
                  <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                    Appeal {appeal.status === "pending" ? "submitted, awaiting review" : `decided: ${appeal.status.replace("_", " ")}`}
                  </p>
                ) : (
                  <form action={fileAppealAction} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: "100%", maxWidth: "48ch" }}>
                    <input type="hidden" name="caseId" value={c.id} />
                    <textarea name="statement" className="textInput" rows={3} maxLength={2000} placeholder="Why do you think this decision was wrong?" required />
                    <button type="submit" className="button buttonSecondary buttonSmall" style={{ alignSelf: "flex-start" }}>
                      File appeal
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
