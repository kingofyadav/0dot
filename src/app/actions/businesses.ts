"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { validateBusinessSlugFormat } from "@/lib/reserved-business-slugs";
import { BUSINESS_CATEGORY_KEYS } from "@/lib/business-categories";
import {
  getBusinessMember,
  isBusinessOwner,
  isBusinessStaff,
  computeInitialBusinessStatus,
} from "@/lib/businesses";
import type { ActionState } from "@/app/actions/auth";

const SIZE_RANGE_VALUES = new Set(["solo", "2_10", "11_50", "51_200", "201_1000", "1000_plus"]);
// admin can be invited/removed by staff; owner is only ever set at creation
// or via transferBusinessOwnership — never a directly assignable role.
const ASSIGNABLE_ROLES = new Set(["admin", "editor", "member"]);

function checkCreateBusinessRateLimit(userId: string): boolean {
  return checkRateLimit(`business:create:user:${userId}`, { max: 5, windowMs: 60 * 60 * 1000 });
}

function normalizeContactField(raw: FormDataEntryValue | null, maxLength: number): string | null {
  const value = String(raw ?? "").trim();
  return value.length > 0 ? value.slice(0, maxLength) : null;
}

function normalizeFoundedYear(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 1) return null;
  return year;
}

// spec §3.1/§3.3, build plan step 1: slug validated the same way
// communities/usernames are (src/lib/reserved-business-slugs.ts); status
// resolved via the weak-signal claim gate (computeInitialBusinessStatus) —
// this is the launch-blocking requirement from spec §3.3, not deferred.
export async function createBusiness(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkCreateBusinessRateLimit(user.id)) {
    return { error: "You're creating businesses too fast. Please slow down." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const sizeRangeRaw = String(formData.get("sizeRange") ?? "");
  const sizeRange = SIZE_RANGE_VALUES.has(sizeRangeRaw) ? sizeRangeRaw : null;
  const foundedYear = normalizeFoundedYear(formData.get("foundedYear"));
  const email = normalizeContactField(formData.get("email"), 200);
  const phone = normalizeContactField(formData.get("phone"), 40);
  const website = normalizeContactField(formData.get("website"), 200);

  if (name.length < 1 || name.length > 100) {
    return { error: "Name must be 1-100 characters." };
  }
  if (tagline.length > 140) {
    return { error: "Tagline must be 140 characters or fewer." };
  }
  if (description.length > 2000) {
    return { error: "Description must be 2000 characters or fewer." };
  }
  if (!BUSINESS_CATEGORY_KEYS.has(category)) {
    return { error: "Please choose a category." };
  }

  const slugError = validateBusinessSlugFormat(slug);
  if (slugError === "invalid_format") {
    return { error: "Slug must be 3-40 characters: letters, numbers, underscore only." };
  }
  if (slugError === "reserved") {
    return { error: "That slug is reserved." };
  }

  const existingSlug = await db.business.findUnique({ where: { slug } });
  if (existingSlug) {
    return { error: "That slug is already taken." };
  }

  let logoUrl: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const result = await saveUploadedImage(logoFile);
    if ("error" in result) return { error: result.error };
    logoUrl = result.url;
  }

  let coverUrl: string | undefined;
  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    coverUrl = result.url;
  }

  const status = computeInitialBusinessStatus({
    creatorEmail: user.email,
    creatorIsVerified: user.profile?.isVerified ?? false,
    website,
  });

  // Nested create: Business + its owner BusinessMember row + ContactInfo in
  // one write — same "create both or neither" reasoning as
  // createCommunity. See that function's comment for why the findUnique
  // check above is only a pre-check, not the actual uniqueness guarantee
  // (the DB's own unique index on Business.slug is).
  let business;
  try {
    business = await db.business.create({
      data: {
        slug,
        name,
        tagline,
        description,
        category,
        foundedYear,
        sizeRange,
        logoUrl,
        coverUrl,
        status,
        createdBy: user.id,
        members: { create: [{ userId: user.id, role: "owner" }] },
        contactInfo: { create: { email, phone, website } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That slug is already taken." };
    }
    throw err;
  }

  redirect(`/b/${business.slug}`);
}

export async function updateBusiness(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await db.business.findUnique({ where: { id: businessId }, include: { contactInfo: true } });
  if (!business) return { error: "Business not found." };
  if (!(await isBusinessStaff(businessId, user.id))) {
    return { error: "Only the owner or an admin can edit this business." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? business.category);
  const category = BUSINESS_CATEGORY_KEYS.has(categoryRaw) ? categoryRaw : business.category;
  const sizeRangeRaw = String(formData.get("sizeRange") ?? "");
  const sizeRange = SIZE_RANGE_VALUES.has(sizeRangeRaw) ? sizeRangeRaw : null;
  const foundedYear = normalizeFoundedYear(formData.get("foundedYear"));
  const email = normalizeContactField(formData.get("email"), 200);
  const phone = normalizeContactField(formData.get("phone"), 40);
  const website = normalizeContactField(formData.get("website"), 200);

  if (name.length < 1 || name.length > 100) {
    return { error: "Name must be 1-100 characters." };
  }
  if (tagline.length > 140) {
    return { error: "Tagline must be 140 characters or fewer." };
  }
  if (description.length > 2000) {
    return { error: "Description must be 2000 characters or fewer." };
  }

  const data: {
    name: string;
    tagline: string;
    description: string;
    category: string;
    sizeRange: string | null;
    foundedYear: number | null;
    logoUrl?: string;
    coverUrl?: string;
  } = { name, tagline, description, category, sizeRange, foundedYear };

  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const result = await saveUploadedImage(logoFile);
    if ("error" in result) return { error: result.error };
    data.logoUrl = result.url;
  }

  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    data.coverUrl = result.url;
  }

  await db.business.update({
    where: { id: businessId },
    data: {
      ...data,
      contactInfo: { upsert: { create: { email, phone, website }, update: { email, phone, website } } },
    },
  });

  revalidatePath(`/b/${business.slug}`);
  revalidatePath(`/b/${business.slug}/manage`);
  redirect(`/b/${business.slug}/manage`);
}

// Adds a member row directly, no accept/decline flow — matching how this
// phase's spec doesn't ask for one (build plan step 1). Staff-tier
// (owner|admin) per spec §4.1's "admin: manage team"; the assigned role is
// capped to admin|editor|member — owner is never directly assignable, only
// via transferBusinessOwnership. Looked up by @username (not a raw userId)
// since the manage UI has no pre-existing list of candidates to pick from.
export async function inviteTeamMember(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const handle = String(formData.get("username") ?? "").trim().toLowerCase().replace(/^@/, "");
  const roleRaw = String(formData.get("role") ?? "member");
  if (!businessId || !handle) return { error: "Enter a username." };
  if (!(await isBusinessStaff(businessId, user.id))) return { error: "You can't manage this team." };
  const role = ASSIGNABLE_ROLES.has(roleRaw) ? roleRaw : "member";

  const targetUsername = await db.username.findUnique({ where: { handle }, select: { userId: true } });
  if (!targetUsername) return { error: "No user with that username." };

  const existing = await getBusinessMember(businessId, targetUsername.userId);
  if (existing) return { error: "Already on the team." };

  await db.businessMember.create({ data: { businessId, userId: targetUsername.userId, role } });

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
  return undefined;
}

export async function updateTeamMemberRole(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  if (!businessId || !targetUserId || !ASSIGNABLE_ROLES.has(roleRaw)) return;
  if (!(await isBusinessStaff(businessId, user.id))) return;

  const target = await getBusinessMember(businessId, targetUserId);
  // Owner role changes only ever go through transferBusinessOwnership —
  // never reachable here, so the business can't be left ownerless or gain
  // a second owner via this path (spec §4.2 acceptance criteria).
  if (!target || target.role === "owner") return;

  await db.businessMember.update({
    where: { businessId_userId: { businessId, userId: targetUserId } },
    data: { role: roleRaw },
  });

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
}

export async function updateTeamMemberVisibility(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const isPublic = formData.get("isPublic") === "true";
  if (!businessId) return;

  // A member can toggle their own public-listing visibility; staff can
  // toggle anyone's — same "self, or staff" shape as leaveBusinessTeam.
  const targetUserId = (await isBusinessStaff(businessId, user.id))
    ? String(formData.get("userId") ?? user.id)
    : user.id;

  const target = await getBusinessMember(businessId, targetUserId);
  if (!target) return;

  await db.businessMember.update({
    where: { businessId_userId: { businessId, userId: targetUserId } },
    data: { isPublic },
  });

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
}

export async function removeTeamMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!businessId || !targetUserId) return;
  if (!(await isBusinessStaff(businessId, user.id))) return;

  const target = await getBusinessMember(businessId, targetUserId);
  // The owner can never be removed this way — matches §4.2's "removing the
  // last owner is prevented" (there's only ever one owner at a time).
  if (!target || target.role === "owner") return;

  await db.businessMember.delete({ where: { businessId_userId: { businessId, userId: targetUserId } } });

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
}

