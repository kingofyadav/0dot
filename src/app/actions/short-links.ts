"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { isSafeUrl } from "@/lib/url-safety";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

// crypto.randomBytes, not Math.random — same convention every other
// token/code generator in this codebase uses (session.ts, affiliates.ts,
// podcasts.ts): Math.random() isn't cryptographically strong, which matters
// here since a short code is effectively a bearer identifier for wherever
// it redirects to.
function randomShortCode(): string {
  return randomBytes(4).toString("base64url").slice(0, 6);
}

export async function createShortLink(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkRateLimit(`short-link:${user.id}`, { max: 30, windowMs: 60 * 60 * 1000 })) {
    return { error: "You're creating links too quickly. Please slow down." };
  }

  const destinationUrl = String(formData.get("destinationUrl") ?? "").trim();
  if (!isSafeUrl(destinationUrl)) return { error: "Enter a valid http(s) URL." };

  // A collision on the final attempt (or a TOCTOU race with a concurrent
  // request generating the same code between this findUnique and the create
  // below) must not escape as an unhandled Prisma P2002 — wrap the create
  // and surface the same graceful { error } shape every other validation
  // failure in this action already returns.
  let shortCode = randomShortCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.shortLink.findUnique({ where: { shortCode } });
    if (!existing) break;
    shortCode = randomShortCode();
  }

  try {
    await db.shortLink.create({
      data: { ownerId: user.id, shortCode, destinationUrl },
    });
  } catch {
    return { error: "Couldn't generate a unique short code. Please try again." };
  }

  revalidatePath(`/s/${user.username!.handle}/short-links`);
  return undefined;
}

export async function deleteShortLink(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const id = String(formData.get("shortLinkId") ?? "");
  if (!id) return;

  const link = await db.shortLink.findUnique({ where: { id } });
  if (!link || link.ownerId !== user.id) return;

  await db.shortLink.delete({ where: { id } });
  revalidatePath(`/s/${user.username!.handle}/short-links`);
}
