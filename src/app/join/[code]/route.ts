import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { REFERRAL_COOKIE } from "@/lib/wallet/referral";
import { WALLET_LIMITS } from "@/lib/wallet/limits";

// addendum-coin-wallet-v2.md §7.5 — the referral landing route. Sets a
// first-party, httpOnly, 30-day `ref` cookie (same no-IP/UA posture as
// /aff/[code]) and sends the visitor to signup. An unknown code still
// redirects to signup, just without a cookie — no enumeration signal.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = decodeURIComponent(code).trim().toLowerCase();

  const row = await db.referralCode.findUnique({ where: { code: normalized }, select: { userId: true } });
  const response = NextResponse.redirect(new URL("/signup", request.url));

  if (row) {
    response.cookies.set(REFERRAL_COOKIE, normalized, {
      maxAge: WALLET_LIMITS.REFERRAL_COOKIE_MAX_AGE_S,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return response;
}
