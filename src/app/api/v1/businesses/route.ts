import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Mobile pro-upgrade addendum, sub-phase M5. Mirrors src/app/b/page.tsx's
// "your businesses" (including your own pending-review ones) + "discover"
// two-section shape, same posture as GET /api/v1/communities mirroring
// /c/page.tsx.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "businesses:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const myMemberships = await db.businessMember.findMany({
    where: { userId: ctx.userId },
    orderBy: { joinedAt: "desc" },
    include: { business: true },
  });
  const myBusinessIds = myMemberships.map((m) => m.businessId);

  const discover = await db.business.findMany({
    where: { status: "active", id: { notIn: myBusinessIds } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const summarize = (b: { id: string; slug: string; name: string; logoUrl: string | null; category: string; status: string; isVerified: boolean }) => ({
    // Added for the mobile wallet business-switcher (GET /wallet?scope=business
    // needs a businessId, not a slug) — additive field, existing clients
    // that only read the fields below are unaffected.
    id: b.id,
    slug: b.slug,
    name: b.name,
    logoUrl: b.logoUrl,
    category: b.category,
    status: b.status,
    isVerified: b.isVerified,
  });

  return Response.json(
    { mine: myMemberships.map((m) => summarize(m.business)), discover: discover.map(summarize) },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
