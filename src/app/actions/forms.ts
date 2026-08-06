"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { getCurrentUser } from "@/lib/session";
import type { ActionState } from "@/app/actions/auth";

const FIELD_TYPES = new Set(["text", "choice", "rating", "date"]);
const MODES = new Set(["form", "survey"]);

export type FormFieldDef = { label: string; type: string; required: boolean; options?: string[] };

function parseFields(raw: string): FormFieldDef[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 30) return null;

  const fields: FormFieldDef[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const { label, type, required, options } = item as Record<string, unknown>;
    if (typeof label !== "string" || label.trim().length < 1 || label.length > 160) return null;
    if (typeof type !== "string" || !FIELD_TYPES.has(type)) return null;
    fields.push({
      label: label.trim(),
      type,
      required: required === true,
      options: type === "choice" && Array.isArray(options) ? options.filter((o): o is string => typeof o === "string").slice(0, 20) : undefined,
    });
  }
  return fields;
}

// phase-16 spec §9: owner is profile | business | organization | community
// in the schema, but this build only wires up the profile-owner creation
// path — the same narrow-MVP-first posture as Donations' user-only
// organizer. business-links.ts's canManageCatalog-style checks are the
// natural extension point for business/organization/community owners
// later, not built speculatively here.
export async function createForm(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 160) return { error: "Title must be 1-160 characters." };

  const mode = String(formData.get("mode") ?? "form");
  if (!MODES.has(mode)) return { error: "Choose a valid mode." };

  const fields = parseFields(String(formData.get("fieldsJson") ?? "[]"));
  if (!fields) return { error: "Add at least one valid field." };

  const form = await db.form.create({
    data: {
      ownerType: "profile",
      ownerProfileId: user.profile!.id,
      title,
      mode,
      fieldsJson: JSON.stringify(fields),
      status: "draft",
    },
  });

  revalidatePath(`/s/${user.username!.handle}/forms`);
  redirect(`/s/${user.username!.handle}/forms/${form.id}`);
}

export async function publishForm(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("formId") ?? "");
  const form = await db.form.findUnique({ where: { id } });
  if (!form || form.ownerProfileId !== user.profile!.id) return;

  await db.form.update({ where: { id }, data: { status: "published" } });
  revalidatePath(`/s/${user.username!.handle}/forms`);
}

export async function closeForm(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("formId") ?? "");
  const form = await db.form.findUnique({ where: { id } });
  if (!form || form.ownerProfileId !== user.profile!.id) return;

  await db.form.update({ where: { id }, data: { status: "closed" } });
  revalidatePath(`/s/${user.username!.handle}/forms`);
}

export type FormSubmitState = { error: string } | { success: true } | undefined;

// spec §9.1's second acceptance criterion: mode never changes the
// FormResponse schema, only presentation — this submission path is
// identical regardless of form.mode.
export async function submitFormResponse(_prevState: FormSubmitState, formData: FormData): Promise<FormSubmitState> {
  const formId = String(formData.get("formId") ?? "");
  const form = await db.form.findUnique({ where: { id: formId } });
  if (!form || form.status !== "published") return { error: "This form isn't accepting responses." };

  const fields = JSON.parse(form.fieldsJson) as FormFieldDef[];
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const value = String(formData.get(field.label) ?? "").trim();
    if (field.required && value.length === 0) return { error: `"${field.label}" is required.` };
    if (value.length > 2000) return { error: `"${field.label}" is too long.` };
    answers[field.label] = value;
  }

  const currentUser = await getCurrentUser();

  await db.formResponse.create({
    data: { formId: form.id, respondentId: currentUser?.id ?? null, answersJson: JSON.stringify(answers) },
  });

  return { success: true };
}
