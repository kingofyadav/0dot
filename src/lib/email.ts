import "server-only";

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

const sender: EmailSender = new ConsoleEmailSender();

export function getEmailSender(): EmailSender {
  return sender;
}
