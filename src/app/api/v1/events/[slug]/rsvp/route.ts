import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGoingAttendeeCount } from "@/lib/events";
import { revalidatePath } from "next/cache";

const RSVP_STATUSES = new Set(["going", "interested", "not_going"]);

// Mirrors actions/events.ts's rsvpToEvent exactly (same rate-limit key,
// same capacity check only applied on a fresh "going").
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "events:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const payload = await request.json().catch(() => null);
  const status = typeof payload?.status === "string" ? payload.status : "";
  if (!RSVP_STATUSES.has(status)) return apiError("Invalid RSVP status.", 400);

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const event = await db.event.findUnique({ where: { slug } });
  if (!event || event.status !== "published") return apiError("This event isn't accepting RSVPs.", 403);

  if (!checkRateLimit(`event:rsvp:user:${ctx.userId}`, { max: 30, windowMs: 5 * 60 * 1000 })) {
    return apiError("You're RSVPing too fast. Please slow down.", 429);
  }

  if (status === "going" && event.capacity !== null) {
    const existing = await db.eventRSVP.findUnique({ where: { eventId_userId: { eventId: event.id, userId: ctx.userId } } });
    if (existing?.status !== "going") {
      const current = await getGoingAttendeeCount(event.id);
      if (current >= event.capacity) return apiError("This event is at capacity.", 409);
    }
  }

  await db.eventRSVP.upsert({
    where: { eventId_userId: { eventId: event.id, userId: ctx.userId } },
    create: { eventId: event.id, userId: ctx.userId, status },
    update: { status },
  });

  revalidatePath(`/e/${event.slug}`);

  return Response.json({ status }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
