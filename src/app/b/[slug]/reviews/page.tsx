import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import { deleteReview, respondToReview } from "@/app/actions/reviews";
import { ReviewForm } from "./ReviewForm";

// build plan step 6 / spec §11: attributed reviews (author_id public, §15.2),
// one per (business, author) enforced by the schema's own unique constraint
// — ReviewForm upserts against it. A business can respond once per review
// but never delete/hide one (§11.2's literal acceptance criteria).
export default async function ReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const canRespond = currentUser ? await isBusinessStaff(business.id, currentUser.id) : false;

  const reviews = await db.review.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    include: {
      author: { include: { username: true, profile: true } },
      response: { include: { responder: { include: { username: true, profile: true } } } },
    },
  });

  const myReview = currentUser ? reviews.find((r) => r.authorId === currentUser.id) : undefined;

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Reviews</h1>
        <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to business page
        </Link>
      </div>

      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        {business.reviewCount > 0
          ? `${business.averageRating.toFixed(1)} average · ${business.reviewCount} review${business.reviewCount === 1 ? "" : "s"}`
          : "No reviews yet."}
      </p>

      {currentUser && (
        <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }} open={Boolean(myReview)}>
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            {myReview ? "Edit your review" : "Write a review"}
          </summary>
          <div style={{ marginTop: "0.6rem" }}>
            <ReviewForm
              businessId={business.id}
              existing={myReview ? { rating: myReview.rating, body: myReview.body } : undefined}
            />
          </div>
        </details>
      )}

      {reviews.length === 0 && <EmptyState message="Nothing here yet." />}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {reviews.map((review) => {
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
                <form action={deleteReview}>
                  <input type="hidden" name="reviewId" value={review.id} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Delete
                  </button>
                </form>
              )}
              {review.response ? (
                <div
                  style={{
                    marginTop: "0.5rem",
                    marginLeft: "1rem",
                    paddingLeft: "0.75rem",
                    borderLeft: "2px solid var(--border)",
                  }}
                >
                  <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                    Response from{" "}
                    {review.response.responder.profile?.displayName ?? review.response.responder.username?.handle ?? "the business"}
                  </span>
                  <p style={{ margin: "0.2rem 0 0" }}>{review.response.body}</p>
                </div>
              ) : canRespond ? (
                <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
                  <summary className="mutedText" style={{ fontSize: "0.8rem", cursor: "pointer" }}>
                    Respond
                  </summary>
                  <form
                    action={respondToReview}
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
  );
}
