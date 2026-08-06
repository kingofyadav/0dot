import { NextRequest, NextResponse } from "next/server";
import { getBusinessCard } from "@/lib/business-card";

// spec §6.1: the vCard export resolves to the same card data (and
// therefore the same canonical profile) as the public /[username]/card
// page — no separate identity representation.
export async function GET(request: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();

  const card = await getBusinessCard(handle);
  if (!card) return new NextResponse("Not found", { status: 404 });

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${card.displayName}`,
    card.workTitle ? `TITLE:${card.workTitle}` : null,
    card.email ? `EMAIL:${card.email}` : null,
    `URL:${request.nextUrl.origin}/${handle}`,
    "END:VCARD",
  ].filter((line): line is string => line !== null);

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${handle}.vcf"`,
    },
  });
}
