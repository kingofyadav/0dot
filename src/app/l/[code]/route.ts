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

// phase-16 spec §7: the general-purpose shortener's redirect — a Route
// Handler (not client-side) so the click records before the browser
// navigates away, same posture as /r/[linkId] (Phase 1 spec §4.4).
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const shortLink = await db.shortLink.findUnique({ where: { shortCode: code } });
  if (!shortLink) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await db.$transaction([
    db.shortLink.update({ where: { shortCode: code }, data: { clickCount: { increment: 1 } } }),
    db.shortLinkClick.create({
      data: { shortLinkId: shortLink.id, referrerHost: referrerHostFrom(request) },
    }),
  ]);

  return NextResponse.redirect(shortLink.destinationUrl, 307);
}
