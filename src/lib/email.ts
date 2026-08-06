import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

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

let sender: EmailSender | undefined;

export function getEmailSender(): EmailSender {
  if (!sender) {
    sender = process.env.SMTP_HOST ? new SmtpEmailSender() : new ConsoleEmailSender();
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
