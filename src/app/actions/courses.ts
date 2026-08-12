"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveProtectedFile, issueDownloadToken } from "@/lib/protected-storage";
import { getPaymentProcessor, recordPaymentTransaction, resolveFeeRate } from "@/lib/payments";
import { getAppOrigin } from "@/lib/email";
import { hasCourseAccess } from "@/lib/course-access";
import { checkCourseCompletion } from "@/lib/learning-completion";
import { getAttributedAffiliateLink, creditAffiliateConversion } from "@/lib/affiliate";
import { notifyAffiliateConversion } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const STATUS_VALUES = new Set(["draft", "active", "archived"]);

// Same convention as tips.ts's checkTipRateLimit for this class of action.
function checkPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`course-purchase:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}
const CONTENT_TYPE_VALUES = new Set(["video", "text", "download"]);

type CourseFields = {
  title: string;
  description: string;
  price: number | null;
  currency: string | null;
  requiredTierId: string | null;
  status: string;
};

// spec §11.1: purchasable directly, tier-bundled, or both — but not
// neither, or the course would be unreachable by anyone.
async function parseAndValidateCourseFields(formData: FormData, creatorId: string): Promise<{ error: string } | CourseFields> {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const priceRaw = String(formData.get("price") ?? "").trim();
  let price: number | null = null;
  let currency: string | null = null;
  if (priceRaw) {
    price = Number(priceRaw);
    if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive number." };
    currency = String(formData.get("currency") ?? "usd").trim().toLowerCase() || "usd";
  }

  const requiredTierIdRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
  let requiredTierId: string | null = null;
  if (requiredTierIdRaw) {
    const tier = await db.membershipTier.findUnique({ where: { id: requiredTierIdRaw }, select: { creatorId: true } });
    if (!tier || tier.creatorId !== creatorId) return { error: "Choose one of your own membership tiers." };
    requiredTierId = requiredTierIdRaw;
  }

  if (price === null && requiredTierId === null) {
    return { error: "Set a price, bundle it into a membership tier, or both — a course needs at least one." };
  }

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "draft";

  return { title, description, price, currency, requiredTierId, status };
}

export async function createCourse(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const fields = await parseAndValidateCourseFields(formData, user.id);
  if ("error" in fields) return fields;

  await db.course.create({ data: { creatorId: user.id, ...fields } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function updateCourse(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const courseId = String(formData.get("courseId") ?? "");

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Course not found." };
  if (course.creatorId !== user.id) return { error: "You don't have permission to manage this course." };

  const fields = await parseAndValidateCourseFields(formData, user.id);
  if ("error" in fields) return fields;

  await db.course.update({ where: { id: course.id }, data: fields });

  if (user.username) {
    revalidatePath(`/s/${user.username.handle}`);
    revalidatePath(`/s/${user.username.handle}/courses/${course.id}`);
  }
  return undefined;
}

export async function archiveCourse(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return;

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.creatorId !== user.id) return;

  await db.course.update({ where: { id: course.id }, data: { status: "archived" } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

async function requireOwnedCourse(courseId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.creatorId !== userId) return null;
  return course;
}

export async function createModule(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const courseId = String(formData.get("courseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const course = await requireOwnedCourse(courseId, user.id);
  if (!course) return { error: "You don't have permission to manage this course." };

  const moduleCount = await db.courseModule.count({ where: { courseId } });
  await db.courseModule.create({ data: { courseId, title, position: moduleCount } });

  if (user.username) revalidatePath(`/s/${user.username.handle}/courses/${courseId}`);
  return undefined;
}

export async function deleteModule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const moduleId = String(formData.get("moduleId") ?? "");
  if (!moduleId) return;

  const courseModule = await db.courseModule.findUnique({ where: { id: moduleId }, include: { course: true } });
  if (!courseModule || courseModule.course.creatorId !== user.id) return;

  await db.courseModule.delete({ where: { id: moduleId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}/courses/${courseModule.courseId}`);
}

