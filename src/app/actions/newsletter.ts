"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getEmailSender, getAppOrigin } from "@/lib/email";
import { hasTierAccess } from "@/lib/tier-access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same "user id when logged in, IP when not" convention as
// business-contact.ts's checkContactRateLimit — this form is unauthenticated
// per spec §10.1 (email-only subscribers are allowed), so it needs the same
// IP fallback that action established for the same reason.
function checkSubscribeRateLimit(key: string): boolean {
  return checkRateLimit(`newsletter-subscribe:${key}`, { max: 5, windowMs: 15 * 60 * 1000 });
}

// spec §10: subscriberUserId is set when the caller is signed in (so
// tier-gated issues can later be checked against their real account), but
// the form itself never requires an account — spec §10.1 explicitly allows
// email-only subscribers with no 0dot account, so this deliberately
// doesn't call requireVerifiedUser.
export async function subscribeNewsletter(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const creatorId = String(formData.get("creatorId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { error: "Enter a valid email address." };

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { id: true } });
  if (!creator) return { error: "Creator not found." };

  const currentUser = await getCurrentUser();

  const rateLimitKey = currentUser ? `user:${currentUser.id}` : `ip:${await getClientIp()}`;
  if (!checkSubscribeRateLimit(rateLimitKey)) {
    return { error: "Too many attempts. Please try again later." };
  }

  const existing = await db.newsletterSubscription.findUnique({
    where: { creatorId_subscriberEmail: { creatorId, subscriberEmail: email } },
  });
  if (existing) {
    if (existing.unsubscribedAt) {
      // Re-subscribing after a prior unsubscribe is a deliberate re-opt-in,
      // not silently ignored — the unique constraint means this must be an
      // update, not a second row.
      await db.newsletterSubscription.update({ where: { id: existing.id }, data: { unsubscribedAt: null } });
      return undefined;
    }
    return { error: "You're already subscribed." };
  }

  await db.newsletterSubscription.create({
    data: {
      creatorId,
      subscriberUserId: currentUser?.id ?? null,
      subscriberEmail: email,
      unsubscribeToken: randomBytes(24).toString("hex"),
    },
  });

  return undefined;
}

// spec §10.2: the one-click unsubscribe link's target — a GET route
// (src/app/newsletter/unsubscribe/[token]/route.ts) calls this directly,
// not wrapped in a form, since a one-click legal requirement means no
// extra confirmation step. unsubscribedAt is a terminal flag, never
// cleared by this path (re-subscribing is the only way back in, via
// subscribeNewsletter above).
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const result = await db.newsletterSubscription.updateMany({
    where: { unsubscribeToken: token, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });
  return result.count > 0;
}

export async function createIssue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const subject = String(formData.get("subject") ?? "").trim();
  if (subject.length < 1 || subject.length > 150) return { error: "Subject must be 1-150 characters." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Write something in the issue body." };

  const requiredTierIdRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
  let requiredTierId: string | null = null;
  if (requiredTierIdRaw) {
    const tier = await db.membershipTier.findUnique({ where: { id: requiredTierIdRaw }, select: { creatorId: true } });
    if (!tier || tier.creatorId !== user.id) return { error: "Choose one of your own membership tiers." };
    requiredTierId = requiredTierIdRaw;
  }

  await db.newsletterIssue.create({ data: { creatorId: user.id, subject, body, requiredTierId } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function updateIssue(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const issueId = String(formData.get("issueId") ?? "");

  const issue = await db.newsletterIssue.findUnique({ where: { id: issueId } });
  if (!issue || issue.creatorId !== user.id) return { error: "You don't have permission to manage this issue." };
  if (issue.status !== "draft") return { error: "A sent issue can't be edited." };

  const subject = String(formData.get("subject") ?? "").trim();
  if (subject.length < 1 || subject.length > 150) return { error: "Subject must be 1-150 characters." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Write something in the issue body." };

  const requiredTierIdRaw = String(formData.get("requiredTierId") ?? "").trim() || null;
  let requiredTierId: string | null = null;
  if (requiredTierIdRaw) {
    const tier = await db.membershipTier.findUnique({ where: { id: requiredTierIdRaw }, select: { creatorId: true } });
    if (!tier || tier.creatorId !== user.id) return { error: "Choose one of your own membership tiers." };
    requiredTierId = requiredTierIdRaw;
  }

  await db.newsletterIssue.update({ where: { id: issue.id }, data: { subject, body, requiredTierId } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function deleteIssue(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const issueId = String(formData.get("issueId") ?? "");
  if (!issueId) return;

  const issue = await db.newsletterIssue.findUnique({ where: { id: issueId } });
  if (!issue || issue.creatorId !== user.id || issue.status !== "draft") return;

  await db.newsletterIssue.delete({ where: { id: issueId } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

function bodyToEmailHtml(body: string): string {
  const escaped = body.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// spec §10.2/§10.3: sends synchronously to every subscriber who hasn't
// unsubscribed, honoring the gate at send time (a paid-only issue skips a
// subscriber without current tier access, spec §10.3's second criterion) —
// re-checked here, not cached from subscribe time. Every email gets a
// one-click unsubscribe link built from that subscription's own token
// (§10.2's legal requirement, not a UX nicety). Email-only subscribers
// (no subscriberUserId) can never satisfy a tier requirement, so they're
// skipped for gated issues, not sent an inaccessible teaser.
export async function sendIssue(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const issueId = String(formData.get("issueId") ?? "");
  if (!issueId) return;

  const issue = await db.newsletterIssue.findUnique({ where: { id: issueId } });
  if (!issue || issue.creatorId !== user.id || issue.status !== "draft") return;

  const subscriptions = await db.newsletterSubscription.findMany({
    where: { creatorId: user.id, unsubscribedAt: null },
  });

  const sender = getEmailSender();
  const html = bodyToEmailHtml(issue.body);

  let attempted = 0;
  let delivered = 0;
  for (const sub of subscriptions) {
    if (issue.requiredTierId) {
      const hasAccess = sub.subscriberUserId
        ? await hasTierAccess(sub.subscriberUserId, user.id, issue.requiredTierId)
        : false;
      if (!hasAccess) continue;
    }

    const unsubscribeUrl = `${getAppOrigin()}/newsletter/unsubscribe/${sub.unsubscribeToken}`;
    attempted++;
    const result = await sender.send({
      to: sub.subscriberEmail,
      subject: issue.subject,
      html: `${html}\n<p><a href="${unsubscribeUrl}">Unsubscribe</a></p>`,
    });
    if (result.status === "sent") delivered++;
  }

  // Same fire-and-forget gap signup()/account-contact's sends had: this
  // used to flip to "sent" unconditionally, so a full provider outage
  // (every send in the loop failing) still told the creator the issue went
  // out. A partial failure still counts as sent — same as any real bulk
  // sender, and there's no per-recipient retry UI to send it to anyway —
  // but a total failure leaves status as "draft" so the same Send button
  // is the retry path instead of a dashboard that silently lies.
  if (attempted > 0 && delivered === 0) return;

  await db.newsletterIssue.update({ where: { id: issue.id }, data: { status: "sent", sentAt: new Date() } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}
