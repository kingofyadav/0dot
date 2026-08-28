import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordViewer, dropViewer } from "@/lib/business-viewers";

// Realtime addendum Phase E — a viewer beacon. The client POSTs every ~30s
// while a business page is visible, and once more (via navigator.sendBeacon
// with `leaving: true`) on unload. No auth — a business page is public, and
// the count is only ever shown back to the owner. `viewerKey` is a random
// per-tab id the client generates; keyed rate-limit is on the IP.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await db.business.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true },
  });
  if (!business) return new Response(null, { status: 404 });

  if (!checkRateLimit(`bizview:ping:${await getClientIp()}`, { max: 20, windowMs: 60_000 })) {
    return new Response(null, { status: 204 });
  }

  const payload = await request.json().catch(() => null);
  const viewerKey = typeof payload?.viewerKey === "string" ? payload.viewerKey.slice(0, 64) : "";
  if (!viewerKey) return new Response(null, { status: 400 });

  if (payload?.leaving === true) await dropViewer(business.id, viewerKey);
  else await recordViewer(business.id, viewerKey);

  return new Response(null, { status: 204 });
}
