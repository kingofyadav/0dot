import "server-only";
import { db } from "@/lib/db";

// Plain server-only lib, not a "use server" action file — same reasoning as
// communities.ts/blocks.ts/messaging.ts: these queries trust a bare
// businessId/userId with no request-level auth of their own. Callers
// (Server Components, Server Actions) are already authenticated via
// requireVerifiedUser/getCurrentUser.

export function getBusinessMember(businessId: string, userId: string) {
  return db.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
  });
}

// Full control, including deleting the business, transferring ownership,
// and managing team membership.
export async function isBusinessOwner(businessId: string, userId: string): Promise<boolean> {
  const member = await getBusinessMember(businessId, userId);
  return member?.role === "owner";
}

// owner|admin — manage team, catalog, jobs, appointments, respond to
// reviews, post as the business (spec §4.1). NOT editor — editor can manage
// the catalog (see canManageCatalog below) but not team/billing-adjacent
// settings.
export async function isBusinessStaff(businessId: string, userId: string): Promise<boolean> {
  const member = await getBusinessMember(businessId, userId);
  return member?.role === "owner" || member?.role === "admin";
}

// owner|admin|editor — manage catalog/posts/jobs, per spec §4.1's role
// table. `member` is an internal-only association (e.g. "I work here") with
// no write permissions at all.
export async function canManageCatalog(businessId: string, userId: string): Promise<boolean> {
  const member = await getBusinessMember(businessId, userId);
  return member?.role === "owner" || member?.role === "admin" || member?.role === "editor";
}

function extractEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function extractWebsiteDomain(website: string): string {
  return website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "");
}

// Lowercased, whitespace/punctuation-stripped — a loose but effective
// collision check ("Google", "google", "Google!!" all normalize the same)
// without needing a fuzzy-match library.
function normalizeBusinessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// spec §3.3: "a name-collision/likely-impersonation heuristic... the
// decision to gate is being made now, not deferred." Scoped to existing
// platform businesses only — a full "well-known external brands" check
// would need a third-party data source this codebase doesn't have.
async function hasActiveBusinessNameCollision(name: string): Promise<boolean> {
  const normalized = normalizeBusinessName(name);
  if (!normalized) return false;
  const candidates = await db.business.findMany({ where: { status: "active" }, select: { name: true } });
  return candidates.some((c) => normalizeBusinessName(c.name) === normalized);
}

// phase-4 build plan decision #1: the launch-blocking claim gate from spec
// §3.3, resolved as a weak-signal auto-approval rather than always-pending.
// A business promotes straight to `active` when the creator's account email
// domain matches the business's own claimed website domain, or the creator
// already holds Profile.isVerified (Phase 1's stronger, manually-granted
// checkmark) — unless its name collides with an existing active business,
// which forces `pending` regardless of the other two signals (an
// impersonation attempt shouldn't be waved through just because the
// impersonator's own email happens to match their own fake website).
// Otherwise it stays `pending` — invisible/unsearchable until a platform
// admin approves it from /admin/businesses.
export async function computeInitialBusinessStatus(args: {
  creatorEmail: string;
  creatorIsVerified: boolean;
  website: string | null;
  name: string;
}): Promise<"active" | "pending"> {
  if (await hasActiveBusinessNameCollision(args.name)) return "pending";
  if (args.creatorIsVerified) return "active";
  if (args.website) {
    const emailDomain = extractEmailDomain(args.creatorEmail);
    const websiteDomain = extractWebsiteDomain(args.website);
    if (emailDomain && websiteDomain && emailDomain === websiteDomain) return "active";
  }
  return "pending";
}

export type PostBusinessAuthorContext = { businessId: string };

// Shared by createPost (src/app/actions/posts.ts) — resolves and validates
// an optional businessId from raw form input in one place, mirroring
// resolvePostCommunityContext's exact shape (src/lib/communities.ts).
// Returns null when no businessId was submitted at all (most posts aren't
// authored as a business). Spec §5: only owner/admin/editor may post as
// the business, enforced here server-side, not just hidden in the composer.
export async function resolveBusinessAuthorContext(
  userId: string,
  businessIdRaw: string | null
): Promise<{ error: string } | PostBusinessAuthorContext | null> {
  if (!businessIdRaw) return null;

  const business = await db.business.findUnique({ where: { id: businessIdRaw }, select: { id: true } });
  if (!business) return { error: "Business not found." };

  if (!(await canManageCatalog(business.id, userId))) {
    return { error: "You don't have permission to post as this business." };
  }

  return { businessId: business.id };
}

export type BusinessHours = Record<string, { opens: string; closes: string }[]>;

// spec §3.1: hoursJson is free-form JSON, "parsed/validated at the app
// layer" — no write path exists yet (no build plan step adds location
// management UI), so this exists to render defensively whenever one does,
// or if a location is ever seeded directly. Malformed/absent JSON simply
// renders no hours, never throws.
export function parseBusinessHours(hoursJson: string | null): BusinessHours | null {
  if (!hoursJson) return null;
  try {
    const parsed: unknown = JSON.parse(hoursJson);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as BusinessHours;
  } catch {
    return null;
  }
}

// Populates the "Post as" picker in ComposeBox — every business this user
// can author posts for (owner|admin|editor tier, same as
// resolveBusinessAuthorContext's check above).
export function getPostableBusinesses(userId: string) {
  return db.business.findMany({
    where: { members: { some: { userId, role: { in: ["owner", "admin", "editor"] } } } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}
