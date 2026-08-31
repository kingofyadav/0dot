import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { maybeGrantReferralReward } from "@/lib/wallet/referral";

// A Route Handler, not a page — cookies can only be set from a Server
// Action or a Route Handler, never during a Server Component render.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  const record = await db.emailVerificationToken.findUnique({
    where: { token },
    include: { user: { include: { username: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL("/signup?error=invalid_verification", request.url)
    );
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    db.emailVerificationToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ]);

  await createSession(record.userId);

  // §7.5 — verifying is one half of the referral-reward trigger; grant now
  // if the invitee already did a meaningful action, else the daily sweep
  // catches it later. Idempotent, and never blocks the redirect.
  await maybeGrantReferralReward(record.userId).catch(() => {});

  const handle = record.user.username?.handle;
  return NextResponse.redirect(
    new URL(handle ? `/${handle}` : "/", request.url)
  );
}
