"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { canManageOfferingOwner, isOfferingOwnerStaff, resolveOfferingOwner } from "@/lib/offerings";
import { notifyAppointmentRequest, notifyAppointmentConfirmed, notifyAppointmentCancelled } from "@/lib/notifications";
import { recordCrmActivity } from "@/lib/crm";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

// Shared by requestAppointment/confirmAppointment/cancelAppointment —
// resolves the manage/booking path for either owner kind, same shape
// offerings.ts's offeringManagePath uses.
async function offeringOwnerPath(owner: { businessId: string | null; sellerUserId: string | null }): Promise<string> {
  if (owner.businessId) {
    const business = await db.business.findUnique({ where: { id: owner.businessId }, select: { slug: true } });
    return `/b/${business!.slug}/appointments`;
  }
  const username = await db.username.findUnique({ where: { userId: owner.sellerUserId! }, select: { handle: true } });
  return `/s/${username!.handle}/monetization/services`;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkAppointmentRateLimit(userId: string): boolean {
  return checkRateLimit(`appointment:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
}

// canManageOfferingOwner-tier (business: owner|admin|editor; individual:
// the seller themself) — same tier that manages the bookable offerings
// this availability is scoped to. Business-level only within a business
// (teamMemberId stays null, see AvailabilityRule's schema comment for why)
// — phase-9 spec §3.2 extends the owner kind, not the per-staff scope.
export async function createAvailabilityRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const ownerType = String(formData.get("ownerType") ?? "business");
  const ownerId = String(formData.get("businessId") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startsAtLocal = String(formData.get("startsAtLocal") ?? "");
  const endsAtLocal = String(formData.get("endsAtLocal") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();

  const owner = await resolveOfferingOwner(user.id, ownerType, ownerId);
  if ("error" in owner) return;
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;
  if (!TIME_PATTERN.test(startsAtLocal) || !TIME_PATTERN.test(endsAtLocal) || startsAtLocal >= endsAtLocal) return;
  if (!timezone) return;

  await db.availabilityRule.create({
    data: { ...owner, dayOfWeek, startsAtLocal, endsAtLocal, timezone },
  });

  revalidatePath(owner.businessId ? await offeringOwnerPath(owner) + "/manage" : await offeringOwnerPath(owner));
}

export async function deleteAvailabilityRule(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) return;

  const rule = await db.availabilityRule.findUnique({ where: { id: ruleId } });
  if (!rule) return;
  if (!(await canManageOfferingOwner(rule, user.id))) return;

  await db.availabilityRule.delete({ where: { id: ruleId } });
  revalidatePath(rule.businessId ? (await offeringOwnerPath(rule)) + "/manage" : await offeringOwnerPath(rule));
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

  const owner = { businessId: offering.businessId, sellerUserId: offering.sellerUserId };

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        ...owner,
        teamMemberId: null,
        status: { not: "cancelled" },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (conflict) return null;

    return tx.appointment.create({
      data: { ...owner, offeringId: offering.id, customerId: user.id, startsAt, endsAt, notes: notes || null },
    });
  });

  if (!result) return { error: "That slot was just taken. Please pick another." };

  // CRM (phase-16 spec §13.2): only businesses have a Contact/Activity
  // feed in this MVP — an individual seller's offering has no businessId
  // to attach one to.
  if (offering.businessId) {
    await recordCrmActivity({
      businessId: offering.businessId,
      activityType: "appointment",
      sourceId: result.id,
      identity: { userId: user.id },
    });
  }

  if (offering.business) {
    const staff = await db.businessMember.findMany({
      where: { businessId: offering.business.id, role: { in: ["owner", "admin"] } },
      select: { userId: true },
    });
    await Promise.all(
      staff.map((m) =>
        notifyAppointmentRequest({ recipientId: m.userId, actorId: user.id, businessSlug: offering.business!.slug })
      )
    );
  } else {
    const sellerUsername = await db.username.findUnique({ where: { userId: offering.sellerUserId! }, select: { handle: true } });
    await notifyAppointmentRequest({ recipientId: offering.sellerUserId!, actorId: user.id, sellerHandle: sellerUsername!.handle });
  }

  revalidatePath(await offeringOwnerPath(owner));
  return undefined;
}

// business-staff-tier (owner|admin) for a business, the seller themself for
// an individual — per build plan step 8, extended by phase-9 spec §3.2.
export async function confirmAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.status !== "requested") return;
  if (!(await isOfferingOwnerStaff(appointment, user.id))) return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "confirmed" } });
  if (appointment.businessId) {
    const business = await db.business.findUnique({ where: { id: appointment.businessId }, select: { slug: true } });
    await notifyAppointmentConfirmed({ recipientId: appointment.customerId, actorId: user.id, businessSlug: business!.slug });
  } else {
    const sellerUsername = await db.username.findUnique({ where: { userId: appointment.sellerUserId! }, select: { handle: true } });
    await notifyAppointmentConfirmed({ recipientId: appointment.customerId, actorId: user.id, sellerHandle: sellerUsername!.handle });
  }

  revalidatePath(await offeringOwnerPath(appointment));
  if (appointment.businessId) {
    const business = await db.business.findUnique({ where: { id: appointment.businessId }, select: { slug: true } });
    revalidatePath(`/b/${business!.slug}/appointments/manage`);
  }
}

export async function cancelAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.status === "cancelled") return;
  if (!(await isOfferingOwnerStaff(appointment, user.id))) return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "cancelled" } });
  if (appointment.businessId) {
    const business = await db.business.findUnique({ where: { id: appointment.businessId }, select: { slug: true } });
    await notifyAppointmentCancelled({ recipientId: appointment.customerId, actorId: user.id, businessSlug: business!.slug });
    revalidatePath(`/b/${business!.slug}/appointments/manage`);
  } else {
    const sellerUsername = await db.username.findUnique({ where: { userId: appointment.sellerUserId! }, select: { handle: true } });
    await notifyAppointmentCancelled({ recipientId: appointment.customerId, actorId: user.id, sellerHandle: sellerUsername!.handle });
  }

  revalidatePath(await offeringOwnerPath(appointment));
}

// customer-facing cancel — no staff notification (spec §13 only wires
// appointment_cancelled to the customer, for the business-initiated
// direction above; the customer already knows they cancelled their own).
export async function cancelMyAppointment(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.customerId !== user.id || appointment.status === "cancelled") return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "cancelled" } });
  revalidatePath(await offeringOwnerPath(appointment));
}
