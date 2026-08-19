"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getCurrentSessionToken, hashToken } from "@/lib/session";

// account-settings-hardening addendum §4: single-row delete, guarded to the
// caller's own userId so a forged sessionId can't revoke someone else's.
// Deliberately doesn't special-case the caller's own current session — the
// sessions page never renders a revoke form on "This device" (see
// security/sessions/page.tsx), sign-out already covers that path.
export async function revokeSession(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  await db.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  revalidatePath("/s", "layout");
}

// addendum §4: extracted from changePassword's own inline deleteMany
// (auth.ts) so both call sites share one implementation rather than a
// second copy — changePassword now calls this too.
export async function revokeAllOtherSessions(userId: string): Promise<void> {
  const currentToken = await getCurrentSessionToken();
  const currentTokenHash = currentToken ? hashToken(currentToken) : "";
  await db.session.deleteMany({
    where: { userId, tokenHash: { not: currentTokenHash } },
  });
}

export async function revokeAllOtherSessionsAction(): Promise<void> {
  const user = await requireVerifiedUser();
  await revokeAllOtherSessions(user.id);
  revalidatePath("/s", "layout");
}
