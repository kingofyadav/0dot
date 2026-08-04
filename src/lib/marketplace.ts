import "server-only";
import { db } from "@/lib/db";
import { canManageCatalog } from "@/lib/businesses";
import { isCommunityStaff } from "@/lib/communities";

export const MARKETPLACE_CATEGORIES = ["theme", "template", "app"] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

const HEX_OR_RGB_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\))$/;

// spec §4.2's oEmbed-style allowlist — a fixed, pre-approved capability
// set, never an arbitrary iframe src. Widened by adding an entry here, not
// by loosening the per-listing check.
const EMBED_PROVIDERS: Record<string, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "youtu.be"],
  vimeo: ["vimeo.com", "player.vimeo.com"],
  spotify: ["open.spotify.com"],
  soundcloud: ["soundcloud.com", "w.soundcloud.com"],
  x: ["twitter.com", "x.com"],
  codepen: ["codepen.io"],
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// spec §4.6's literal acceptance criteria: a theme payload can't exceed
// Phase 1 §3.6's token schema, an app payload can't reference an embed
// source outside the provider allowlist and never contains raw HTML/JS —
// checked here at write time (createMarketplaceListing), not left to the
// review queue alone to catch. Returns the normalized payload object (to
// be JSON.stringify'd for storage) or an error.
export function validateListingPayload(
  category: MarketplaceCategory,
  raw: unknown
): { error: string } | { payload: Record<string, unknown> } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "Invalid listing content." };
  const obj = raw as Record<string, unknown>;

  if (category === "theme") {
    const { accent, accentStrong, accentSoft, ...rest } = obj;
    if (Object.keys(rest).length > 0) return { error: "A theme can only set accent, accentStrong, and accentSoft." };
    for (const [key, value] of [["accent", accent], ["accentStrong", accentStrong], ["accentSoft", accentSoft]] as const) {
      if (typeof value !== "string" || value.length > 60 || !HEX_OR_RGB_COLOR.test(value)) {
        return { error: `${key} must be a hex, rgb(a), or hsl(a) color.` };
      }
    }
    return { payload: { accent, accentStrong, accentSoft } };
  }

  if (category === "app") {
    const { provider, embedUrl, ...rest } = obj;
    if (Object.keys(rest).length > 0) return { error: "An app widget can only set provider and embedUrl." };
    if (typeof provider !== "string" || !(provider in EMBED_PROVIDERS)) {
      return { error: `Provider must be one of: ${Object.keys(EMBED_PROVIDERS).join(", ")}.` };
    }
    if (typeof embedUrl !== "string") return { error: "embedUrl is required." };
    const host = hostnameOf(embedUrl);
    if (!host || !EMBED_PROVIDERS[provider].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return { error: "embedUrl must belong to the selected provider's domain." };
    }
    return { payload: { provider, embedUrl } };
  }

  // template: structured starter data for another entity's own creation
  // form (§4.4) — no schema of its own beyond a size cap; the *creation*
  // endpoint it eventually feeds validates every field itself, this table
  // never bypasses that.
  const asJson = JSON.stringify(obj);
  if (asJson.length > 20000) return { error: "Template content is too large (max 20,000 characters as JSON)." };
  return { payload: obj };
}

export type ListingSeller = { sellerUserId: string | null; sellerBusinessId: string | null };

export async function resolveListingSeller(
  userId: string,
  sellerType: string,
  sellerId: string
): Promise<(ListingSeller & { sellerType: string }) | { error: string }> {
  if (sellerType === "user") {
    return { sellerType: "user", sellerUserId: userId, sellerBusinessId: null };
  }
  if (sellerType === "business") {
    if (!sellerId || !(await canManageCatalog(sellerId, userId))) {
      return { error: "You don't manage that business's catalog." };
    }
    return { sellerType: "business", sellerUserId: null, sellerBusinessId: sellerId };
  }
  return { error: "Choose who's selling this." };
}

export async function canManageListing(listing: ListingSeller, userId: string): Promise<boolean> {
  if (listing.sellerBusinessId) return canManageCatalog(listing.sellerBusinessId, userId);
  if (listing.sellerUserId) return listing.sellerUserId === userId;
  return false;
}

export type InstallerRef = { installerType: string; installerUserId: string | null; installerBusinessId: string | null; installerCommunityId: string | null };

// spec §4.3: a three-way installer XOR — installerUserId is a Profile id
// (see Profile.installedApps's schema comment), not the acting User's own
// id, so this resolves the caller's own Profile row for the "user" case.
export async function resolveInstaller(
  userId: string,
  installerType: string,
  installerId: string
): Promise<InstallerRef | { error: string }> {
  if (installerType === "user") {
    const profile = await db.profile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return { error: "You need a profile to install widgets." };
    return { installerType: "user", installerUserId: profile.id, installerBusinessId: null, installerCommunityId: null };
  }
  if (installerType === "business") {
    if (!installerId || !(await canManageCatalog(installerId, userId))) {
      return { error: "You don't manage that business's page." };
    }
    return { installerType: "business", installerUserId: null, installerBusinessId: installerId, installerCommunityId: null };
  }
  if (installerType === "community") {
    if (!installerId || !(await isCommunityStaff(installerId, userId))) {
      return { error: "You don't moderate that community." };
    }
    return { installerType: "community", installerUserId: null, installerBusinessId: null, installerCommunityId: installerId };
  }
  return { error: "Choose where to install this." };
}

// phase-9 spec §7.1/§7.2: the second rated-review instance after Business's
// Review/ReviewResponse — verified-purchase gating (a paid purchase, or an
// install record for a free listing). Shared between the review-write
// action (createOrUpdateListingReview, marketplace.ts) and the detail
// page's decision to show the review form at all, so both agree on the
// same rule rather than the UI guessing at what the server will accept.
export async function hasVerifiedListingAccess(listingId: string, userId: string): Promise<boolean> {
  const purchase = await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId, buyerId: userId } } });
  if (purchase) return true;
  const profile = await db.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return false;
  const install = await db.installedApp.findFirst({ where: { listingId, installerUserId: profile.id } });
  return Boolean(install);
}
