"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isBusinessStaff } from "@/lib/businesses";
import { notifyBusinessReview } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

function checkReviewRateLimit(userId: string): boolean {
  return checkRateLimit(`review:${userId}`, { max: 5, windowMs: 15 * 60 * 1000 });
}

// spec §11.1: recomputes Business.averageRating/reviewCount from the
// underlying Review rows in the same transaction as the write that changed
// them — the literal §11.2 acceptance criterion ("stay consistent...
// verified transactionally"), same denormalization pattern as
// Profile.followerCount/Community.memberCount, just an aggregate instead of
// an increment/decrement since editing a review changes the average.
async function recomputeReviewAggregates(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { businessId },
    _avg: { rating: true },
    _count: true,
  });
  await tx.business.update({
    where: { id: businessId },
    data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
  });
}

// spec §11.1/§11.2: one review per (businessId, authorId) — upsert on that
// unique constraint covers both create and edit in one action, "editable,
// not stackable." Rating 1-5 integer, body optional up to 2000 chars.
export async function createOrUpdateReview(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
  if (!business) return { error: "Business not found." };

  if (!checkReviewRateLimit(user.id)) {
    return { error: "You're submitting reviews too fast. Please slow down." };
  }

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1-5." };
  if (body.length > 2000) return { error: "Review must be 2000 characters or fewer." };

  const isNewReview = !(await db.review.findUnique({
    where: { businessId_authorId: { businessId: business.id, authorId: user.id } },
    select: { businessId: true },
  }));

  await db.$transaction(async (tx) => {
    await tx.review.upsert({
      where: { businessId_authorId: { businessId: business.id, authorId: user.id } },
      create: { businessId: business.id, authorId: user.id, rating, body },
      update: { rating, body },
    });
    await recomputeReviewAggregates(tx, business.id);
  });

  if (isNewReview) {
    const staff = await db.businessMember.findMany({
      where: { businessId: business.id, role: { in: ["owner", "admin"] } },
      select: { userId: true },
    });
    await Promise.all(
      staff.map((m) => notifyBusinessReview({ recipientId: m.userId, actorId: user.id, businessSlug: business.slug }))
    );
  }

  revalidatePath(`/b/${business.slug}/reviews`);
  return undefined;
}

// author-only per spec §11.2 ("a business cannot delete or hide another
// user's review; only the review's own author can delete it").
export async function deleteReview(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const reviewId = String(formData.get("reviewId") ?? "");
  if (!reviewId) return;

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!review || review.authorId !== user.id) return;

  await db.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    await recomputeReviewAggregates(tx, review.business.id);
  });

  revalidatePath(`/b/${review.business.slug}/reviews`);
}

// admin+-tier per spec §11.1 ("must be a BusinessMember with admin+ role").
// One response per review is enforced by ReviewResponse.reviewId being the
// model's own @id, not re-checked here — a second call just overwrites via
// upsert, matching "editable, not stackable" for the response side too.
export async function respondToReview(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const reviewId = String(formData.get("reviewId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!reviewId || body.length < 1 || body.length > 2000) return;

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!review) return;
  if (!(await isBusinessStaff(review.business.id, user.id))) return;

  await db.reviewResponse.upsert({
    where: { reviewId },
    create: { reviewId, responderId: user.id, body },
    update: { body },
  });

  revalidatePath(`/b/${review.business.slug}/reviews`);
}
