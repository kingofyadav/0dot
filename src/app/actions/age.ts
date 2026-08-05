"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";

// phase-12 spec §8.2: the existing-account backfill path — prompted at
// next login (AgeGatePrompt, layout.tsx) rather than silently backfilled
// or guessed. A rejected/malformed date leaves date_of_birth null, which
// keeps the account under the default protective restriction set (§8.4)
// exactly as if the prompt had never been answered.
export async function setDateOfBirth(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const raw = String(formData.get("dateOfBirth") ?? "");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return;

  const now = new Date();
  const earliestPlausible = new Date(now.getFullYear() - 130, now.getMonth(), now.getDate());
  if (parsed > now || parsed < earliestPlausible) return;

  await db.user.update({ where: { id: user.id }, data: { dateOfBirth: parsed } });
  // RootLayout is already dynamic (reads cookies() via getCurrentUser), so
  // no revalidatePath is needed for the prompt to disappear on next
  // navigation — this only clears the current path's own cache.
  revalidatePath("/");
}
