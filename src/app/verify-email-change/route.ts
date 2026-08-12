import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// A Route Handler, not a page — same reasoning as verify/route.ts: this
// performs a mutation from a GET, which belongs in a Route Handler rather
// than a Server Component render (the addendum's own draft named this
// page.tsx, but verify/route.ts already established the pattern this
// codebase uses for "token in a link applies a change" — following that
// precedent instead of introducing a second shape for the same thing).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/s", request.url));
  }

  const record = await db.pendingEmailChange.findUnique({
    where: { token },
    include: { user: { include: { username: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/login?error=invalid_email_change_link", request.url));
  }

  // Re-check uniqueness at apply time — the desired email could have been
  // claimed by another account in the window since the link was requested.
  const conflict = await db.user.findUnique({ where: { email: record.newEmail } });
  if (conflict) {
    await db.pendingEmailChange.delete({ where: { id: record.id } });
    return NextResponse.redirect(new URL("/login?error=email_change_conflict", request.url));
  }

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { email: record.newEmail } }),
    db.pendingEmailChange.deleteMany({ where: { userId: record.userId } }),
  ]);

  const handle = record.user.username?.handle;
  return NextResponse.redirect(new URL(handle ? `/s/${handle}/security/contact` : "/login", request.url));
}
