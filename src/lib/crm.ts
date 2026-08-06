import "server-only";
import { db } from "@/lib/db";

// phase-16 spec §13.2: most Activity rows are derived from data that
// already exists (ContactMessage/Appointment/OfferingPurchase) rather than
// manually re-entered. Called from each of those three creation sites —
// auto-upserts a Contact (keyed by userId when known, else externalEmail)
// so a business's existing customer touchpoints become a CRM activity feed
// for free (§13.3's acceptance criterion).
async function findOrCreateContact(
  businessId: string,
  identity: { userId?: string | null; externalName?: string | null; externalEmail?: string | null }
): Promise<string> {
  if (identity.userId) {
    const existing = await db.contact.findFirst({ where: { businessId, userId: identity.userId } });
    if (existing) return existing.id;
    const created = await db.contact.create({ data: { businessId, userId: identity.userId } });
    return created.id;
  }

  if (identity.externalEmail) {
    const existing = await db.contact.findFirst({ where: { businessId, externalEmail: identity.externalEmail } });
    if (existing) return existing.id;
  }

  const created = await db.contact.create({
    data: { businessId, externalName: identity.externalName ?? null, externalEmail: identity.externalEmail ?? null },
  });
  return created.id;
}

export async function recordCrmActivity(params: {
  businessId: string;
  activityType: "contact_message" | "appointment" | "purchase" | "manual_note";
  sourceId?: string;
  identity: { userId?: string | null; externalName?: string | null; externalEmail?: string | null };
}): Promise<void> {
  const contactId = await findOrCreateContact(params.businessId, params.identity);
  await db.activity.create({
    data: { contactId, activityType: params.activityType, sourceId: params.sourceId ?? null },
  });
}
