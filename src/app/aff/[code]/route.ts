import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AFFILIATE_COOKIE_NAME, AFFILIATE_ATTRIBUTION_WINDOW_S } from "@/lib/affiliate";

function referrerHostFrom(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).hostname;
  } catch {
    return null;
  }
}

// spec §7.2/§7.3: records the click (referrer host only, spec §13.1's
// no-raw-IP/UA posture — same as /r/[linkId]), sets the 30-day
// last-click attribution cookie, and redirects to wherever the offering is
// actually purchasable — never trusts a client-supplied redirect target
// (avoids an open-redirect entirely, not just guarding one).
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const link = await db.affiliateLink.findUnique({ where: { code }, include: { program: true } });
  if (!link || link.program.status !== "active") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await db.affiliateClick.create({
    data: { affiliateLinkId: link.id, referrerHost: referrerHostFrom(request) },
  });

  const destination = await resolveOfferingUrl(link.program.offeringType, link.program.offeringId);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(AFFILIATE_COOKIE_NAME, code, {
    maxAge: AFFILIATE_ATTRIBUTION_WINDOW_S,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}

async function resolveOfferingUrl(offeringType: string, offeringId: string): Promise<string> {
  if (offeringType === "course") {
    const course = await db.course.findUnique({
      where: { id: offeringId },
      select: { id: true, creator: { select: { username: true } } },
    });
    if (course?.creator.username) return `/${course.creator.username.handle}/courses/${course.id}`;
    return "/";
  }

  const creatorId =
    offeringType === "membership_tier"
      ? (await db.membershipTier.findUnique({ where: { id: offeringId }, select: { creatorId: true } }))?.creatorId
      : (await db.digitalProduct.findUnique({ where: { id: offeringId }, select: { creatorId: true } }))?.creatorId;
  if (!creatorId) return "/";

  const username = await db.username.findUnique({ where: { userId: creatorId }, select: { handle: true } });
  return username ? `/${username.handle}` : "/";
}
