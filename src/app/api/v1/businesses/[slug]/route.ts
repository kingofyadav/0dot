import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Read-only for mobile v1 — booking (Offering/AvailabilityRule/Appointment),
// contact forms, and reviews all stay a browser hand-off to `/b/{slug}`
// (see this route's own href-style posture, matching M6's event-ticket
// decision) rather than native screens for each; this route gives enough
// to render a real business profile card and a "View full profile" link.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "businesses:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const business = await db.business.findUnique({
    where: { slug },
    include: { locations: { take: 1 }, contactInfo: true },
  });
  if (!business || business.status !== "active") return apiError("Not found.", 404);

  const primaryLocation = business.locations[0] ?? null;

  return Response.json(
    {
      slug: business.slug,
      name: business.name,
      tagline: business.tagline,
      description: business.description,
      logoUrl: business.logoUrl,
      coverUrl: business.coverUrl,
      category: business.category,
      isVerified: business.isVerified,
      averageRating: business.averageRating,
      reviewCount: business.reviewCount,
      location: primaryLocation ? { label: primaryLocation.label, address: primaryLocation.address } : null,
      website: business.contactInfo?.website ?? null,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
