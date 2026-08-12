"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const DEACTIVATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";

// addendum §7: deactivate and "request deletion" are the same state
// transition (status: deactivated, deletionScheduledFor: +30d) — the
// *scheduled* sweep (account-deletion.ts) is what actually erases data, so
// there's no separate "delete now" path here, only differing UI copy/
// confirmation strength at the two call sites below. No explicit session
// kill needed: getCurrentUser() (session.ts) already force-logs-out any
// non-active user on its next read, including the one making this request.
async function scheduleDeactivation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");

  const ok = checkRateLimit(`account-lifecycle:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: RATE_LIMIT_ERROR };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: { status: "deactivated", deletionScheduledFor: new Date(Date.now() + DEACTIVATION_GRACE_MS) },
  });

  return { success: true };
}

export async function deactivateAccount(prevState: ActionState, formData: FormData): Promise<ActionState> {
  return scheduleDeactivation(prevState, formData);
}

export async function requestAccountDeletion(prevState: ActionState, formData: FormData): Promise<ActionState> {
  return scheduleDeactivation(prevState, formData);
}

// addendum §7: gathers the caller's own rows into one JSON object — scoped
// to what's cheap to query (account/profile/links/posts/articles/projects),
// not every table this schema has. Self-authenticating (no userId
// parameter) rather than trusting a caller-supplied id, since this is
// reachable as a Server Action from any client bundle that imports it.
export async function exportAccountData(): Promise<Record<string, unknown>> {
  const user = await requireVerifiedUser();

  const [profile, links, posts, articles, projects, bookmarks] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.link.findMany({ where: { profile: { userId: user.id } } }),
    db.post.findMany({ where: { authorId: user.id, deletedAt: null }, select: { id: true, body: true, createdAt: true } }),
    db.article.findMany({ where: { authorId: user.id }, select: { id: true, title: true, format: true, status: true, createdAt: true } }),
    db.project.findMany({ where: { ownerId: user.id }, select: { id: true, title: true, description: true, startedAt: true } }),
    db.bookmark.findMany({ where: { userId: user.id }, select: { postId: true, createdAt: true } }),
  ]);

  return {
    account: {
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      locale: user.locale,
      timezone: user.timezone,
      createdAt: user.createdAt,
    },
    profile,
    links,
    posts,
    articles,
    projects,
    bookmarks,
    exportedAt: new Date().toISOString(),
  };
}
