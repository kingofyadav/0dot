import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { businessCategoryLabel } from "@/lib/business-categories";
import { approveBusiness, rejectBusiness } from "@/app/actions/admin-businesses";

// isPlatformAdmin-gated review queue for the launch-blocking claim gate
// (spec §3.3, build plan decision #1). Only businesses that didn't clear
// the weak-signal auto-approval in createBusiness land here.
export default async function AdminBusinessesPage() {
  await requirePlatformAdmin();

  const pendingBusinesses = await db.business.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { creator: { include: { username: true, profile: true } }, contactInfo: true },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Pending businesses</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Businesses that didn&apos;t clear the automatic claim-verification check. Approve to make them
        live and searchable, or reject to remove them.
      </p>

      {pendingBusinesses.length === 0 ? (
        <p className="mutedText">Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {pendingBusinesses.map((business) => {
            const creatorName = business.creator.profile?.displayName ?? business.creator.username?.handle ?? "Unknown";
            return (
              <div key={business.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <strong>{business.name}</strong>{" "}
                    <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                      /b/{business.slug} · {businessCategoryLabel(business.category)}
                    </span>
                    <p className="mutedText" style={{ fontSize: "0.85rem", margin: "0.2rem 0 0" }}>
                      Created by {creatorName} ({business.creator.email})
                      {business.contactInfo?.website ? ` · claims website ${business.contactInfo.website}` : ""}
                    </p>
                  </div>
                  <span style={{ display: "flex", gap: "0.5rem" }}>
                    <form action={approveBusiness}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <button type="submit" className="button buttonSmall">
                        Approve
                      </button>
                    </form>
                    <form action={rejectBusiness}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <button type="submit" className="button buttonDanger buttonSmall">
                        Reject
                      </button>
                    </form>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
