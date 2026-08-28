import { WebhookReceiver } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { broadcastRoomUpdate } from "@/lib/voice-room-events";

export const dynamic = "force-dynamic";

// LiveKit → us. Registered once in the LiveKit project's webhook settings
// (docs/specs/addendum-voice-rooms-livekit.md §3.5 / §7). We only care
// about `room_finished` for a `voiceroom_*` room: LiveKit closed the room
// (empty-timeout, or our own deleteRoom), so reconcile the DB row to
// `ended` if some client crash left it `live`. Livestream rooms
// (`livestream_*`) have their own lifecycle and are ignored here, as is
// every other event type.
const VOICE_ROOM_PREFIX = "voiceroom_";

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

  if (event.event !== "room_finished" || !event.room?.name?.startsWith(VOICE_ROOM_PREFIX)) {
    return new Response(null, { status: 204 });
  }

  const roomId = event.room.name.slice(VOICE_ROOM_PREFIX.length);
  const room = await db.voiceRoom.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
  if (room && room.status !== "ended") {
    await db.voiceRoom.update({
      where: { id: roomId },
      data: { status: "ended", endedAt: new Date(), currentSpeakerId: null, currentSpeakerSince: null },
    });
    broadcastRoomUpdate(roomId);
  }

  return new Response(null, { status: 204 });
}
