"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { canManageCatalog } from "@/lib/businesses";
import { saveMessageAttachment } from "@/lib/uploads";
import type { ActionState } from "@/app/actions/auth";

const VISIBILITY_VALUES = new Set(["public", "team_only"]);

// canManageCatalog-tier per build plan step 9. Reuses saveMessageAttachment
// (src/lib/uploads.ts), same pipeline as JobApplication.resumeUrl — no
// third upload path.
export async function uploadDocument(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
  if (!business) return { error: "Business not found." };
  if (!(await canManageCatalog(business.id, user.id))) {
    return { error: "You don't have permission to manage this business's documents." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const visibility = String(formData.get("visibility") ?? "public");
  if (!VISIBILITY_VALUES.has(visibility)) return { error: "Choose a visibility." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const result = await saveMessageAttachment(file, "file", user.id);
  if ("error" in result) return { error: result.error };

  await db.businessDocument.create({
    data: { businessId: business.id, title, fileUrl: result.url, visibility, uploadedBy: user.id },
  });

  revalidatePath(`/b/${business.slug}/documents`);
  return undefined;
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  const document = await db.businessDocument.findUnique({
    where: { id: documentId },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!document) return;
  if (!(await canManageCatalog(document.business.id, user.id))) return;

  await db.businessDocument.delete({ where: { id: documentId } });
  revalidatePath(`/b/${document.business.slug}/documents`);
}
