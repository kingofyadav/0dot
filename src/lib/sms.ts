import "server-only";

// addendum §2/§6: same "swappable interface, stub implementation" posture as
// email.ts's EmailSender and payments.ts's PaymentProcessor — no SMS
// provider exists in this codebase today (phone is collected at signup but
// never verified). Selecting a real provider later means writing a second
// class and changing getSmsSender() below, nothing above this file.
export interface SmsSender {
  readonly name: string;
  send(params: { to: string; body: string }): Promise<{ status: "sent" | "failed" }>;
}

// Stub only — logs instead of delivering, same "flag it, don't silently
// pretend it's production-grade" posture as ConsoleEmailSender.
class ConsoleSmsSender implements SmsSender {
  readonly name = "console-stub";

  async send(params: { to: string; body: string }): Promise<{ status: "sent" | "failed" }> {
    console.log(`[sms stub] to=${params.to} body=${JSON.stringify(params.body)}`);
    return { status: "sent" };
  }
}

// No real provider wired up — same "throws until configured" posture as
// SmtpEmailSender needing SMTP_HOST. Selected automatically by
// getSmsSender() below whenever SMS_PROVIDER is set to a value other than
// the (unset) default.
class UnconfiguredSmsSender implements SmsSender {
  readonly name = "unconfigured";

  async send(): Promise<{ status: "sent" | "failed" }> {
    throw new Error(`SMS_PROVIDER=${process.env.SMS_PROVIDER} is not a supported provider yet.`);
  }
}

let sender: SmsSender | undefined;

export function getSmsSender(): SmsSender {
  if (!sender) {
    sender = process.env.SMS_PROVIDER ? new UnconfiguredSmsSender() : new ConsoleSmsSender();
  }
  return sender;
}
