"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { saveDocumentFile } from "@/lib/uploads";
import { isSafeUrl } from "@/lib/url-safety";
import type { ActionState } from "@/app/actions/auth";

// spec §7.4/§7.5: three independent, structurally similar, self-attested
// entities — combined in one action file (this codebase's convention when
// entities are this small and share no relations), rather than three
// near-empty files.

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateCredentialPaths(handle: string): void {
  revalidatePath(`/s/${handle}`);
  revalidatePath(`/${handle}`);
}

function optionalUrl(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return isSafeUrl(value) ? value : null;
}

// -- Research papers ---------------------------------------------------

export async function addResearchPaper(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 300) return { error: "Title must be 1-300 characters." };
  const authors = String(formData.get("authors") ?? "").trim();
  if (authors.length < 1) return { error: "Authors are required." };
  const venue = String(formData.get("venue") ?? "").trim() || null;
  const doiOrUrl = optionalUrl(formData.get("doiOrUrl"));
  const abstractText = String(formData.get("abstract") ?? "").trim();
  if (abstractText.length > 3000) return { error: "Abstract must be 3000 characters or fewer." };
  const publishDate = parseDate(formData.get("publishDate"));

  const projectIdRaw = String(formData.get("projectId") ?? "").trim() || null;
  let projectId: string | null = null;
  if (projectIdRaw) {
    const project = await db.project.findUnique({ where: { id: projectIdRaw }, select: { ownerId: true } });
    if (!project || project.ownerId !== user.id) return { error: "Choose one of your own projects." };
    projectId = projectIdRaw;
  }

  let fileUrl: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const result = await saveDocumentFile(file);
    if ("error" in result) return { error: result.error };
    fileUrl = result.url;
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  await db.researchPaper.create({
    data: { profileId: profile.id, projectId, title, authors, venue, publishDate, doiOrUrl, fileUrl, abstract: abstractText },
  });

  if (user.username) revalidateCredentialPaths(user.username.handle);
  return undefined;
}

export async function deleteResearchPaper(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("researchPaperId") ?? "");
  if (!id) return;

  const paper = await db.researchPaper.findUnique({ where: { id }, include: { profile: true } });
  if (!paper || paper.profile.userId !== user.id) return;

  await db.researchPaper.delete({ where: { id } });
  if (user.username) revalidateCredentialPaths(user.username.handle);
}

// -- Certificates --------------------------------------------------------

export async function addCertificate(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 150) return { error: "Title must be 1-150 characters." };
  const issuingOrg = String(formData.get("issuingOrg") ?? "").trim();
  if (issuingOrg.length < 1 || issuingOrg.length > 150) return { error: "Issuing organization must be 1-150 characters." };

  const issueDate = parseDate(formData.get("issueDate"));
  if (!issueDate) return { error: "Issue date is required." };
  const expiryDate = parseDate(formData.get("expiryDate"));

  const credentialId = String(formData.get("credentialId") ?? "").trim() || null;
  const credentialUrl = optionalUrl(formData.get("credentialUrl"));

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  await db.certificate.create({
    data: { profileId: profile.id, title, issuingOrg, issueDate, expiryDate, credentialId, credentialUrl },
  });

  if (user.username) revalidateCredentialPaths(user.username.handle);
  return undefined;
}

export async function deleteCertificate(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("certificateId") ?? "");
  if (!id) return;

  const cert = await db.certificate.findUnique({ where: { id }, include: { profile: true } });
  if (!cert || cert.profile.userId !== user.id) return;

  await db.certificate.delete({ where: { id } });
  if (user.username) revalidateCredentialPaths(user.username.handle);
}

// -- Awards ---------------------------------------------------------------

export async function addAward(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 150) return { error: "Title must be 1-150 characters." };
  const issuingOrg = String(formData.get("issuingOrg") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1000) return { error: "Description must be 1000 characters or fewer." };
  const link = optionalUrl(formData.get("link"));

  const awardedDate = parseDate(formData.get("awardedDate"));
  if (!awardedDate) return { error: "Awarded date is required." };

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: "Profile not found." };

  await db.award.create({ data: { profileId: profile.id, title, issuingOrg, awardedDate, description, link } });

  if (user.username) revalidateCredentialPaths(user.username.handle);
  return undefined;
}

export async function deleteAward(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const id = String(formData.get("awardId") ?? "");
  if (!id) return;

  const award = await db.award.findUnique({ where: { id }, include: { profile: true } });
  if (!award || award.profile.userId !== user.id) return;

  await db.award.delete({ where: { id } });
  if (user.username) revalidateCredentialPaths(user.username.handle);
}
