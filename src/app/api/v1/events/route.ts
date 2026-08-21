import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { listUpcomingEvents } from "@/lib/events";

function hostLabel(event: Awaited<ReturnType<typeof listUpcomingEvents>>[number]): string {
  if (event.hostedByBusiness) return event.hostedByBusiness.name;
  if (event.hostedByCommunity) return event.hostedByCommunity.name;
  return event.hostedByUser?.profile?.displayName ?? event.hostedByUser?.username?.handle ?? "Unknown host";
}

// Mobile pro-upgrade addendum, sub-phase M6. Mirrors src/app/e/page.tsx
// exactly — same listUpcomingEvents(30) source (published, not-yet-ended,
// soonest-first; deliberately no engagement ranking, per that lib's own
// comment).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "events:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const events = await listUpcomingEvents(30);

  return Response.json(
    {
      items: events.map((event) => ({
        slug: event.slug,
        title: event.title,
        coverImageUrl: event.coverImageUrl,
        format: event.format,
        location: event.location,
        startsAt: event.startsAt,
        hostLabel: hostLabel(event),
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
