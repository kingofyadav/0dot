import "server-only";
import { createHash } from "crypto";
import { CROSS_POST_PLATFORMS, type CrossPostPlatform } from "@/lib/cross-post-platforms";

export interface ExternalContentItemInput {
  externalItemId: string;
  title: string;
  thumbnailUrl: string | null;
  contentUrl: string;
  publishedAt: Date;
}

// Mirrors social-publish-provider.ts's SocialPublishProvider exactly, just
// the opposite direction: pulling a connected account's existing content
// IN for display on the public profile (social-content-sync.ts), instead
// of pushing a new post OUT.
export interface SocialContentProvider {
  readonly platform: CrossPostPlatform;
  fetchRecentContent(params: { accessToken: string; externalAccountId: string }): Promise<ExternalContentItemInput[]>;
}

const PLATFORM_CONTENT_URL_BASE: Record<CrossPostPlatform, string> = {
  twitter: "https://x.com/i/status/",
  instagram: "https://instagram.com/p/",
  facebook: "https://facebook.com/permalink/",
  linkedin: "https://linkedin.com/feed/update/",
  tiktok: "https://tiktok.com/video/",
  youtube: "https://youtube.com/watch?v=",
};

const PLATFORM_CONTENT_NOUN: Record<CrossPostPlatform, string> = {
  twitter: "Post",
  instagram: "Post",
  facebook: "Post",
  linkedin: "Post",
  tiktok: "Video",
  youtube: "Video",
};

const PLATFORM_BRAND_COLOR: Record<CrossPostPlatform, string> = {
  twitter: "#000000",
  instagram: "#FF0069",
  facebook: "#0866FF",
  linkedin: "#0A66C2",
  tiktok: "#000000",
  youtube: "#FF0000",
};

const ITEMS_PER_ACCOUNT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// Zero-network inline SVG, same "loudly not real" stub posture as
// ai-provider.ts's embed() and social-publish-provider.ts's fake
// externalPostUrl — a small colored placeholder, not a fabricated URL to
// someone else's real image host.
function placeholderThumbnail(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68"><rect width="120" height="68" fill="${bg}"/><text x="60" y="39" font-size="22" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Stub only — no live platform API is wired up (see social-publish-provider.ts's
// identical disclaimer). Deterministic per externalAccountId so a re-sync
// resolves to the same externalItemIds and upserts in place rather than
// duplicating rows every tick.
class StubSocialContentProvider implements SocialContentProvider {
  constructor(readonly platform: CrossPostPlatform) {}

  async fetchRecentContent({ externalAccountId }: { accessToken: string; externalAccountId: string }) {
    const noun = PLATFORM_CONTENT_NOUN[this.platform];
    const label = this.platform.slice(0, 2).toUpperCase();
    return Array.from({ length: ITEMS_PER_ACCOUNT }, (_, index) => {
      const seed = createHash("sha1").update(`${externalAccountId}:${this.platform}:${index}`).digest("hex");
      const externalItemId = seed.slice(0, 16);
      return {
        externalItemId,
        title: `${noun} ${index + 1}`,
        thumbnailUrl: placeholderThumbnail(label, PLATFORM_BRAND_COLOR[this.platform]),
        contentUrl: `${PLATFORM_CONTENT_URL_BASE[this.platform]}${externalItemId}`,
        publishedAt: new Date(Date.now() - index * 3 * DAY_MS),
      };
    });
  }
}

const providers = new Map<CrossPostPlatform, SocialContentProvider>(
  CROSS_POST_PLATFORMS.map((platform) => [platform, new StubSocialContentProvider(platform)])
);

export function getSocialContentProvider(platform: CrossPostPlatform): SocialContentProvider {
  const provider = providers.get(platform);
  if (!provider) throw new Error(`Unknown cross-post platform: ${platform}`);
  return provider;
}
