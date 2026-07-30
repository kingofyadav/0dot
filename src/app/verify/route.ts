import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

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

  const handle = record.user.username?.handle;
  return NextResponse.redirect(
    new URL(handle ? `/${handle}` : "/", request.url)
  );
}
