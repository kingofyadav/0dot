import "server-only";
import { db } from "@/lib/db";
import { isBusinessStaff } from "@/lib/businesses";
import { isCommunityStaff } from "@/lib/communities";

// Plain server-only lib, not a "use server" action file — same reasoning as
// communities.ts/businesses.ts/blocks.ts: these queries trust a bare
// eventId/userId with no request-level auth of their own. Callers (Server
// Components, Server Actions) are already authenticated via
// requireVerifiedUser/getCurrentUser.

const hostInclude = {
  hostedByUser: { include: { username: true, profile: true } },
  hostedByBusiness: { select: { slug: true, name: true, logoUrl: true } },
  hostedByCommunity: { select: { slug: true, name: true, avatarUrl: true } },
  creator: { include: { username: true } },
} as const;

export function getEventBySlug(slug: string) {
  return db.event.findUnique({
    where: { slug },
    include: { ...hostInclude, ticketTypes: { orderBy: { createdAt: "asc" } } },
  });
}

// spec §3.4: only `published` events appear in search/listings — a `draft`
// is visible only to its host/creator (checked by the caller via
// isEventHost, not here).
export function listUpcomingEvents(limit = 30) {
  const now = new Date();
  return db.event.findMany({
    where: {
      status: "published",
      OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }],
    },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: hostInclude,
  });
}

// spec §3.2: exactly one of the three hosted_by_* columns is meaningfully
// "this user's" — createdBy (audit trail, §3.1) is always a valid fallback
// grant since the creator manages the record regardless of who's hosting.
export async function isEventHost(
  event: {
    createdBy: string;
    hostedByUserId: string | null;
    hostedByBusinessId: string | null;
    hostedByCommunityId: string | null;
  },
  userId: string
): Promise<boolean> {
  if (event.createdBy === userId || event.hostedByUserId === userId) return true;
  if (event.hostedByBusinessId) return isBusinessStaff(event.hostedByBusinessId, userId);
  if (event.hostedByCommunityId) return isCommunityStaff(event.hostedByCommunityId, userId);
  return false;
}

export function getMyRSVP(eventId: string, userId: string) {
  return db.eventRSVP.findUnique({ where: { eventId_userId: { eventId, userId } } });
}

export async function getRSVPCounts(eventId: string): Promise<{ going: number; interested: number }> {
  const [going, interested] = await Promise.all([
    db.eventRSVP.count({ where: { eventId, status: "going" } }),
    db.eventRSVP.count({ where: { eventId, status: "interested" } }),
  ]);
  return { going, interested };
}

// spec §3.1/§4.3: capacity is a hard cap on total attendees, RSVP + tickets
// combined — a live count against both sources at write time, not a
// denormalized counter (see build plan §2: no single natural transaction
// boundary spans both tables).
export async function getGoingAttendeeCount(eventId: string): Promise<number> {
  const [goingRsvps, activeTickets] = await Promise.all([
    db.eventRSVP.count({ where: { eventId, status: "going" } }),
    db.ticket.count({ where: { ticketType: { eventId }, status: { in: ["valid", "checked_in"] } } }),
  ]);
  return goingRsvps + activeTickets;
}

export function listAttendees(eventId: string) {
  return db.eventRSVP.findMany({
    where: { eventId, status: "going" },
    include: { user: { include: { username: true, profile: true } } },
    orderBy: { createdAt: "asc" },
  });
}
