import "server-only";

// A thin, level-tagged logging wrapper — NOT a logging framework. It exists
// so the ~dozen ad hoc `console.error` call sites across src/app and src/lib
// emit a consistent, greppable shape, and so there's one place to also
// forward errors/warnings to Sentry once a DSN is configured (the sink is
// wired in src/instrumentation.ts's register()). Deliberately server-only:
// browser logging is a different concern handled by
// src/instrumentation-client.ts.
//
// Usage:
//   logger.error("cron.trending failed", err, { durationMs });
//   logger.warn("stripe webhook: unknown event type", undefined, { type });
//   logger.info("cron.trending ok", undefined, { recomputed });

type LogContext = Record<string, unknown>;

let sentryCapture:
  | ((level: "error" | "warning", message: string, error: unknown, context?: LogContext) => void)
  | null = null;

// Wired by src/instrumentation.ts's register() at init time (only when a DSN
// is set) so this module has no hard dependency on @sentry/nextjs — keeps
// `logger` importable from anywhere, including code paths Sentry doesn't
// instrument.
export function registerLogSink(
  fn: (level: "error" | "warning", message: string, error: unknown, context?: LogContext) => void,
): void {
  sentryCapture = fn;
}

function line(level: string, message: string, context?: LogContext): string {
  const suffix = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `[${level}] ${message}${suffix}`;
}

export const logger = {
  error(message: string, error?: unknown, context?: LogContext): void {
    console.error(line("error", message, context), error ?? "");
    sentryCapture?.("error", message, error, context);
  },
  warn(message: string, error?: unknown, context?: LogContext): void {
    console.warn(line("warn", message, context), error ?? "");
    sentryCapture?.("warning", message, error, context);
  },
  info(message: string, _error?: unknown, context?: LogContext): void {
    console.info(line("info", message, context));
  },
};
