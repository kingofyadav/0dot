"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { validateEventSlugFormat } from "@/lib/reserved-event-slugs";
import { isBusinessStaff } from "@/lib/businesses";
import { isCommunityStaff } from "@/lib/communities";
import { isEventHost, getGoingAttendeeCount } from "@/lib/events";
import { getPaymentProcessor, recordPaymentTransaction } from "@/lib/payments";
import { notifyEventCancelled, notifyTicketPurchased } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

const FORMATS = new Set(["in_person", "virtual", "hybrid"]);
const VISIBILITIES = new Set(["public", "attendees_only", "host_only"]);

function checkCreateEventRateLimit(userId: string): boolean {
  return checkRateLimit(`event:create:user:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
}

function checkRsvpRateLimit(userId: string): boolean {
  return checkRateLimit(`event:rsvp:user:${userId}`, { max: 30, windowMs: 5 * 60 * 1000 });
}

function checkPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`event:ticket:purchase:user:${userId}`, { max: 20, windowMs: 15 * 60 * 1000 });
}

// spec §3.2: exactly one of the three hosted_by_* columns, checked here
// (not the DB — no partial/CHECK constraint support in this Prisma+SQLite
// setup, same standing limitation every other owner-XOR in this schema
// works around). Returns the column values to write, or an error.
async function resolveHost(
  userId: string,
  hostType: string,
  hostId: string
): Promise<
  | { hostedByUserId: string | null; hostedByBusinessId: string | null; hostedByCommunityId: string | null }
  | { error: string }
> {
  if (hostType === "self") {
    return { hostedByUserId: userId, hostedByBusinessId: null, hostedByCommunityId: null };
  }
  if (hostType === "business") {
    if (!hostId || !(await isBusinessStaff(hostId, userId))) {
      return { error: "You don't manage that business." };
    }
    return { hostedByUserId: null, hostedByBusinessId: hostId, hostedByCommunityId: null };
  }
  if (hostType === "community") {
    if (!hostId || !(await isCommunityStaff(hostId, userId))) {
      return { error: "You don't moderate that community." };
    }
    return { hostedByUserId: null, hostedByBusinessId: null, hostedByCommunityId: hostId };
  }
  return { error: "Choose who's hosting this event." };
}

function parseTimestamps(formData: FormData): { startsAt: Date; endsAt: Date | null } | { error: string } {
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return { error: "Choose a valid start time." };

  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  let endsAt: Date | null = null;
  if (endsAtRaw.length > 0) {
    endsAt = new Date(endsAtRaw);
    if (Number.isNaN(endsAt.getTime())) return { error: "Choose a valid end time." };
    if (endsAt < startsAt) return { error: "End time can't be before the start time." };
  }
  return { startsAt, endsAt };
}

// spec §3, build plan §1: the anchor entity. Created as `draft` — only the
// host/creator can see it (spec §3.4's acceptance criterion) until
// publishEvent explicitly flips it to `published`.
export async function createEvent(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkCreateEventRateLimit(user.id)) {
    return { error: "You're creating events too fast. Please slow down." };
  }

  const hostType = String(formData.get("hostType") ?? "self");
  const hostId = String(formData.get("hostId") ?? "");
  const host = await resolveHost(user.id, hostType, hostId);
  if ("error" in host) return { error: host.error };

  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const format = String(formData.get("format") ?? "in_person");
  const location = String(formData.get("location") ?? "").trim();
  const virtualJoinUrl = String(formData.get("virtualJoinUrl") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const attendeeListVisibility = String(formData.get("attendeeListVisibility") ?? "public");
  const capacityRaw = String(formData.get("capacity") ?? "").trim();

  if (title.length < 1 || title.length > 160) return { error: "Title must be 1-160 characters." };
  if (description.length > 10000) return { error: "Description is too long." };
  if (!FORMATS.has(format)) return { error: "Choose a valid format." };
  if (format !== "virtual" && location.length < 1) return { error: "Location is required for in-person or hybrid events." };
  if (timezone.length < 1) return { error: "Timezone is required." };
  if (!VISIBILITIES.has(attendeeListVisibility)) return { error: "Choose a valid attendee list visibility." };

  let capacity: number | null = null;
  if (capacityRaw.length > 0) {
    capacity = Number.parseInt(capacityRaw, 10);
    if (!Number.isInteger(capacity) || capacity < 1) return { error: "Capacity must be a positive whole number." };
  }

  const timestamps = parseTimestamps(formData);
  if ("error" in timestamps) return { error: timestamps.error };

  const slugError = validateEventSlugFormat(slug);
  if (slugError === "invalid_format") return { error: "Slug must be 3-60 characters: letters, numbers, underscore only." };
  if (slugError === "reserved") return { error: "That slug is reserved." };

  const existingSlug = await db.event.findUnique({ where: { slug } });
  if (existingSlug) return { error: "That slug is already taken." };

  let coverImageUrl: string | undefined;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  let event;
  try {
    event = await db.event.create({
      data: {
        slug,
        ...host,
        createdBy: user.id,
        title,
        description,
        coverImageUrl,
        format,
        location: format === "virtual" ? null : location,
        virtualJoinUrl: virtualJoinUrl.length > 0 ? virtualJoinUrl : null,
        startsAt: timestamps.startsAt,
        endsAt: timestamps.endsAt,
        timezone,
        capacity,
        attendeeListVisibility,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That slug is already taken." };
    }
    throw err;
  }

  redirect(`/e/${event.slug}`);
}

export async function updateEvent(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const eventId = String(formData.get("eventId") ?? "");

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: "Event not found." };
  if (!(await isEventHost(event, user.id))) return { error: "Only the host can edit this event." };
  if (event.status === "cancelled") return { error: "This event has been cancelled and can no longer be edited." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const format = String(formData.get("format") ?? event.format);
  const location = String(formData.get("location") ?? "").trim();
  const virtualJoinUrl = String(formData.get("virtualJoinUrl") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const attendeeListVisibility = String(formData.get("attendeeListVisibility") ?? event.attendeeListVisibility);
  const capacityRaw = String(formData.get("capacity") ?? "").trim();

  if (title.length < 1 || title.length > 160) return { error: "Title must be 1-160 characters." };
  if (description.length > 10000) return { error: "Description is too long." };
  if (!FORMATS.has(format)) return { error: "Choose a valid format." };
  if (format !== "virtual" && location.length < 1) return { error: "Location is required for in-person or hybrid events." };
  if (timezone.length < 1) return { error: "Timezone is required." };
  if (!VISIBILITIES.has(attendeeListVisibility)) return { error: "Choose a valid attendee list visibility." };

  let capacity: number | null = null;
  if (capacityRaw.length > 0) {
    capacity = Number.parseInt(capacityRaw, 10);
    if (!Number.isInteger(capacity) || capacity < 1) return { error: "Capacity must be a positive whole number." };
  }

  const timestamps = parseTimestamps(formData);
  if ("error" in timestamps) return { error: timestamps.error };

  let coverImageUrl: string | undefined;
  const coverFile = formData.get("coverImage");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    coverImageUrl = result.url;
  }

  await db.event.update({
    where: { id: eventId },
    data: {
      title,
      description,
      format,
      location: format === "virtual" ? null : location,
      virtualJoinUrl: virtualJoinUrl.length > 0 ? virtualJoinUrl : null,
      timezone,
      capacity,
      attendeeListVisibility,
      startsAt: timestamps.startsAt,
      endsAt: timestamps.endsAt,
      ...(coverImageUrl ? { coverImageUrl } : {}),
    },
  });

  revalidatePath(`/e/${event.slug}`);
  return undefined;
}

export async function publishEvent(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const eventId = String(formData.get("eventId") ?? "");

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "draft") return;
  if (!(await isEventHost(event, user.id))) return;

  await db.event.update({ where: { id: eventId }, data: { status: "published" } });
  revalidatePath(`/e/${event.slug}`);
  revalidatePath("/e");
}

// spec §8.2/§8.4: fans out event_cancelled to every current RSVP (going or
// interested) and every non-cancelled ticket holder, not ticket-holders-only.
export async function cancelEvent(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const eventId = String(formData.get("eventId") ?? "");

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event || event.status === "cancelled") return;
  if (!(await isEventHost(event, user.id))) return;

  await db.event.update({ where: { id: eventId }, data: { status: "cancelled" } });

  const [rsvps, tickets] = await Promise.all([
    db.eventRSVP.findMany({ where: { eventId, status: { in: ["going", "interested"] } }, select: { userId: true } }),
    db.ticket.findMany({
      where: { ticketType: { eventId }, status: { not: "cancelled" } },
      select: { ownerId: true },
    }),
  ]);
  const recipientIds = new Set([...rsvps.map((r) => r.userId), ...tickets.map((t) => t.ownerId)]);
  await Promise.all(
    [...recipientIds].map((recipientId) =>
      notifyEventCancelled({ recipientId, actorId: user.id, eventSlug: event.slug })
    )
  );

  revalidatePath(`/e/${event.slug}`);
  revalidatePath("/e");
}

// spec §4: going/interested/not_going. Capacity (§4.3) caps `going` only —
// `interested` never counts against it. Upsert on the unique (eventId,
// userId) pair rather than reject a repeat RSVP, since changing your mind
// (going -> not_going) is the normal case, not an error.
export async function rsvpToEvent(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["going", "interested", "not_going"].includes(status)) return { error: "Invalid RSVP status." };

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "published") return { error: "This event isn't accepting RSVPs." };

  if (!checkRsvpRateLimit(user.id)) return { error: "You're RSVPing too fast. Please slow down." };

  if (status === "going" && event.capacity !== null) {
    const existing = await db.eventRSVP.findUnique({ where: { eventId_userId: { eventId, userId: user.id } } });
    if (existing?.status !== "going") {
      const current = await getGoingAttendeeCount(eventId);
      if (current >= event.capacity) {
        return { error: "This event is at capacity." };
      }
    }
  }

  await db.eventRSVP.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id, status },
    update: { status },
  });

  revalidatePath(`/e/${event.slug}`);
  return undefined;
}

// spec §5.2/§5.4: rejects a paid tier for a community-hosted event — no
// monetization concept exists for communities in this system.
export async function createTicketType(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const eventId = String(formData.get("eventId") ?? "");

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: "Event not found." };
  if (!(await isEventHost(event, user.id))) return { error: "Only the host can add ticket types." };

  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const quantityRaw = String(formData.get("quantityTotal") ?? "").trim();

  if (name.length < 1 || name.length > 80) return { error: "Ticket name must be 1-80 characters." };

  let price: number | null = null;
  if (priceRaw.length > 0) {
    price = Math.round(Number(priceRaw) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive amount, or left blank for a free ticket." };
    if (event.hostedByCommunityId) return { error: "Community-hosted events can't sell paid tickets — RSVP-only for now." };
  }

  let quantityTotal: number | null = null;
  if (quantityRaw.length > 0) {
    quantityTotal = Number.parseInt(quantityRaw, 10);
    if (!Number.isInteger(quantityTotal) || quantityTotal < 1) return { error: "Quantity must be a positive whole number." };
  }

  await db.ticketType.create({
    data: {
      eventId,
      name,
      price,
      currency: price !== null ? "usd" : null,
      quantityTotal,
    },
  });

  revalidatePath(`/e/${event.slug}`);
  return undefined;
}

// spec §5.1/§5.4: a free ticket (TicketType.price null) skips the payment
// backbone entirely — no PaymentTransaction row, same "nullable price =
// free tier" shape Offering/DigitalProduct already use. A paid ticket
// reuses recordPaymentTransaction exactly (kind: "ticket_purchase"), never
// a parallel ledger. Payee resolves to the event's business payout account
// when business-hosted, otherwise the hosting/creating user's — mirroring
// sendTip's "payout account must already be active" gate rather than
// auto-provisioning one here.
export async function purchaseTicket(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const ticketTypeId = String(formData.get("ticketTypeId") ?? "");

  const ticketType = await db.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true },
  });
  if (!ticketType) return { error: "Ticket type not found." };
  const event = ticketType.event;
  if (event.status !== "published") return { error: "This event isn't accepting ticket purchases." };

  const now = new Date();
  if (ticketType.salesStartAt && now < ticketType.salesStartAt) return { error: "Ticket sales haven't opened yet." };
  if (ticketType.salesEndAt && now > ticketType.salesEndAt) return { error: "Ticket sales have closed." };
  if (ticketType.quantityTotal !== null && ticketType.quantitySold >= ticketType.quantityTotal) {
    return { error: "This ticket type is sold out." };
  }
  if (event.capacity !== null) {
    const current = await getGoingAttendeeCount(event.id);
    if (current >= event.capacity) return { error: "This event is at capacity." };
  }

  if (!checkPurchaseRateLimit(user.id)) return { error: "You're purchasing too fast. Please slow down." };

  const qrCodeToken = randomBytes(24).toString("hex");

  if (ticketType.price === null) {
    await db.$transaction([
      db.ticket.create({
        data: { ticketTypeId, ownerId: user.id, status: "valid", qrCodeToken },
      }),
      db.ticketType.update({ where: { id: ticketTypeId }, data: { quantitySold: { increment: 1 } } }),
    ]);
    await notifyTicketPurchased({ recipientId: user.id, eventSlug: event.slug });
    revalidatePath(`/e/${event.slug}`);
    return undefined;
  }

  let payeeId: string | null = null;
  let payeeBusinessId: string | null = null;
  if (event.hostedByBusinessId) {
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { businessId: event.hostedByBusinessId } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This host hasn't enabled payouts yet." };
    payeeBusinessId = event.hostedByBusinessId;
  } else {
    const hostUserId = event.hostedByUserId ?? event.createdBy;
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: hostUserId } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This host hasn't enabled payouts yet." };
    payeeId = hostUserId;
  }

  const charge = await getPaymentProcessor().charge({
    amount: ticketType.price,
    currency: ticketType.currency ?? "usd",
    payerId: user.id,
    payeeId: payeeId ?? payeeBusinessId ?? "",
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." };

  await db.$transaction(async (tx) => {
    const transaction = await recordPaymentTransaction(tx, {
      kind: "ticket_purchase",
      payerId: user.id,
      payeeId,
      payeeBusinessId,
      amount: ticketType.price!,
      currency: ticketType.currency ?? "usd",
      processorReference: charge.processorReference,
      status: "succeeded",
      relatedObjectType: "ticket",
    });
    await tx.ticket.create({
      data: { ticketTypeId, ownerId: user.id, status: "valid", qrCodeToken, paymentTransactionId: transaction.id },
    });
    await tx.ticketType.update({ where: { id: ticketTypeId }, data: { quantitySold: { increment: 1 } } });
  });

  await notifyTicketPurchased({ recipientId: user.id, eventSlug: event.slug });
  revalidatePath(`/e/${event.slug}`);
  return undefined;
}

// spec §5.3: check-in is ticketed-events-only for now. Host-only, matches a
// ticket by its qrCodeToken (the at-door scan flow) rather than a bare
// ticket id, since the token is the actual access-control credential.
export async function checkInTicket(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const qrCodeToken = String(formData.get("qrCodeToken") ?? "").trim();

  const ticket = await db.ticket.findUnique({
    where: { qrCodeToken },
    include: { ticketType: { include: { event: true } } },
  });
  if (!ticket) return { error: "Ticket not found." };
  const event = ticket.ticketType.event;
  if (!(await isEventHost(event, user.id))) return { error: "Only the host can check in attendees." };
  if (ticket.status === "cancelled") return { error: "This ticket was cancelled." };
  if (ticket.status === "checked_in") return { error: "Already checked in." };

  await db.ticket.update({ where: { id: ticket.id }, data: { status: "checked_in", checkedInAt: new Date() } });
  revalidatePath(`/e/${event.slug}`);
  return undefined;
}
