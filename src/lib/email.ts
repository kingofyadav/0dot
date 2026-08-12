import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { db } from "@/lib/db";

// phase-5 spec §10: needs "a transactional email sending dependency (infra
// concern outside any spec)" per the build plan. Same delegation pattern
// as payments.ts's PaymentProcessor — an interface every caller goes
// through, plus a stub implementation that never touches a real mail
// provider, so swapping in Resend/SES/etc. later means writing a second
// class and changing getEmailSender() below, nothing above this file.
export interface EmailSender {
  readonly name: string;
  send(params: { to: string; subject: string; html: string }): Promise<{ status: "sent" | "failed" }>;
}

// Stub only — logs instead of delivering. Loudly not a real send, same
// "flag it, don't silently pretend it's production-grade" posture as
// StubPaymentProcessor and protected-storage.ts's dev-only token secret.
class ConsoleEmailSender implements EmailSender {
  readonly name = "console-stub";

  async send(params: { to: string; subject: string; html: string }): Promise<{ status: "sent" | "failed" }> {
    console.log(`[email stub] to=${params.to} subject=${JSON.stringify(params.subject)}`);
    return { status: "sent" };
  }
}

// Generic SMTP relay via nodemailer — works with any provider that exposes
// an SMTP endpoint (SES, Postmark, Mailgun, Resend, a self-hosted MTA on the
// same VPS as the app), so this seam doesn't lock the deploy into one
// vendor's HTTP API. Selected automatically by getEmailSender() below
// whenever SMTP_HOST is set.
class SmtpEmailSender implements EmailSender {
  readonly name = "smtp";
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    this.from = requireEnv("EMAIL_FROM");
    this.transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(process.env.SMTP_PORT ?? 587),
      // Port 465 is implicit TLS; everything else (587, 25) starts
      // plaintext and upgrades via STARTTLS, which nodemailer does on its
      // own when secure is false.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  async send(params: { to: string; subject: string; html: string }): Promise<{ status: "sent" | "failed" }> {
    try {
      await this.transporter.sendMail({ from: this.from, to: params.to, subject: params.subject, html: params.html });
      return { status: "sent" };
    } catch (err) {
      console.error(`[email] send to ${params.to} failed:`, err);
      return { status: "failed" };
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set but SMTP_HOST is — both are required to send real email.`);
  return value;
}

// Provisioned via the Vercel Marketplace (Resend). Takes priority over the
// generic SMTP relay below when both happen to be configured — this is the
// integration actually wired up for this deployment, not a hypothetical
// second option.
class ResendEmailSender implements EmailSender {
  readonly name = "resend";
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    this.client = new Resend(requireEnv("RESEND_API_KEY"));
    this.from = process.env.EMAIL_FROM ?? `0dot <no-reply@${requireEnv("RESEND_EMAIL_DOMAIN")}>`;
  }

  async send(params: { to: string; subject: string; html: string }): Promise<{ status: "sent" | "failed" }> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error(`[email] Resend send to ${params.to} failed:`, error);
      return { status: "failed" };
    }
    return { status: "sent" };
  }
}

let sender: EmailSender | undefined;

export function getEmailSender(): EmailSender {
  if (!sender) {
    sender = process.env.RESEND_API_KEY ? new ResendEmailSender() : process.env.SMTP_HOST ? new SmtpEmailSender() : new ConsoleEmailSender();
  }
  return sender;
}

// Absolute origin for links embedded in outgoing email (verification,
// password reset, newsletter unsubscribe) — relative URLs make no sense
// once they leave the browser. Same env var newsletter.ts already read
// before this was centralized here.
export function getAppOrigin(): string {
  return process.env.APP_ORIGIN ?? "http://localhost:3000";
}

// account-settings-hardening addendum §8: a smaller subset than push's own
// curated type list (push.ts's dispatchPushEvent has no equivalent
// allowlist — its uncurated types are the mandatory/system-generated ones,
// always-on by design, no toggle needed) — high-frequency, low-value types
// (like, mention, comment) that are fine as a push buzz are noise in an
// inbox, so they're excluded from email delivery entirely here, not just
// defaulted off. Canonical source for both dispatchEmailEvent's allowlist
// check below and the settings page's toggle list
// (notifications/page.tsx), so the two can't drift apart.
export const EMAIL_NOTIFICATION_TYPES = [
  "message",
  "new_follower",
  "community_update",
  "tip_received",
  "new_subscriber",
  "event_cancelled",
  "ticket_purchased",
  "appointment_request",
] as const;

const EMAIL_ELIGIBLE_TYPES = new Set<string>(EMAIL_NOTIFICATION_TYPES);

// account-settings-hardening addendum §8: the email counterpart to
// push.ts's dispatchPushEvent — same call-site shape (dynamic import from
// notifications.ts's createNotification, to avoid a load-time cycle since
// this needs getNotificationVerb from that module), same "generic verb
// text, never a rendering of private content" sensitivity-inheritance
// posture, same per-(user, type, channel) NotificationDeliveryPreference
// row this addendum's settings page (notifications/page.tsx's
// EMAIL_NOTIFICATION_TYPES) already writes to and reads back — that page's
// own comment flagged "no email-sending wired up yet" as the reason it
// only controlled a future sender; this is that sender. Never throws: an
// email failure must not break the in-app notification it's mirroring.
export async function dispatchEmailEvent(args: { recipientId: string; type: string; subjectType: string; subjectId: string }): Promise<void> {
  try {
    if (!EMAIL_ELIGIBLE_TYPES.has(args.type)) return;

    const pref = await db.notificationDeliveryPreference.findUnique({
      where: { userId_notificationType_channel: { userId: args.recipientId, notificationType: args.type, channel: "email" } },
    });
    // spec §4.1's data model (reused for email by the addendum): "enabled
    // boolean, default true" — no row means never opted out, not off.
    if (pref && !pref.enabled) return;

    const recipient = await db.user.findUnique({ where: { id: args.recipientId }, select: { email: true, emailVerifiedAt: true } });
    if (!recipient || !recipient.emailVerifiedAt) return; // unverified addresses never receive mail, same posture as every other outbound sender in this codebase

    const { getNotificationVerb } = await import("@/lib/notifications");
    const verb = getNotificationVerb(args.type, args.subjectType);
    if (!verb) return; // no generic copy exists for this type — same "deliberately partial" catalog dispatchPushEvent/dispatchWebhookEvent already accept

    // Sent as-is, not prefixed with "Someone"/an actor name — same
    // convention dispatchPushEvent already established for this shared
    // verb catalog (some entries are third-person action phrases, others
    // are already complete standalone sentences; the catalog itself
    // doesn't distinguish, so neither delivery channel tries to).
    const notificationsUrl = `${getAppOrigin()}/notifications`;
    await getEmailSender().send({
      to: recipient.email,
      subject: "0dot",
      html: `<p>${verb}.</p><p><a href="${notificationsUrl}">Open 0dot</a></p>`,
    });
  } catch {
    // Best-effort, same posture as dispatchPushEvent/dispatchWebhookEvent.
  }
}
