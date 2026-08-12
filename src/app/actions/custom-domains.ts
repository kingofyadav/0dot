"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireOwnProfile, requireVerifiedUser } from "@/lib/auth-guards";
import { isBusinessStaff } from "@/lib/businesses";
import { isProfilePremium, isBusinessSubscribed } from "@/lib/platform-billing";
import { claimCustomDomain, normalizeDomain, looksLikeApex, releaseCustomDomain, setPrimaryCustomDomain, verifyDomainRouting } from "@/lib/custom-domains";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

// The platform's own domain and any subdomain of it can never be claimed
// as someone else's custom domain — the same "brand terms belong in every
// global namespace" posture reserved-usernames.ts etc. already apply,
// scoped down to the one entry that matters here since this is a single
// hardcoded root, not an open-ended namespace list.
const PLATFORM_DOMAIN = "0dot.in";

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function validateDomainFormat(raw: string): { error: string } | { domain: string } {
  const domain = normalizeDomain(raw);
  if (!DOMAIN_PATTERN.test(domain)) return { error: "Enter a valid domain (e.g. links.yourdomain.com)." };
  if (domain === PLATFORM_DOMAIN || domain.endsWith(`.${PLATFORM_DOMAIN}`)) {
    return { error: "That domain isn't available to claim." };
  }
  return { domain };
}

async function claim(ownerType: "profile" | "business", ownerId: string, formData: FormData): Promise<ActionState> {
  const validated = validateDomainFormat(String(formData.get("domain") ?? ""));
  if ("error" in validated) return validated;
  const { domain } = validated;

  const isApex = formData.get("isApex") === "on" || looksLikeApex(domain);

  // spec §2.3/premium-profiles addendum §3.2: one included slot per active
  // subscription. Additional-domain pricing is an unresolved finance
  // question (both addenda's §9/§7), so this build caps at the one
  // included slot rather than guessing a price for more. Only `active`/
  // `suspended_nonpayment` count as "the slot in use" — a `dormant` row
  // (spec §5.3) is a 90-day-retained string reservation for a domain the
  // owner already removed, not an occupied slot, so it must never block
  // claiming a *different* replacement domain.
  const existingCount = await db.customDomain.count({
    where:
      ownerType === "profile"
        ? { ownerProfileId: ownerId, status: { in: ["active", "suspended_nonpayment"] } }
        : { ownerBusinessId: ownerId, status: { in: ["active", "suspended_nonpayment"] } },
  });
  if (existingCount >= 1) return { error: "Your plan includes one custom domain. Remove your existing one to claim a different domain." };

  try {
    const row = await claimCustomDomain({ ownerType, ownerId, domain, isApex });
    await verifyDomainRouting(row.id).catch(() => {}); // best-effort immediate check; the scheduler (custom-domains.ts) retries regardless
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "This domain is already claimed." };
    }
    throw err;
  }
  return undefined;
}

export async function claimProfileCustomDomainAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  if (!checkRateLimit(`custom-domain:claim:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 })) {
    return { error: "Too many attempts. Please slow down." };
  }
  // custom-domains addendum §8.1: activation requires an active
  // profile_premium subscription — the claim itself is gated, not just
  // the resulting `active` status, so an unpaid user never even gets a
  // dns_target issued.
  if (!(await isProfilePremium(user.profile!.id))) {
    return { error: "Custom domains are a Premium perk. Subscribe to Premium first." };
  }

  const result = await claim("profile", user.profile!.id, formData);
  if (result) return result;

  revalidatePath(`/s/${user.username!.handle}/billing/domains`);
  return undefined;
}

export async function claimBusinessCustomDomainAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  if (!(await isBusinessStaff(businessId, user.id))) {
    return { error: "You don't have permission to manage this business's domains." };
  }
  if (!checkRateLimit(`custom-domain:claim:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 })) {
    return { error: "Too many attempts. Please slow down." };
  }
  if (!(await isBusinessSubscribed(businessId))) {
    return { error: "Custom domains require an active business subscription." };
  }

  const result = await claim("business", businessId, formData);
  if (result) return result;

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
  return undefined;
}

async function requireOwnedCustomDomain(customDomainId: string, ownerType: "profile" | "business", ownerId: string) {
  const row = await db.customDomain.findUnique({ where: { id: customDomainId } });
  if (!row) return null;
  if (ownerType === "profile" && row.ownerProfileId !== ownerId) return null;
  if (ownerType === "business" && row.ownerBusinessId !== ownerId) return null;
  return row;
}

export async function removeProfileCustomDomainAction(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const customDomainId = String(formData.get("customDomainId") ?? "");
  if (!customDomainId) return;

  const row = await requireOwnedCustomDomain(customDomainId, "profile", user.profile!.id);
  if (!row) return;

  await releaseCustomDomain(row.id);
  revalidatePath(`/s/${user.username!.handle}/billing/domains`);
}

export async function removeBusinessCustomDomainAction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const customDomainId = String(formData.get("customDomainId") ?? "");
  const businessId = String(formData.get("businessId") ?? "");
  if (!customDomainId || !businessId) return;
  if (!(await isBusinessStaff(businessId, user.id))) return;

  const row = await requireOwnedCustomDomain(customDomainId, "business", businessId);
  if (!row) return;

  await releaseCustomDomain(row.id);
  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage`);
}

export async function setPrimaryProfileCustomDomainAction(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const customDomainId = String(formData.get("customDomainId") ?? "");
  if (!customDomainId) return;

  const row = await requireOwnedCustomDomain(customDomainId, "profile", user.profile!.id);
  if (!row) return;

  await setPrimaryCustomDomain(row.id, "profile", user.profile!.id);
  revalidatePath(`/${user.username!.handle}`);
  revalidatePath(`/s/${user.username!.handle}/billing/domains`);
}

// Owner-triggered "check DNS now" — the scheduler (custom-domains.ts)
// polls on its own interval regardless, this just lets an owner who just
// fixed their DNS see the result immediately instead of waiting.
export async function retryProfileDomainVerificationAction(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const customDomainId = String(formData.get("customDomainId") ?? "");
  if (!customDomainId) return;

  const row = await requireOwnedCustomDomain(customDomainId, "profile", user.profile!.id);
  if (!row) return;
  if (!checkRateLimit(`custom-domain:verify:${user.id}`, { max: 10, windowMs: 10 * 60 * 1000 })) return;

  await verifyDomainRouting(row.id);
  revalidatePath(`/s/${user.username!.handle}/billing/domains`);
}

export async function retryBusinessDomainVerificationAction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const customDomainId = String(formData.get("customDomainId") ?? "");
  const businessId = String(formData.get("businessId") ?? "");
  if (!customDomainId || !businessId) return;
  if (!(await isBusinessStaff(businessId, user.id))) return;

  const row = await requireOwnedCustomDomain(customDomainId, "business", businessId);
  if (!row) return;
  if (!checkRateLimit(`custom-domain:verify:${user.id}`, { max: 10, windowMs: 10 * 60 * 1000 })) return;

  await verifyDomainRouting(row.id);
  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage/billing`);
}
