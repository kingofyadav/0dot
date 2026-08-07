import "server-only";
import { randomBytes } from "crypto";
import { CROSS_POST_PLATFORMS, type CrossPostPlatform } from "@/lib/cross-post-platforms";

export interface SocialPublishProvider {
  readonly platform: CrossPostPlatform;
  publish(params: { accessToken: string; content: string; mediaUrls: string[] }): Promise<{
    externalPostId: string;
    externalPostUrl: string;
  }>;
}

const PLATFORM_POST_URL_BASE: Record<CrossPostPlatform, string> = {
  twitter: "https://x.com/i/status",
  instagram: "https://instagram.com/p",
  facebook: "https://facebook.com/permalink",
  linkedin: "https://linkedin.com/feed/update",
  tiktok: "https://tiktok.com/video",
  youtube: "https://youtube.com/shorts",
};

// Stub only — no live OAuth app / API key is wired up for any of these
// platforms (this codebase's .env has no such key), same posture as
// ai-provider.ts's model provider and payments.ts's payment processor.
// publish() below is a deterministic, zero-network fake so the
// scheduling/retry/UI machinery around it can be built and tested
// end-to-end now. Swapping in a real platform SDK later means writing one
// class per platform implementing this same interface and registering it
// in getSocialPublishProvider() — nothing above this file changes shape.
class StubSocialPublishProvider implements SocialPublishProvider {
  constructor(readonly platform: CrossPostPlatform) {}

  async publish() {
    const externalPostId = randomBytes(8).toString("hex");
    return {
      externalPostId,
      externalPostUrl: `${PLATFORM_POST_URL_BASE[this.platform]}/${externalPostId}`,
    };
  }
}

const providers = new Map<CrossPostPlatform, SocialPublishProvider>(
  CROSS_POST_PLATFORMS.map((platform) => [platform, new StubSocialPublishProvider(platform)])
);

export function getSocialPublishProvider(platform: CrossPostPlatform): SocialPublishProvider {
  const provider = providers.get(platform);
  if (!provider) throw new Error(`Unknown cross-post platform: ${platform}`);
  return provider;
}
