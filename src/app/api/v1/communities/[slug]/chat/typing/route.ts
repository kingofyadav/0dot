import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCommunityMember } from "@/lib/communities";
import { publishToCommunityChat } from "@/lib/community-chat-events";

// Realtime addendum Phase C — a "someone is typing" ping. Purely ephemeral:
// no DB row, no push, no history. The client debounces to at most one call
// every few seconds while the composer has focus; the in-memory
// checkRateLimit (not the durable tier) is the right guard here since a
// dropped ping just means one missed "typing…" frame.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { slug } = await params;
  const community = await db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true },
  });
  if (!community) return apiError("Not found.", 404);

  // Cheap ceiling — a client that respects the debounce sends ~1 / 3s.
  if (!checkRateLimit(`community-chat:typing:${ctx.userId}:${community.id}`, { max: 10, windowMs: 15_000 })) {
    return Response.json({ ok: true });
  }

  const membership = await getCommunityMember(community.id, ctx.userId);
  if (membership?.status !== "active") return Response.json({ ok: true });

  const me = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { profile: { select: { displayName: true } } },
  });
  await publishToCommunityChat(community.id, {
    type: "typing",
    userId: ctx.userId,
    name: me?.profile?.displayName ?? null,
  });

  return Response.json({ ok: true });
}
