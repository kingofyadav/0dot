"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";

export type ActionState = { error?: string } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function signup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const handle = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "Name must be 1-50 characters." };
  }

  const usernameError = validateUsernameFormat(handle);
  if (usernameError === "invalid_format") {
    return {
      error: "Username must be 3-30 characters: letters, numbers, underscore only.",
    };
  }
  if (usernameError === "reserved") {
    return { error: "That username is reserved." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const [existingEmail, existingHandle] = await Promise.all([
    db.user.findUnique({ where: { email } }),
    db.username.findUnique({ where: { handle } }),
  ]);
  if (existingEmail) {
    return { error: "An account with that email already exists." };
  }
  if (existingHandle) {
    return { error: "That username is already taken." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      username: { create: { handle } },
      profile: { create: { displayName } },
    },
  });

  const token = randomBytes(24).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });

  // No transactional email provider is wired up yet (flagged in Phase 1
  // spec open questions elsewhere) — log the verification link for local
  // dev/testing rather than silently dropping it.
  const verifyUrl = `/verify?token=${token}`;
  console.log(`[dev] Verification link for ${email}: ${verifyUrl}`);

  redirect(`/verify/sent?token=${token}`);
}

export async function login(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({
    where: { email },
    include: { username: true },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession(user.id);

  if (!user.emailVerifiedAt) {
    redirect("/verify/sent");
  }
  // A returning user most likely wants to see what's new, not land back on
  // their own profile every time — the just-verified first-time signup
  // path (verify/route.ts) still lands on the new profile itself, since
  // that's the "here's your new page" moment.
  redirect("/feed");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
