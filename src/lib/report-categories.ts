// phase-12 spec §4.1: shared between the "use server" fileReport action and
// the client ReportButton component. Can't live inside actions/reports.ts
// itself — a "use server" file may only export async functions, and this
// is a plain const array (plus its derived type), not a function.
export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "hate_speech",
  "violence",
  "sexual_content",
  "ip_infringement",
  "impersonation",
  "fraud",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
