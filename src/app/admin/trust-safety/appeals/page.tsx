import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { reviewAppealAction } from "@/app/actions/trust-safety";
import { EmptyState } from "@/components/EmptyState";

// phase-12 spec §5.2: admin+ platform role only (requirePlatformRole) — the
// fairness requirement that an appeal isn't reviewed by whoever made the
// original call is enforced again inside reviewAppeal (trust-safety.ts),
// not just by this page's gating.
export default async function AdminAppealsPage() {
  await requirePlatformRole("admin");

  const appeals = await db.appeal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { originalCase: true, filedBy: { include: { username: true } } },
    take: 50,
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Pending appeals</h1>
        <Link href="/admin/trust-safety" className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← Case queue
        </Link>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Reviewed by someone other than the case&apos;s original reviewer, wherever staffing allows (spec §5.2).
        Overturning re-runs the case&apos;s resolution in the opposite direction — same dispatch that applied the
        original decision, not a second parallel &quot;undo.&quot;
      </p>

      {appeals.length === 0 ? (
        <EmptyState message="Nothing pending." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {appeals.map((appeal) => (
            <div key={appeal.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <strong>{appeal.originalCase.caseType}</strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  filed by {appeal.filedBy.username?.handle ? `@${appeal.filedBy.username.handle}` : appeal.filedBy.email}
                </span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{appeal.statement}</p>
              {appeal.originalCase.resolutionNotes && (
                <p className="mutedText" style={{ fontSize: "0.85rem" }}>Original resolution: {appeal.originalCase.resolutionNotes}</p>
              )}
              <form action={reviewAppealAction} style={{ display: "flex", gap: "0.5rem" }}>
                <input type="hidden" name="appealId" value={appeal.id} />
                <button type="submit" name="decision" value="overturned" className="button buttonSmall">
                  Overturn
                </button>
                <button type="submit" name="decision" value="upheld_original" className="button buttonSecondary buttonSmall">
                  Uphold original decision
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
