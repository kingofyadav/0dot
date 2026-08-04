import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPodcastRss, resolvePodcastFeedToken } from "@/lib/podcasts";

// spec §9.2/§9.3: the public feed (no ?t=) never includes a gated episode.
// A private feed (?t=<token>) additionally includes episodes the token's
// subscriber currently qualifies for, re-checked live on every fetch — not
// a login-gated page, since podcast apps poll this with no session at all.
export async function GET(request: NextRequest, { params }: { params: Promise<{ rssSlug: string }> }) {
  const { rssSlug } = await params;

  const podcast = await db.podcast.findUnique({ where: { rssSlug } });
  if (!podcast) return new Response("Not found", { status: 404 });

  const rawToken = request.nextUrl.searchParams.get("t");
  // An invalid/revoked token silently degrades to the public feed rather
  // than erroring — same "no signal to distinguish wrong-token from
  // right-token-no-longer-entitled" posture the digital-download route
  // already established.
  const resolvedFeedToken = rawToken ? await resolvePodcastFeedToken(rawToken) : null;

  const xml = await buildPodcastRss(podcast, request.nextUrl.origin, rawToken, resolvedFeedToken);
  return new NextResponse(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