// Owner-only. The outgoing owner becomes an admin, not a plain member —
// they built the business; losing primary ownership shouldn't mean losing
// all standing in one action. Same reasoning as communities.ts's
// transferOwnership.
export async function transferBusinessOwnership(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!businessId || !targetUserId || targetUserId === user.id) return;
  if (!(await isBusinessOwner(businessId, user.id))) return;

  const target = await getBusinessMember(businessId, targetUserId);
  if (!target || target.role === "owner") return;

  await db.$transaction([
    db.businessMember.update({
      where: { businessId_userId: { businessId, userId: targetUserId } },
      data: { role: "owner" },
    }),
    db.businessMember.update({
      where: { businessId_userId: { businessId, userId: user.id } },
      data: { role: "admin" },
    }),
  ]);

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) {
    revalidatePath(`/b/${business.slug}/manage`);
    revalidatePath(`/b/${business.slug}`);
  }
}

// The owner can never leave — they must transfer ownership first (spec
// §4.2: removing the last owner is prevented). Every other role can leave
// unconditionally.
export async function leaveBusinessTeam(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  const member = await getBusinessMember(businessId, user.id);
  if (!member || member.role === "owner") return;

  await db.businessMember.delete({ where: { businessId_userId: { businessId, userId: user.id } } });

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) redirect(`/b/${business.slug}`);
}
