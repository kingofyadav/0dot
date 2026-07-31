"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isBusinessStaff } from "@/lib/businesses";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Not the shared ActionState (src/app/actions/auth.ts) — that type has no
// success signal because every other ActionState-returning action redirects
// on success. This one deliberately stays on /b/[slug] and needs to tell
// BusinessContactForm to swap in a confirmation instead.
export type ContactActionState = { error?: string; success?: true } | undefined;

function checkContactRateLimit(key: string): boolean {
  return checkRateLimit(`business-contact:${key}`, { max: 3, windowMs: 15 * 60 * 1000 });
}

// spec §6.1/§6.2: a public inbound form — no auth required to submit.
// Logged-in senders don't need to re-collect name/email (senderUserId
// identifies them); a logged-out visitor must supply both, the literal
// §6.2 acceptance criterion. Rate-limited per sender: user id when logged
// in, IP when not (build plan step 3) — not both, since a logged-out
// visitor has no user id to key on.
export async function sendContactMessage(
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const currentUser = await getCurrentUser();
  const businessId = String(formData.get("businessId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
  if (!business) return { error: "Business not found." };

  const rateLimitKey = currentUser ? `user:${currentUser.id}` : `ip:${await getClientIp()}`;
  if (!checkContactRateLimit(rateLimitKey)) {
    return { error: "You're sending messages too fast. Please slow down." };
  }

  if (body.length < 1 || body.length > 2000) {
    return { error: "Message must be 1-2000 characters." };
  }

  let senderName: string | null = null;
  let senderEmail: string | null = null;
  if (!currentUser) {
    senderName = String(formData.get("senderName") ?? "").trim();
    senderEmail = String(formData.get("senderEmail") ?? "").trim().toLowerCase();
    if (!senderName) return { error: "Name is required." };
    if (!EMAIL_PATTERN.test(senderEmail)) return { error: "A valid email is required." };
  }

  await db.contactMessage.create({
    data: {
      businessId: business.id,
      senderUserId: currentUser?.id ?? null,
      senderName,
      senderEmail,
      body,
    },
  });

  revalidatePath(`/b/${business.slug}/manage/contact`);
  return { success: true };
}

// admin+-tier (owner|admin) per spec §6.1's "visible to admin+ team
// members as a queue."
export async function markContactMessageRead(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const messageId = String(formData.get("messageId") ?? "");
  if (!messageId) return;

  const message = await db.contactMessage.findUnique({ where: { id: messageId } });
  if (!message) return;
  if (!(await isBusinessStaff(message.businessId, user.id))) return;

  await db.contactMessage.update({ where: { id: messageId }, data: { status: "read" } });

  const business = await db.business.findUnique({ where: { id: message.businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage/contact`);
}

export async function archiveContactMessage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const messageId = String(formData.get("messageId") ?? "");
  if (!messageId) return;

  const message = await db.contactMessage.findUnique({ where: { id: messageId } });
  if (!message) return;
  if (!(await isBusinessStaff(message.businessId, user.id))) return;

  await db.contactMessage.update({ where: { id: messageId }, data: { status: "archived" } });

  const business = await db.business.findUnique({ where: { id: message.businessId }, select: { slug: true } });
  if (business) revalidatePath(`/b/${business.slug}/manage/contact`);
}
