import "server-only";
import { db } from "@/lib/db";

export type CalendarItem = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  kind: "appointment" | "event" | "personal";
  href: string | null;
};

// phase-16 spec §8: queries Appointment/EventRSVP+Ticket live at view
// time — the same query-time-union principle used throughout this series
// (Phase 9 §6.1, and again in Phase 16 §4/§10) — rather than copying that
// data into a calendar-specific table that could drift out of sync.
export async function getCalendarItems(profileId: string, userId: string): Promise<CalendarItem[]> {
  const [appointments, rsvps, tickets, entries] = await Promise.all([
    db.appointment.findMany({
      where: { customerId: userId, status: { in: ["requested", "confirmed"] } },
      select: { id: true, startsAt: true, endsAt: true, offering: { select: { name: true } } },
    }),
    db.eventRSVP.findMany({
      where: { userId, status: "going" },
      select: { event: { select: { id: true, slug: true, title: true, startsAt: true, endsAt: true } } },
    }),
    db.ticket.findMany({
      where: { ownerId: userId, status: "valid" },
      select: { ticketType: { select: { event: { select: { id: true, slug: true, title: true, startsAt: true, endsAt: true } } } } },
    }),
    db.calendarEntry.findMany({ where: { profileId } }),
  ]);

  const items: CalendarItem[] = [];

  for (const appt of appointments) {
    items.push({
      id: `appointment:${appt.id}`,
      title: appt.offering?.name ?? "Appointment",
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      kind: "appointment",
      href: null,
    });
  }

  const seenEventIds = new Set<string>();
  for (const rsvp of rsvps) {
    if (seenEventIds.has(rsvp.event.id)) continue;
    seenEventIds.add(rsvp.event.id);
    items.push({
      id: `event:${rsvp.event.id}`,
      title: rsvp.event.title,
      startsAt: rsvp.event.startsAt,
      endsAt: rsvp.event.endsAt,
      kind: "event",
      href: `/e/${rsvp.event.slug}`,
    });
  }
  for (const ticket of tickets) {
    const event = ticket.ticketType.event;
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    items.push({
      id: `event:${event.id}`,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      kind: "event",
      href: `/e/${event.slug}`,
    });
  }

  for (const entry of entries) {
    items.push({
      id: `entry:${entry.id}`,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      kind: "personal",
      href: null,
    });
  }

  items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return items;
}
