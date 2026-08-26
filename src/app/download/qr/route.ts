import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

// Same SVG-QR pattern as src/app/qr/[handle]/route.ts (fixed black-on-white
// regardless of viewer theme — scanners need strong contrast), pointed at
// this page itself rather than a profile, so scanning it from a desktop
// browser opens /download on the phone's own browser and lets that request's
// own user-agent sniff (DownloadPage's detectPlatform) pick the right
// platform section.
export async function GET(request: NextRequest) {
  const pageUrl = `${request.nextUrl.origin}/download`;
  const svg = await QRCode.toString(pageUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#171717", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
