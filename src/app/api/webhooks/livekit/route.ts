import { WebhookReceiver } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { broadcastRoomUpdate } from "@/lib/voice-room-events";

export const dynamic = "force-dynamic";

// LiveKit → us. Registered once in the LiveKit project's webhook settings
// (docs/specs/addendum-voice-rooms-livekit.md §3.5 / §7). We only care
// about `room_finished` for a `voiceroom_*` or `livestream_*` room: LiveKit
// closed the room (empty-timeout, a crashed broadcaster, or our own
// deleteRoom), so reconcile the DB row to `ended` if some client crash left
// it `live`. Every other event type is ignored.
//
// Livestream reconciliation added for the mobile viewer API (v1/live/*,
// addendum-mobile-pro-upgrade.md follow-up): without it, a viewer whose
// broadcaster crashed got a token for a room that no longer existed, with
// no way to tell "ended" from "network blip" — the next GET
// /api/v1/live/[id] now correctly reports status=ended instead of a stale
// "live".
const VOICE_ROOM_PREFIX = "voiceroom_";
const LIVESTREAM_ROOM_PREFIX = "livestream_";

export async function POST(request: Request) {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return new Response("LiveKit not configured", { status: 503 });
  }

  const body = await request.text();
  const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  let event;
  try {
    event = await receiver.receive(body, request.headers.get("Authorization") ?? undefined);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.event !== "room_finished" || !event.room?.name) {
    return new Response(null, { status: 204 });
  }

  if (event.room.name.startsWith(VOICE_ROOM_PREFIX)) {
    const roomId = event.room.name.slice(VOICE_ROOM_PREFIX.length);
    const room = await db.voiceRoom.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
    if (room && room.status !== "ended") {
      await db.voiceRoom.update({
        where: { id: roomId },
        data: { status: "ended", endedAt: new Date(), currentSpeakerId: null, currentSpeakerSince: null },
      });
      broadcastRoomUpdate(roomId);
    }
  } else if (event.room.name.startsWith(LIVESTREAM_ROOM_PREFIX)) {
    const livestreamId = event.room.name.slice(LIVESTREAM_ROOM_PREFIX.length);
    const livestream = await db.livestream.findUnique({ where: { id: livestreamId }, select: { id: true, status: true } });
    if (livestream && livestream.status !== "ended") {
      await db.livestream.update({ where: { id: livestreamId }, data: { status: "ended", endedAt: new Date() } });
    }
  }

  return new Response(null, { status: 204 });
}
