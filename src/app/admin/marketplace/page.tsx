import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { approveMarketplaceListing, rejectMarketplaceListing } from "@/app/actions/admin-marketplace";

const CATEGORY_LABELS: Record<string, string> = {
  theme: "Theme",
  template: "Template",
  app: "App",
};

// isPlatformAdmin-gated review queue for the launch-blocking listing gate
// (spec §4.5/§4.6). Only listings that haven't cleared review — first
// submission or a re-submission after an edit (updateMarketplaceListing
// sends an edited listing back to pending_review) — land here.
export default async function AdminMarketplacePage() {
  await requirePlatformAdmin();

  const pendingListings = await db.marketplaceListing.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    include: {
      seller: { include: { username: true, profile: true } },
      sellerBusiness: true,
    },
  });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Pending marketplace listings</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Themes, templates, and apps waiting on manual review before they can go live (spec §4.5). Approve to make
        a listing active and purchasable/installable, or reject it.
      </p>

      {pendingListings.length === 0 ? (
        <p className="mutedText">Nothing pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {pendingListings.map((listing) => {
            const sellerName = listing.sellerBusiness
              ? listing.sellerBusiness.name
              : (listing.seller?.profile?.displayName ?? listing.seller?.username?.handle ?? "Unknown");
            return (
              <div
                key={listing.id}
                className="profileLinkItem"
                style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <strong>{listing.title}</strong>{" "}
                    <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                      {CATEGORY_LABELS[listing.category] ?? listing.category}
                      {listing.price !== null ? ` · ${listing.currency} ${listing.price.toFixed(2)}` : " · free"}
                    </span>
                    <p className="mutedText" style={{ fontSize: "0.85rem", margin: "0.2rem 0 0" }}>
                      Seller: {sellerName}
                    </p>
                    {listing.description ? (
                      <p style={{ fontSize: "0.9rem", margin: "0.4rem 0 0", whiteSpace: "pre-wrap" }}>
                        {listing.description.slice(0, 400)}
                        {listing.description.length > 400 ? "…" : ""}
                      </p>
                    ) : null}
                    <pre
                      className="mutedText"
                      style={{ fontSize: "0.8rem", margin: "0.4rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {listing.payload}
                    </pre>
                  </div>
                  <span style={{ display: "flex", gap: "0.5rem" }}>
                    <form action={approveMarketplaceListing}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <button type="submit" className="button buttonSmall">
                        Approve
                      </button>
                    </form>
                    <form action={rejectMarketplaceListing}>
                      <input type="hidden" name="listingId" value={listing.id} />
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