export async function createLesson(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const moduleId = String(formData.get("moduleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const contentType = String(formData.get("contentType") ?? "");
  if (!CONTENT_TYPE_VALUES.has(contentType)) return { error: "Choose a content type." };

  const courseModule = await db.courseModule.findUnique({ where: { id: moduleId }, include: { course: true } });
  if (!courseModule || courseModule.course.creatorId !== user.id) {
    return { error: "You don't have permission to manage this course." };
  }

  let body: string | null = null;
  let fileKey: string | null = null;
  let fileMimeType: string | null = null;
  let fileSizeBytes: number | null = null;

  if (contentType === "text") {
    body = String(formData.get("body") ?? "").trim();
    if (body.length < 1 || body.length > 20000) return { error: "Lesson text must be 1-20000 characters." };
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file for this lesson." };
    const saved = await saveProtectedFile(file, { maxBytes: MAX_FILE_BYTES });
    if ("error" in saved) return saved;
    fileKey = saved.key;
    fileMimeType = saved.mimeType;
    fileSizeBytes = saved.sizeBytes;
  }

  const lessonCount = await db.lesson.count({ where: { moduleId } });
  await db.lesson.create({
    data: { moduleId, title, position: lessonCount, contentType, body, fileKey, fileMimeType, fileSizeBytes },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}/courses/${courseModule.courseId}`);
  return undefined;
}

export async function deleteLesson(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) return;

  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: { include: { course: true } } } });
  if (!lesson || lesson.module.course.creatorId !== user.id) return;

  await db.lesson.delete({ where: { id: lessonId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}/courses/${lesson.module.courseId}`);
}

// spec §11.1: mirrors purchaseProduct's shape (charge → ledger row +
// access-grant row in one transaction, kind: course_purchase). Only
// reachable when the course has a standalone price — a tier-only course
// has nothing to "buy" directly, matching parseAndValidateCourseFields'
// own requirement that at least one access path exists.
export async function purchaseCourse(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const courseId = String(formData.get("courseId") ?? "");

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "active") return { error: "This course isn't available." };
  if (course.price === null || course.currency === null) return { error: "This course isn't available for direct purchase." };
  if (course.creatorId === user.id) return { error: "You can't buy your own course." };

  const existing = await db.courseAccessGrant.findUnique({ where: { courseId_userId: { courseId, userId: user.id } } });
  if (existing) return { error: "You already have access to this course." };

  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: course.creatorId } });
  if (!payoutAccount || payoutAccount.status !== "active" || !payoutAccount.processorAccountId) {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  if (!checkPurchaseRateLimit(user.id)) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  const affiliateLink = await getAttributedAffiliateLink("course", course.id, user.id);

  const feeRate = await resolveFeeRate(db, course.creatorId);
  const creatorHandle = (await db.username.findUnique({ where: { userId: course.creatorId }, select: { handle: true } }))?.handle ?? "";
  const base = `${getAppOrigin()}/${creatorHandle}/courses/${course.id}`;
  const { checkoutUrl } = await getPaymentProcessor().createPurchaseCheckoutSession({
    amount: course.price,
    currency: course.currency,
    payerId: user.id,
    payerEmail: user.email,
    payeeProcessorAccountId: payoutAccount.processorAccountId,
    applicationFeeAmount: Math.round(course.price * feeRate * 100) / 100,
    description: course.title,
    successUrl: `${base}?checkout=success`,
    cancelUrl: `${base}?checkout=cancelled`,
    metadata: {
      kind: "course_purchase",
      payerId: user.id,
      payeeId: course.creatorId,
      courseId: course.id,
      amount: String(course.price),
      currency: course.currency,
      affiliateLinkId: affiliateLink?.id ?? "",
      affiliateId: affiliateLink?.affiliateId ?? "",
      affiliateCommissionPercent: affiliateLink ? String(affiliateLink.program.commissionPercent) : "",
    },
  });

  redirect(checkoutUrl);
}

// Called from the Stripe webhook once checkout.session.completed confirms
// payment — mirrors activateDigitalPurchase's shape (digital-products.ts).
// Idempotent on processorReference.
export async function activateCoursePurchase(metadata: Record<string, string>, processorReference: string): Promise<void> {
  const already = await db.paymentTransaction.findFirst({ where: { processorReference, kind: "course_purchase" } });
  if (already) return;

  const { payerId, payeeId, courseId, amount: amountStr, currency, affiliateLinkId, affiliateId, affiliateCommissionPercent } = metadata;
  const amount = Number(amountStr);
  const affiliateLink =
    affiliateLinkId && affiliateId && affiliateCommissionPercent
      ? { id: affiliateLinkId, affiliateId, program: { commissionPercent: Number(affiliateCommissionPercent) } }
      : null;

  const creditedAffiliate = await db.$transaction(async (tx) => {
    const transaction = await recordPaymentTransaction(tx, {
      kind: "course_purchase",
      payerId,
      payeeId,
      amount,
      currency,
      processorReference,
      status: "succeeded",
      relatedObjectType: "course",
      relatedObjectId: courseId,
    });
    await tx.courseAccessGrant.create({
      data: { courseId, userId: payerId, grantedVia: "purchase", paymentTransactionId: transaction.id },
    });

    if (!affiliateLink) return null;
    return creditAffiliateConversion(tx, {
      affiliateLink,
      saleAmount: amount,
      currency,
      saleProcessorReference: processorReference,
    });
  });
  if (creditedAffiliate) await notifyAffiliateConversion({ recipientId: creditedAffiliate.affiliateId, actorId: payerId });

  const creatorUsername = await db.username.findUnique({ where: { userId: payeeId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}/courses/${courseId}`);
}

// spec §11.2's third criterion: only recorded for a user who currently has
// access — re-checked here via hasCourseAccess, not trusted from the fact
// that the lesson page rendered (which itself already gated on the same
// check, but a direct action call must never assume its caller came from
// that page).
export async function markLessonComplete(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) return;

  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: { include: { course: true } } } });
  if (!lesson) return;
  if (!(await hasCourseAccess(user.id, lesson.module.courseId))) return;

  await db.courseProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: { userId: user.id, lessonId },
    update: {},
  });

  await checkCourseCompletion(user.id, lesson.module.courseId);

  const creatorUsername = await db.username.findUnique({ where: { userId: lesson.module.course.creatorId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}/courses/${lesson.module.courseId}`);
}

// spec §11.2's first criterion ("even by guessing lesson IDs"): re-checks
// access here (issuance time) AND the /api/downloads/[token] route
// re-checks again (request time) — same double-check posture
// requestDownloadUrl already established for digital products.
export async function requestLessonFileUrl(lessonId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireVerifiedUser();

  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson || !lesson.fileKey) return { error: "This lesson has no file." };
  if (!(await hasCourseAccess(user.id, lesson.module.courseId))) return { error: "You don't have access to this course." };

  const token = issueDownloadToken({ resourceType: "lesson", resourceId: lessonId, userId: user.id });
  return { url: `/api/downloads/${token}` };
}
