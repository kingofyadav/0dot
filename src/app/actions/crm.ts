"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isBusinessStaff } from "@/lib/businesses";
import type { ActionState } from "@/app/actions/auth";

const STAGES = new Set(["lead", "customer", "churned"]);

export async function updateContactStage(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const contactId = String(formData.get("contactId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!STAGES.has(stage)) return;

  const contact = await db.contact.findUnique({ where: { id: contactId }, include: { business: { select: { slug: true } } } });
  if (!contact || !(await isBusinessStaff(contact.businessId, user.id))) return;

  await db.contact.update({ where: { id: contactId }, data: { stage } });
  revalidatePath(`/b/${contact.business.slug}/manage/crm`);
}

export async function addManualActivity(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const contactId = String(formData.get("contactId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 1 || note.length > 2000) return { error: "Note must be 1-2000 characters." };

  const contact = await db.contact.findUnique({ where: { id: contactId }, include: { business: { select: { slug: true } } } });
  if (!contact) return { error: "Contact not found." };
  if (!(await isBusinessStaff(contact.businessId, user.id))) return { error: "You don't have permission." };

  await db.contact.update({ where: { id: contactId }, data: { notes: note } });
  await db.activity.create({ data: { contactId, activityType: "manual_note" } });

  revalidatePath(`/b/${contact.business.slug}/manage/crm`);
  return undefined;
}

export async function createManualContact(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  if (!(await isBusinessStaff(businessId, user.id))) return { error: "You don't have permission." };

  const externalName = String(formData.get("externalName") ?? "").trim() || null;
  const externalEmail = String(formData.get("externalEmail") ?? "").trim() || null;
  if (!externalName && !externalEmail) return { error: "Enter a name or email." };

  const business = await db.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (!business) return { error: "Business not found." };

  await db.contact.create({ data: { businessId, externalName, externalEmail } });

  revalidatePath(`/b/${business.slug}/manage/crm`);
  return undefined;
}
