import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { buildUpiDeepLink, renderUpiQrSvg } from "@/lib/upi";

// Same SVG-route shape as src/app/qr/[handle]/route.ts, gated to the
// request's own owner since the deep link carries a specific amount +
// referenceCode meant for one person to pay.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireVerifiedUser();
  const { id } = await params;

  const topUpRequest = await db.coinTopUpRequest.findUnique({ where: { id } });
  if (!topUpRequest || topUpRequest.userId !== user.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const deepLink = buildUpiDeepLink({
    amountInr: topUpRequest.amountInr,
    referenceCode: topUpRequest.referenceCode,
  });
  const svg = await renderUpiQrSvg(deepLink);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
    },
  });
}
