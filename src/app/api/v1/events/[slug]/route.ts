import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getEventBySlug, isEventHost, getMyRSVP, getRSVPCounts } from "@/lib/events";

function hostLabel(event: { hostedByBusiness: { name: string } | null; hostedByCommunity: { name: string } | null; hostedByUser: { profile: { displayName: string } | null; username: { handle: string } | null } | null }): string {
  if (event.hostedByBusiness) return event.hostedByBusiness.name;
  if (event.hostedByCommunity) return event.hostedByCommunity.name;
  return event.hostedByUser?.profile?.displayName ?? event.hostedByUser?.username?.handle ?? "Unknown host";
}

// Ticket purchase itself stays web-only (Phase 15 §6: money flows are
// flagged, not a routine mobile implementation task) — mobile shows ticket
// tiers for information (price/availability) and hands off to the browser
// for the actual purchase, same posture as M5's marketplace/business
// screens. RSVP (free, no money involved) is the one write this domain
// gets natively (see the sibling rsvp/route.ts).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "events:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const event = await getEventBySlug(slug);
  if (!event) return apiError("Not found.", 404);

  // A draft event is visible only to its host — same gate the web page
  // applies via isEventHost before rendering anything beyond "not found."
  if (event.status !== "published" && !(await isEventHost(event, ctx.userId))) {
    return apiError("Not found.", 404);
  }

  const [myRsvp, counts] = await Promise.all([getMyRSVP(event.id, ctx.userId), getRSVPCounts(event.id)]);

  return Response.json(
    {
      slug: event.slug,
      title: event.title,
      description: event.description,
      coverImageUrl: event.coverImageUrl,
      format: event.format,
      location: event.location,
      virtualJoinUrl: event.format === "virtual" || event.format === "hybrid" ? event.virtualJoinUrl : null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      capacity: event.capacity,
      hostLabel: hostLabel(event),
      myRsvpStatus: myRsvp?.status ?? null,
      goingCount: counts.going,
      interestedCount: counts.interested,
      ticketTypes: event.ticketTypes.map((t) => ({
        id: t.id,
        name: t.name,
        price: t.price,
        currency: t.currency,
        quantityTotal: t.quantityTotal,
        quantitySold: t.quantitySold,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
