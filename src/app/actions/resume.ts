"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { saveDocumentFile } from "@/lib/uploads";
import type { ActionState } from "@/app/actions/auth";

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateResumePaths(handle: string): void {
  revalidatePath(`/s/${handle}`);
  revalidatePath(`/${handle}/resume`);
}

export async function addWorkExperience(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const company = String(formData.get("company") ?? "").trim();
  if (company.length < 1 || company.length > 100) return { error: "Company must be 1-100 characters." };
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 100) return { error: "Title must be 1-100 characters." };
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const startDate = parseDate(formData.get("startDate"));
  if (!startDate) return { error: "Start date is required." };
  const endDate = parseDate(formData.get("endDate"));

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  const count = await db.workExperience.count({ where: { profileId: profile.id } });
  await db.workExperience.create({
    data: { profileId: profile.id, company, title, location, description, startDate, endDate, position: count },
  });

  if (user.username) revalidateResumePaths(user.username.handle);
  return undefined;
}

export async function updateWorkExperience(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const id = String(formData.get("workExperienceId") ?? "");

  const existing = await db.workExperience.findUnique({ where: { id }, include: { profile: true } });
  if (!existing || existing.profile.userId !== user.id) return { error: "Not found." };

  const company = String(formData.get("company") ?? "").trim();
  if (company.length < 1 || company.length > 100) return { error: "Company must be 1-100 characters." };
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 100) return { error: "Title must be 1-100 characters." };
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const startDate = parseDate(formData.get("startDate"));
  if (!startDate) return { error: "Start date is required." };
  const endDate = parseDate(formData.get("endDate"));

  await db.workExperience.update({
    where: { id },
    data: { company, title, location, description, startDate, endDate },
  });

  if (user.username) revalidateResumePaths(user.username.handle);
  return undefined;
}

export async function deleteWorkExperience(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("workExperienceId") ?? "");
  if (!id) return;

  const existing = await db.workExperience.findUnique({ where: { id }, include: { profile: true } });
  if (!existing || existing.profile.userId !== user.id) return;

  await db.workExperience.delete({ where: { id } });
  if (user.username) revalidateResumePaths(user.username.handle);
}

// Same swap-adjacent-position convention as moveLink/moveSkill.
export async function moveWorkExperience(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("workExperienceId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;

  const item = await db.workExperience.findUnique({ where: { id }, include: { profile: true } });
  if (!item || item.profile.userId !== user.id) return;

  const siblings = await db.workExperience.findMany({ where: { profileId: item.profileId }, orderBy: { position: "asc" } });
  const index = siblings.findIndex((s) => s.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const other = siblings[swapIndex];
  await db.$transaction([
    db.workExperience.update({ where: { id: item.id }, data: { position: other.position } }),
    db.workExperience.update({ where: { id: other.id }, data: { position: item.position } }),
  ]);
  if (user.username) revalidateResumePaths(user.username.handle);
}

export async function addEducation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const institution = String(formData.get("institution") ?? "").trim();
  if (institution.length < 1 || institution.length > 100) return { error: "Institution must be 1-100 characters." };
  const degree = String(formData.get("degree") ?? "").trim() || null;
  const fieldOfStudy = String(formData.get("fieldOfStudy") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1000) return { error: "Description must be 1000 characters or fewer." };

  const startDate = parseDate(formData.get("startDate"));
  if (!startDate) return { error: "Start date is required." };
  const endDate = parseDate(formData.get("endDate"));

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  const count = await db.education.count({ where: { profileId: profile.id } });
  await db.education.create({
    data: { profileId: profile.id, institution, degree, fieldOfStudy, description, startDate, endDate, position: count },
  });

  if (user.username) revalidateResumePaths(user.username.handle);
  return undefined;
}

export async function updateEducation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();
  const id = String(formData.get("educationId") ?? "");

  const existing = await db.education.findUnique({ where: { id }, include: { profile: true } });
  if (!existing || existing.profile.userId !== user.id) return { error: "Not found." };

  const institution = String(formData.get("institution") ?? "").trim();
  if (institution.length < 1 || institution.length > 100) return { error: "Institution must be 1-100 characters." };
  const degree = String(formData.get("degree") ?? "").trim() || null;
  const fieldOfStudy = String(formData.get("fieldOfStudy") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1000) return { error: "Description must be 1000 characters or fewer." };

  const startDate = parseDate(formData.get("startDate"));
  if (!startDate) return { error: "Start date is required." };
  const endDate = parseDate(formData.get("endDate"));

  await db.education.update({
    where: { id },
    data: { institution, degree, fieldOfStudy, description, startDate, endDate },
  });

  if (user.username) revalidateResumePaths(user.username.handle);
  return undefined;
}

export async function deleteEducation(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("educationId") ?? "");
  if (!id) return;

  const existing = await db.education.findUnique({ where: { id }, include: { profile: true } });
  if (!existing || existing.profile.userId !== user.id) return;

  await db.education.delete({ where: { id } });
  if (user.username) revalidateResumePaths(user.username.handle);
}

export async function moveEducation(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("educationId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;

  const item = await db.education.findUnique({ where: { id }, include: { profile: true } });
  if (!item || item.profile.userId !== user.id) return;

  const siblings = await db.education.findMany({ where: { profileId: item.profileId }, orderBy: { position: "asc" } });
  const index = siblings.findIndex((s) => s.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const other = siblings[swapIndex];
  await db.$transaction([
    db.education.update({ where: { id: item.id }, data: { position: other.position } }),
    db.education.update({ where: { id: other.id }, data: { position: item.position } }),
  ]);
  if (user.username) revalidateResumePaths(user.username.handle);
}

// spec §6.1: an optional static alternative/supplement to the generated
// resume view — offered alongside it, never in place of it (§6.3).
export async function uploadResumePdf(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const file = formData.get("resumePdf");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file." };

  const result = await saveDocumentFile(file);
  if ("error" in result) return { error: result.error };

  await db.profile.update({ where: { userId: user.id }, data: { resumePdfUrl: result.url } });

  if (user.username) revalidateResumePaths(user.username.handle);
  return undefined;
}

export async function removeResumePdf(): Promise<void> {
  const user = await requireOwnProfile();
  await db.profile.update({ where: { userId: user.id }, data: { resumePdfUrl: null } });
  if (user.username) revalidateResumePaths(user.username.handle);
}
