"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { canManageCatalog, isBusinessStaff } from "@/lib/businesses";
import { notifyAppointmentRequest, notifyAppointmentConfirmed, notifyAppointmentCancelled } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkAppointmentRateLimit(userId: string): boolean {
  return checkRateLimit(`appointment:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
}

// canManageCatalog-tier (owner|admin|editor) — same tier that manages the
// bookable offerings this availability is scoped to. Business-level only
// (teamMemberId stays null, see AvailabilityRule's schema comment for why).
export async function createAvailabilityRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startsAtLocal = String(formData.get("startsAtLocal") ?? "");
  const endsAtLocal = String(formData.get("endsAtLocal") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!businessId || !(await canManageCatalog(businessId, user.id))) return;
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;
  if (!TIME_PATTERN.test(startsAtLocal) || !TIME_PATTERN.test(endsAtLocal) || startsAtLocal >= endsAtLocal) return;
  if (!timezone) return;

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (!business) return;

  await db.availabilityRule.create({
    data: { businessId, dayOfWeek, startsAtLocal, endsAtLocal, timezone },
  });

  revalidatePath(`/b/${business.slug}/appointments/manage`);
}

export async function deleteAvailabilityRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) return;

  const rule = await db.availabilityRule.findUnique({ where: { id: ruleId }, include: { business: { select: { id: true, slug: true } } } });
  if (!rule) return;
  if (!(await canManageCatalog(rule.business.id, user.id))) return;

  await db.availabilityRule.delete({ where: { id: ruleId } });
  revalidatePath(`/b/${rule.business.slug}/appointments/manage`);
}

// spec §10.3: every acceptance criterion lives here. endsAt is always
// derived from offering.durationMinutes (never client-supplied). The
// overlap check — build plan decision #3, a `requested` appointment
// tentatively holds the slot — runs inside the same transaction as the
// insert so two simultaneous requests for the same slot can't both
// succeed (better-sqlite3's single-writer-connection adapter serializes
// this at the process level too, but the transaction is what the spec's
// acceptance criterion asks for regardless of adapter).
export async function requestAppointment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const offering = await db.offering.findUnique({ where: { id: offeringId }, include: { business: { select: { id: true, slug: true } } } });
  if (!offering || !offering.isBookable || !offering.durationMinutes) return { error: "This service can't be booked." };

  if (!checkAppointmentRateLimit(user.id)) {
    return { error: "You're requesting appointments too fast. Please slow down." };
  }

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || startsAt < new Date()) return { error: "Choose a valid, upcoming time." };
  const endsAt = new Date(startsAt.getTime() + offering.durationMinutes * 60 * 1000);
  if (notes.length > 1000) return { error: "Notes must be 1000 characters or fewer." };

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId: offering.business.id,
        teamMemberId: null,
        status: { not: "cancelled" },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (conflict) return null;

    return tx.appointment.create({
      data: { businessId: offering.business.id, offeringId: offering.id, customerId: user.id, startsAt, endsAt, notes: notes || null },
    });
  });

  if (!result) return { error: "That slot was just taken. Please pick another." };

  const staff = await db.businessMember.findMany({
    where: { businessId: offering.business.id, role: { in: ["owner", "admin"] } },
    select: { userId: true },
  });
  await Promise.all(
    staff.map((m) =>
      notifyAppointmentRequest({ recipientId: m.userId, actorId: user.id, businessSlug: offering.business.slug })
    )
  );

  revalidatePath(`/b/${offering.business.slug}/appointments`);
  return undefined;
}

// business-staff-tier (owner|admin) per build plan step 8.
export async function confirmAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!appointment || appointment.status !== "requested") return;
  if (!(await isBusinessStaff(appointment.business.id, user.id))) return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "confirmed" } });
  await notifyAppointmentConfirmed({ recipientId: appointment.customerId, actorId: user.id, businessSlug: appointment.business.slug });

  revalidatePath(`/b/${appointment.business.slug}/appointments/manage`);
  revalidatePath(`/b/${appointment.business.slug}/appointments`);
}

export async function cancelAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!appointment || appointment.status === "cancelled") return;
  if (!(await isBusinessStaff(appointment.business.id, user.id))) return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "cancelled" } });
  await notifyAppointmentCancelled({ recipientId: appointment.customerId, actorId: user.id, businessSlug: appointment.business.slug });

  revalidatePath(`/b/${appointment.business.slug}/appointments/manage`);
  revalidatePath(`/b/${appointment.business.slug}/appointments`);
}

// customer-facing cancel — no staff notification (spec §13 only wires
// appointment_cancelled to the customer, for the business-initiated
// direction above; the customer already knows they cancelled their own).
export async function cancelMyAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: { select: { slug: true } } },
  });
  if (!appointment || appointment.customerId !== user.id || appointment.status === "cancelled") return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "cancelled" } });
  revalidatePath(`/b/${appointment.business.slug}/appointments`);
}
