import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function referrerHostFrom(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).hostname;
  } catch {
    return null;
  }
}

// A Route Handler (not a client-side redirect) so the click is recorded
// server-side before the browser navigates away, and so it still works
// with JS disabled — see phase-1 spec §4.4.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;

  const link = await db.link.findUnique({ where: { id: linkId } });
  const now = new Date();
  const outsideWindow =
    link && ((link.startsAt && link.startsAt > now) || (link.endsAt && link.endsAt < now));
  if (!link || outsideWindow) {
    // Same response as a nonexistent link — a scheduled-but-not-yet-live or
    // expired link shouldn't redirect just because someone has the URL
    // (bookmarked, cached, indexed) from outside its visibility window.
    // "?link=unavailable" is identical for both cases too — a generic
    // signal for the landing page's dismissible notice, never anything that
    // would tell the visitor which case it was.
    return NextResponse.redirect(new URL("/?link=unavailable", request.url));
  }

  await db.$transaction([
    db.link.update({ where: { id: linkId }, data: { clickCount: { increment: 1 } } }),
    db.linkClick.create({
      data: { linkId, referrerHost: referrerHostFrom(request) },
    }),
  ]);

  return NextResponse.redirect(link.url, 307);
}
