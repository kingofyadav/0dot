import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

// Ops diagnostic for the "This app isn't approved to request: ..." OAuth
// consent error — lets an admin confirm from a browser whether
// ensureFirstPartyApps() actually backfilled DeveloperAppScope approval for
// the first-party apps' catalog scopes, without needing raw DB credentials.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const platformRole = user ? await db.platformRole.findUnique({ where: { userId: user.id } }) : null;
  if (!platformRole || (platformRole.role !== "admin" && platformRole.role !== "super_admin")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const apps = await db.developerApp.findMany({
    where: { name: { in: ["0dot iOS App", "0dot Android App", "0dot Desktop"] } },
    select: {
      id: true,
      name: true,
      clientId: true,
      isPublicClient: true,
      scopes: { select: { scopeKey: true, status: true, requestedAt: true, reviewedAt: true } },
    },
  });

  return NextResponse.json({ apps });
}
