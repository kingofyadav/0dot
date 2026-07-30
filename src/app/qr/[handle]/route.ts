import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";

// SVG, not PNG: resolution-independent and tiny for something this simple.
// Fixed black-on-white regardless of the viewer's theme — QR scanners need
// strong contrast, and a theme-tinted code risks becoming unscannable.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();

  const username = await db.username.findUnique({ where: { handle } });
  if (!username) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Origin comes from the actual request rather than a hardcoded domain —
  // correct in local dev and any deployment without a config flag, and the
  // handle (and therefore this URL) is permanent per phase-1 spec §3.5, so
  // the long cache lifetime below is safe.
  const profileUrl = `${request.nextUrl.origin}/${handle}`;
  const svg = await QRCode.toString(profileUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#171717", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
