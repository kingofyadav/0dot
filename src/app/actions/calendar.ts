"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

export async function createCalendarEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return { error: "Choose a start date/time." };

  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "Invalid end date/time." };

  await db.calendarEntry.create({
    data: { profileId: user.profile!.id, title, startsAt, endsAt },
  });

  revalidatePath(`/s/${user.username!.handle}/calendar`);
  return undefined;
}

export async function deleteCalendarEntry(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("entryId") ?? "");
  if (!id) return;

  const entry = await db.calendarEntry.findUnique({ where: { id } });
  if (!entry || entry.profileId !== user.profile!.id) return;

  await db.calendarEntry.delete({ where: { id } });
  revalidatePath(`/s/${user.username!.handle}/calendar`);
}
