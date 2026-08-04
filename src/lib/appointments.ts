import "server-only";
import { db } from "@/lib/db";

export type AvailableSlot = { startsAt: Date; endsAt: Date };

function parseLocalMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// spec §10.2: "computed on read from AvailabilityRule minus existing
// non-cancelled Appointment rows in that window — no precomputed slot
// table," same fan-out-on-read instinct as Phase 2's feed. MVP scope only
// (§10.1): business-level (or, phase-9 spec §3.2, individual-seller-level)
// availability (AvailabilityRule.teamMemberId is always null in this
// build's booking flow), slots are wall-clock (no timezone conversion —
// see AvailabilityRule's schema comment).
//
// phase-9 spec §3.2: businessId dropped as a caller-supplied argument —
// the owner (business or seller user) is derived from the Offering itself,
// same two-way XOR every other extended call site now resolves off the
// row rather than trusting a separately-passed id.
export async function getAvailableSlots(
  offeringId: string,
  { from, to }: { from: Date; to: Date }
): Promise<AvailableSlot[]> {
  const offering = await db.offering.findUnique({ where: { id: offeringId } });
  if (!offering || !offering.isBookable || !offering.durationMinutes) return [];
  const durationMs = offering.durationMinutes * 60 * 1000;

  const ownerWhere = offering.businessId
    ? { businessId: offering.businessId, sellerUserId: null }
    : { businessId: null, sellerUserId: offering.sellerUserId };

  const rules = await db.availabilityRule.findMany({ where: { ...ownerWhere, teamMemberId: null } });
  if (rules.length === 0) return [];

  const existing = await db.appointment.findMany({
    where: {
      ...ownerWhere,
      teamMemberId: null,
      status: { not: "cancelled" },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { startsAt: true, endsAt: true },
  });

  const slots: AvailableSlot[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let dayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); dayStart < to; dayStart = new Date(dayStart.getTime() + dayMs)) {
    const dayOfWeek = dayStart.getUTCDay();
    for (const rule of rules.filter((r) => r.dayOfWeek === dayOfWeek)) {
      const windowStartMin = parseLocalMinutes(rule.startsAtLocal);
      const windowEndMin = parseLocalMinutes(rule.endsAtLocal);
      for (let slotStartMin = windowStartMin; slotStartMin + offering.durationMinutes <= windowEndMin; slotStartMin += offering.durationMinutes) {
        const slotStart = new Date(dayStart.getTime() + slotStartMin * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        if (slotStart < from || slotStart < new Date() || slotEnd > to) continue;
        const overlaps = existing.some((a) => slotStart < a.endsAt && slotEnd > a.startsAt);
        if (!overlaps) slots.push({ startsAt: slotStart, endsAt: slotEnd });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
