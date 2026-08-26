import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { findCollidingActiveBusiness } from "@/lib/businesses";
import { businessCategoryLabel } from "@/lib/business-categories";
import { approveBusinessAction, rejectBusinessAction } from "@/app/actions/business-approval";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";

// admin+ platform role — same bar as /admin/trust-safety/appeals, since
// approving puts a business live/searchable and rejecting deletes it
// outright (see business-approval.ts). Fulfils the promise /b/[slug] makes
// a pending business's own team ("a platform admin approves it") — until
// this page existed, the only way to do that was direct DB access.
export default async function AdminBusinessesPage() {
  await requirePlatformRole("admin");

  const pending = await db.business.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { creator: { include: { username: true } }, contactInfo: true },
  });

  // Surfaces *why* each one is pending (spec §3.3's collision heuristic) —
  // the actual signal a reviewer needs to tell impersonation apart from a
  // coincidental name match, rather than a bare list with no context.
  const collisions = await Promise.all(pending.map((business) => findCollidingActiveBusiness(business.name)));

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Pending businesses</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Invisible outside their own team and unsearchable until approved here (spec §3.3). A business only lands
        here when its creator&apos;s email/website match is weak and Profile.isVerified isn&apos;t set — approving
        makes it live, rejecting deletes it (and everything attached to it) permanently.
      </p>

      {pending.length === 0 ? (
        <EmptyState message="Nothing pending." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {pending.map((business, i) => {
            const collision = collisions[i];
            const creatorLabel = business.creator.username?.handle
              ? `@${business.creator.username.handle}`
              : business.creator.email;

            return (
              <div
                key={business.id}
                className="profileLinkItem"
                style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <strong>{business.name}</strong>{" "}
                    <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                      {businessCategoryLabel(business.category)} · /b/{business.slug}
                    </span>
                  </div>
                  <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                    {creatorLabel} · {business.createdAt.toLocaleDateString()}
                  </span>
                </div>

                {business.tagline && <p style={{ fontSize: "0.9rem" }}>{business.tagline}</p>}
                {business.contactInfo?.website && (
                  <p className="mutedText" style={{ fontSize: "0.85rem" }}>{business.contactInfo.website}</p>
                )}

                {collision && (
                  <p style={{ fontSize: "0.85rem", color: "var(--danger)" }}>
                    ⚠ Name collides with existing active business{" "}
                    <Link href={`/b/${collision.slug}`} target="_blank" rel="noopener noreferrer">
                      {collision.name}
                    </Link>
                  </p>
                )}

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <form action={approveBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <button type="submit" className="button buttonSmall">
                      Approve
                    </button>
                  </form>
                  <form action={rejectBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <ConfirmButton
                      type="submit"
                      className="button buttonDanger buttonSmall"
                      title={`Reject ${business.name}?`}
                      description="This permanently deletes the business and everything attached to it — team, catalog, posts, reviews, jobs. This can't be undone."
                      confirmLabel="Reject & delete"
                    >
                      Reject
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
