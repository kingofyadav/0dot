import "server-only";
import { randomBytes } from "crypto";

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

const provider: LivestreamProvider = new StubLivestreamProvider();

export function getLivestreamProvider(): LivestreamProvider {
  return provider;
}
