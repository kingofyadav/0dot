import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { subscribeToCommunityChat, type CommunityChatEvent } from "@/lib/community-chat-events";
import { getReplayFrames, currentSeq } from "@/lib/realtime/replay";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // same as api/messages/stream/route.ts — see its comment

const HEARTBEAT_MS = 20_000;

// Realtime addendum Phase C — the bearer-token counterpart to
// src/app/api/c/[slug]/chat/stream/route.ts, subscribing to the same
// `cchat:<communityId>` bus channel (Phase A made that cross-instance-safe).
// Same read visibility rule as the history endpoint and the web chat page.
//
// Phase C also adds `Last-Event-ID` replay: a client that reconnects with
// the header gets exactly the messages it missed replayed (each with an
// `id:` frame) before the stream goes live — or a single `{type:"resync"}`
// if the gap is bigger than the buffer. A fresh connection gets a baseline
// `id:` so it has something to reconnect from. Live frames carry the
// event's own `seq` as their `id:`. (Without Redis there's no buffer, no
// `id:` frames, and the client falls back to a full `resync` on reconnect.)
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug } = await params;
  const community = await db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true, visibility: true, restrictedToOrganizationId: true },
  });
  if (!community) return apiError("Not found.", 404);

  const membership = await getCommunityMember(community.id, ctx.userId);
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return apiError("Join this community to view its chat.", 403);
  }

  const replayChannel = `cchat:${community.id}`;
  const lastEventIdHeader = request.headers.get("Last-Event-ID");
  const lastEventId = lastEventIdHeader != null && lastEventIdHeader !== "" ? Number(lastEventIdHeader) : null;

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      enqueue(`retry: 2000\n\n`);

      const sendEvent = (event: CommunityChatEvent) => {
        // Buffered events carry their seq — emit it as the `id:` so the
        // client tracks it for the next reconnect. `typing` has none.
        const idLine = "seq" in event && typeof event.seq === "number" ? `id: ${event.seq}\n` : "";
        enqueue(`${idLine}data: ${JSON.stringify(event)}\n\n`);
      };

      if (lastEventId !== null) {
        const replay = await getReplayFrames(replayChannel, lastEventId);
        if (replay.kind === "gap") {
          // Can't prove we have everything — tell the client to refetch.
          enqueue(`data: ${JSON.stringify({ type: "resync" })}\n\n`);
        } else {
          for (const frame of replay.frames) {
            enqueue(`id: ${frame.seq}\ndata: ${frame.json}\n\n`);
          }
        }
      } else {
        // Fresh connection — a baseline id so a later reconnect has an
        // anchor even before the first live message.
        const seq = await currentSeq(replayChannel);
        enqueue(`id: ${seq}\n\n`);
      }

      unsubscribe = subscribeToCommunityChat(community.id, sendEvent);
      heartbeat = setInterval(() => enqueue(`: heartbeat\n\n`), HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
