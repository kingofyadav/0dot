// spec §6: which Profile/WorkExperience fields show on the card — fixed
// set, not a free-form key. Split from business-card.ts (which pulls in
// db.ts and its "server-only" import) so CardForm.tsx, a Client Component,
// can reference the same key list without bundling server-only code.
export const CARD_FIELD_KEYS = ["bio", "workTitle", "email", "socialLinks"] as const;
export type CardFieldKey = (typeof CARD_FIELD_KEYS)[number];
