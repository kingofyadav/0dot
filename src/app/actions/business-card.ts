"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { CARD_FIELD_KEYS } from "@/lib/card-fields";
import type { ActionState } from "@/app/actions/auth";

export async function updateBusinessCard(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const enabled = formData.get("enabled") === "true";
  const includedFields = CARD_FIELD_KEYS.filter((key) => formData.get(`field_${key}`) === "true");

  await db.digitalBusinessCard.upsert({
    where: { profileId: user.profile!.id },
    create: { profileId: user.profile!.id, enabled, includedFields: JSON.stringify(includedFields) },
    update: { enabled, includedFields: JSON.stringify(includedFields) },
  });

  revalidatePath(`/s/${user.username!.handle}/card`);
  revalidatePath(`/${user.username!.handle}/card`);
  return undefined;
}
