import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { resolveCaseAction } from "@/app/actions/trust-safety";

const CASE_TYPE_LABELS: Record<string, string> = {
  content_report: "Content report",
  account_report: "Account report",
  business_claim_review: "Business claim",
  marketplace_listing_review: "Marketplace listing",
  oauth_scope_review: "OAuth scope",
  ai_moderation_flag: "AI moderation flag",
  community_escalation: "Community escalation",
  review_dispute: "Review dispute",
  dmca_takedown: "DMCA takedown notice",
};

// phase-12 spec §11 step 3: the one staff-facing queue replacing the five
// bespoke admin pages this phase retired (admin/businesses,
// admin/marketplace, admin/developer-scopes, admin/ai-moderation) — every
// case_type lands here, resolved through the single resolveCaseAction
// (trust-safety.ts), which dispatches back to each subject's own status
// field (§3.1) rather than this page touching those tables directly.
async function fetchSubjectPreview(subjectType: string, subjectId: string): Promise<string> {
  if (subjectType === "post") {
    const row = await db.post.findUnique({ where: { id: subjectId }, select: { body: true } });
    return row?.body ?? "(content no longer available)";
  }
  if (subjectType === "article") {
    const row = await db.article.findUnique({ where: { id: subjectId }, select: { title: true, body: true } });
    return row ? `${row.title}\n${row.body}` : "(content no longer available)";
  }
  if (subjectType === "comment") {
    const row = await db.comment.findUnique({ where: { id: subjectId }, select: { body: true } });
    return row?.body ?? "(content no longer available)";
  }
  if (subjectType === "business") {
    const row = await db.business.findUnique({ where: { id: subjectId }, select: { name: true, slug: true, description: true } });
    return row ? `${row.name} (/b/${row.slug})\n${row.description}` : "(business no longer available)";
  }
  if (subjectType === "marketplace_listing") {
    const row = await db.marketplaceListing.findUnique({ where: { id: subjectId }, select: { title: true, description: true, payload: true } });
    return row ? `${row.title}\n${row.description}\n${row.payload}` : "(listing no longer available)";
  }
  if (subjectType === "developer_app_scope") {
    const [appId, scopeKey] = subjectId.split(":");
    const row = await db.developerAppScope.findUnique({ where: { appId_scopeKey: { appId, scopeKey } }, include: { app: true, scope: true } });
    return row ? `${row.app.name} requests ${row.scopeKey} — ${row.scope.description}` : "(scope request no longer available)";
  }
  if (subjectType === "user") {
    const row = await db.user.findUnique({ where: { id: subjectId }, select: { email: true, username: true } });
    return row ? `${row.username?.handle ? `@${row.username.handle}` : "(no handle)"} · ${row.email}` : "(user no longer available)";
  }
  return "(no preview available for this content type)";
}

export default async function AdminTrustSafetyPage() {
  await requirePlatformRole("support");

  const cases = await db.trustSafetyCase.findMany({
    where: { status: { in: ["open", "in_review", "escalated"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { reports: true, dmcaTakedownNotice: true },
  });

  const withPreviews = await Promise.all(
    cases.map(async (c) => ({ case: c, preview: await fetchSubjectPreview(c.subjectType, c.subjectId) }))
  );

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Trust &amp; Safety queue</h1>
        <span style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/admin/trust-safety/appeals" className="mutedText" style={{ fontSize: "0.85rem" }}>
            Appeals →
          </Link>
          <Link href="/admin/trust-safety/transparency" className="mutedText" style={{ fontSize: "0.85rem" }}>
            Transparency report →
          </Link>
        </span>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Every review gate in one place (spec §3.1) — business claims, marketplace listings, sensitive OAuth
        scopes, AI moderation flags, community escalations, and user-filed reports. Resolving a case updates the
        underlying entity&apos;s own status field; it never rewrites that table&apos;s schema.
      </p>

      {withPreviews.length === 0 ? (
        <p className="mutedText">Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {withPreviews.map(({ case: c, preview }) => (
            <div key={c.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <strong>{CASE_TYPE_LABELS[c.caseType] ?? c.caseType}</strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {c.subjectType} · {c.reports.length > 0 ? `${c.reports.length} report(s)` : "system-initiated"}
                  {c.reason ? ` · ${c.reason}` : ""}
                </span>
              </div>
              <p className="mutedText" style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                {preview.length > 400 ? `${preview.slice(0, 400)}…` : preview}
              </p>
              {c.dmcaTakedownNotice ? (
                // phase-13 spec §10.1: complainant identity is visible to
                // staff here same as always — the §4.2 anonymity exception
                // only concerns disclosure to the counter-notifying party.
                <p style={{ fontSize: "0.85rem", margin: 0 }}>
                  Complainant: {c.dmcaTakedownNotice.complainantName} ({c.dmcaTakedownNotice.complainantContact}) ·{" "}
                  {c.dmcaTakedownNotice.copyrightedWorkDescription}
                </p>
              ) : null}
              {c.reports.some((r) => r.details) ? (
                <p style={{ fontSize: "0.85rem", margin: 0 }}>
                  {c.reports
                    .filter((r) => r.details)
                    .map((r) => `[${r.category}] ${r.details}`)
                    .join(" · ")}
                </p>
              ) : null}
              <form action={resolveCaseAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="caseId" value={c.id} />
                <input
                  type="text"
                  name="notes"
                  placeholder="Resolution notes (optional)"
                  className="textInput"
                  style={{ fontSize: "0.85rem", padding: "0.35rem 0.5rem" }}
                />
                <button type="submit" name="decision" value="upheld" className="button buttonDanger buttonSmall">
                  Uphold
                </button>
                <button type="submit" name="decision" value="dismissed" className="button buttonSecondary buttonSmall">
                  Dismiss
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
