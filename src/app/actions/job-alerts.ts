"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

const EMPLOYMENT_TYPES = new Set(["", "full_time", "part_time", "contract", "internship"]);

export async function createJobAlert(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const employmentType = String(formData.get("employmentType") ?? "");
  if (!EMPLOYMENT_TYPES.has(employmentType)) return { error: "Choose a valid employment type." };

  const filterCriteria = {
    location: String(formData.get("location") ?? "").trim() || undefined,
    remote: formData.get("remote") === "true" || undefined,
    employmentType: employmentType || undefined,
    keywords: String(formData.get("keywords") ?? "").trim() || undefined,
  };

  await db.jobAlert.create({
    data: { userId: user.id, filterCriteria: JSON.stringify(filterCriteria) },
  });

  revalidatePath("/jobs/alerts");
  return undefined;
}

export async function deleteJobAlert(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const id = String(formData.get("alertId") ?? "");
  if (!id) return;

  const alert = await db.jobAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== user.id) return;

  await db.jobAlert.delete({ where: { id } });
  revalidatePath("/jobs/alerts");
}
