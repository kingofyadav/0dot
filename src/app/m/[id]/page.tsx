import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPostableBusinesses } from "@/lib/businesses";
import { getModeratedCommunities } from "@/lib/communities";
import { canManageListing, hasVerifiedListingAccess } from "@/lib/marketplace";
import { archiveMarketplaceListing, deleteListingReview, respondToListingReview } from "@/app/actions/marketplace";
import { MarketplacePurchaseButton } from "@/components/MarketplacePurchaseButton";
import { MarketplaceListingForm } from "@/components/MarketplaceListingForm";
import { LinkDeveloperAppForm } from "@/components/LinkDeveloperAppForm";
import { InstallAppForm, UninstallAppButton } from "./InstallAppForm";
import { ListingReviewForm } from "./ListingReviewForm";

const CATEGORY_LABELS: Record<string, string> = { theme: "Theme", template: "Template", app: "App" };
const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  active: "Active",
  rejected: "Rejected",
  archived: "Archived",
};

// spec §9 step 7's detail-page half of the browse experience — purchase
// (or free "get it") + review UI shared by all three MarketplaceListing
// categories, install UI (§4.3's installer XOR) additionally for `app`.
export default async function MarketplaceListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const listing = await db.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: { include: { username: true, profile: true } },
      sellerBusiness: { select: { name: true, slug: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { include: { username: true, profile: true } },
          response: { include: { responder: { include: { username: true, profile: true } } } },
        },
      },
    },
  });
  if (!listing) notFound();

  const currentUser = await getCurrentUser();
  const canManage = currentUser ? await canManageListing(listing, currentUser.id) : false;
  if (listing.status !== "active" && !canManage) notFound();

  const sellerName = listing.sellerBusiness?.name ?? listing.seller?.profile?.displayName ?? listing.seller?.username?.handle ?? "Unknown seller";
  const sellerHref = listing.sellerBusiness ? `/b/${listing.sellerBusiness.slug}` : listing.seller?.username ? `/${listing.seller.username.handle}` : null;

  const owns = currentUser
    ? Boolean(await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId: listing.id, buyerId: currentUser.id } } }))
    : false;

  const [businesses, communities] = currentUser
    ? await Promise.all([getPostableBusinesses(currentUser.id), getModeratedCommunities(currentUser.id)])
    : [[], []];

  const myProfile = currentUser ? await db.profile.findUnique({ where: { userId: currentUser.id }, select: { id: true } }) : null;
  const myInstalls =
    listing.category === "app"
      ? await db.installedApp.findMany({
          where: {
            listingId: listing.id,
            OR: [
              ...(myProfile ? [{ installerUserId: myProfile.id }] : []),
              ...(businesses.length > 0 ? [{ installerBusinessId: { in: businesses.map((b) => b.id) } }] : []),
              ...(communities.length > 0 ? [{ installerCommunityId: { in: communities.map((c) => c.id) } }] : []),
            ],
          },
        })
      : [];

  const canReview = currentUser ? await hasVerifiedListingAccess(listing.id, currentUser.id) : false;
  const myReview = currentUser ? listing.reviews.find((r) => r.authorId === currentUser.id) : undefined;

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(listing.payload);
  } catch {
    payload = {};
  }

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{listing.title}</h1>
          <p className="mutedText" style={{ fontSize: "0.85rem", margin: "0.15rem 0 0" }}>
            {CATEGORY_LABELS[listing.category] ?? listing.category} · by{" "}
            {sellerHref ? <Link href={sellerHref}>{sellerName}</Link> : sellerName}
          </p>
        </div>
        <Link href="/m" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to Marketplace
        </Link>
      </div>

      {listing.reviewCount > 0 && (
        <p className="mutedText" style={{ marginBottom: "0.75rem" }}>
          ★ {listing.averageRating.toFixed(1)} ({listing.reviewCount} review{listing.reviewCount === 1 ? "" : "s"}) ·{" "}
          {listing.purchaseCount} owner{listing.purchaseCount === 1 ? "" : "s"}
        </p>
      )}

      {listing.description && <p style={{ marginBottom: "1rem", whiteSpace: "pre-wrap" }}>{listing.description}</p>}

      {listing.category === "app" && typeof payload.provider === "string" && (
        <p className="mutedText" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
          Embeds {payload.provider} content from {typeof payload.embedUrl === "string" ? payload.embedUrl : "an allowlisted source"}.
        </p>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        {!currentUser ? (
          <Link href="/login" className="button buttonSmall">
            Log in to {listing.price !== null ? "buy" : "get this"}
          </Link>
        ) : owns ? (
          <p className="mutedText" style={{ fontSize: "0.85rem" }}>You own this.</p>
        ) : listing.status !== "active" ? (
          <p className="mutedText" style={{ fontSize: "0.85rem" }}>Not available.</p>
        ) : listing.category !== "app" || listing.price !== null ? (
          <MarketplacePurchaseButton listingId={listing.id} price={listing.price} currency={listing.currency} />
        ) : null}

        {currentUser && listing.status === "active" && listing.category === "app" && (owns || listing.price === null) && (
          <div style={{ marginTop: "1rem" }}>
            <p className="sectionHeading">Install</p>
            {myInstalls.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                {myInstalls.map((install) => (
                  <div key={install.id} className="profileLinkItem" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                      Installed on {install.installerUserId ? "your profile" : install.installerBusinessId ? "a business you manage" : "a community you moderate"}
                    </span>
                    <UninstallAppButton installId={install.id} />
                  </div>
                ))}
              </div>
            )}
            <InstallAppForm listingId={listing.id} businesses={businesses} communities={communities} isOAuthApp={Boolean(listing.developerAppId)} />
          </div>
        )}
      </div>

      {canManage && (
        <div style={{ marginBottom: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <p className="sectionHeading">Manage this listing</p>
          <p className="mutedText" style={{ fontSize: "0.85rem", margin: "0.2rem 0 0.6rem" }}>
            Status: {STATUS_LABELS[listing.status] ?? listing.status}
          </p>
          <details className="profileEditToggle" style={{ marginBottom: "0.6rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              Edit
            </summary>
            <div style={{ marginTop: "0.5rem" }}>
              <MarketplaceListingForm
                businesses={[]}
                existing={{
                  id: listing.id,
                  category: listing.category as "theme" | "template" | "app",
                  title: listing.title,
                  description: listing.description,
                  price: listing.price,
                  currency: listing.currency,
                  payload: listing.payload,
                }}
              />
            </div>
          </details>
          {listing.status !== "archived" && (
            <form action={archiveMarketplaceListing}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button type="submit" className="button buttonDanger buttonSmall">
                Archive
              </button>
            </form>
          )}
          {listing.category === "app" && currentUser && (
            <LinkDeveloperAppForm
              listingId={listing.id}
              apps={await db.developerApp.findMany({ where: { ownerUserId: currentUser.id, status: "active" }, select: { id: true, name: true } })}
              linkedAppName={listing.developerAppId ? (await db.developerApp.findUnique({ where: { id: listing.developerAppId }, select: { name: true } }))?.name ?? null : null}
            />
          )}
        </div>
      )}

      <div>
        <p className="sectionHeading">Reviews</p>

        {canReview && (
          <details className="profileEditToggle" style={{ margin: "0.6rem 0 1rem" }} open={Boolean(myReview)}>
            <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              {myReview ? "Edit your review" : "Write a review"}
            </summary>
            <div style={{ marginTop: "0.5rem" }}>
              <ListingReviewForm
                listingId={listing.id}
                existing={myReview ? { rating: myReview.rating, body: myReview.body } : undefined}
              />
            </div>
          </details>
        )}

        {listing.reviews.length === 0 && <p className="mutedText">No reviews yet.</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.75rem" }}>
          {listing.reviews.map((review) => {
            const authorName = review.author.profile?.displayName ?? review.author.username?.handle ?? "Unknown";
            return (
              <div key={review.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>{authorName}</strong>
                  <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                    {"★".repeat(review.rating)}
                    {"☆".repeat(5 - review.rating)}
                  </span>
                </div>
                {review.body && <p style={{ margin: "0.3rem 0" }}>{review.body}</p>}
                {currentUser?.id === review.authorId && (
                  <form action={deleteListingReview}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Delete
                    </button>
                  </form>
                )}
                {review.response ? (
                  <div style={{ marginTop: "0.5rem", marginLeft: "1rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--border)" }}>
                    <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                      Response from{" "}
                      {review.response.responder.profile?.displayName ?? review.response.responder.username?.handle ?? "the seller"}
                    </span>
                    <p style={{ margin: "0.2rem 0 0" }}>{review.response.body}</p>
                  </div>
                ) : canManage ? (
                  <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
                    <summary className="mutedText" style={{ fontSize: "0.8rem", cursor: "pointer" }}>
                      Respond
                    </summary>
                    <form
                      action={respondToListingReview}
                      style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.4rem", maxWidth: "32ch" }}
                    >
                      <input type="hidden" name="reviewId" value={review.id} />
                      <textarea name="body" maxLength={2000} rows={2} required className="textInput" />
                      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }}>
                        Post response
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
