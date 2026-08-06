import "server-only";
import { randomBytes } from "crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// phase-5 spec §8.2: real-time video ingest, transcoding, and CDN delivery
// (spec §8.1) is a substantially larger infra lift than anything else in
// this phase — same category of investment Phase 3 flagged for voice rooms
// and Phase 4 for appointments. This interface exists so the rest of the
// feature (schema, gating, chat, notifications) can be built and tested
// now, with a real provider (Mux, LiveKit, etc.) swapped in later by
// writing a second class and changing getLivestreamProvider() below —
// same delegation shape payments.ts's PaymentProcessor already
// established. The stub's playbackUrl is not a real streamable URL.
export interface LivestreamProvider {
  readonly name: string;
  createStream(livestream: { id: string }): Promise<{ ingestKey: string; playbackUrl: string }>;
}

class StubLivestreamProvider implements LivestreamProvider {
  readonly name = "stub";

  async createStream(livestream: { id: string }) {
    return {
      ingestKey: `stub_ingest_${randomBytes(12).toString("hex")}`,
      playbackUrl: `/stub-playback/${livestream.id}`,
    };
  }
}

// Real provider promised in the comment above: a LiveKit room per
// livestream, one SFU connection per participant instead of the
// voice-rooms mesh (voice-rooms.ts's MAX_VOICE_ROOM_PARTICIPANTS=30 ceiling
// is exactly the scaling wall a livestream audience would hit). ingestKey
// and playbackUrl both just carry the room name — LiveKit has no separate
// RTMP ingest concept for this browser-webcam flow, only per-participant
// join tokens (see createLiveKitToken below), so there's nothing else
// meaningful to put in those two columns.
class LiveKitLivestreamProvider implements LivestreamProvider {
  readonly name = "livekit";
  private roomService: RoomServiceClient;

  constructor(url: string, apiKey: string, apiSecret: string) {
    this.roomService = new RoomServiceClient(url, apiKey, apiSecret);
  }

  async createStream(livestream: { id: string }) {
    const roomName = `livestream_${livestream.id}`;
    // emptyTimeout: keep the room alive across a brief owner disconnect/
    // reconnect (network blip, tab reload) without tearing it down —
    // an hour comfortably covers any single livestream session.
    await this.roomService.createRoom({ name: roomName, emptyTimeout: 60 * 60, maxParticipants: 500 });
    return { ingestKey: roomName, playbackUrl: roomName };
  }
}

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

const provider: LivestreamProvider =
  LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET
    ? new LiveKitLivestreamProvider(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    : new StubLivestreamProvider();

export function getLivestreamProvider(): LivestreamProvider {
  return provider;
}

// Per-viewer/per-broadcaster join token — separate from the
// LivestreamProvider interface because it's a per-request concern
// (identity, publish permission) rather than the one-shot room-lifecycle
// shape createStream models. Returns null under the stub provider (no
// LiveKit credentials configured) so callers can fall back to the
// stub-playback placeholder.
export async function createLiveKitToken(params: {
  roomName: string;
  identity: string;
  name?: string;
  canPublish: boolean;
}): Promise<{ token: string; url: string } | null> {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: params.identity,
    name: params.name,
  });
  at.addGrant({
    room: params.roomName,
    roomJoin: true,
    canPublish: params.canPublish,
    canSubscribe: true,
  });

  return { token: await at.toJwt(), url: LIVEKIT_URL };
}
