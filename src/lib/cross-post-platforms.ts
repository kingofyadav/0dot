// Plain constant list, no "server-only" — imported by both the compose
// form (client component) and social-publish-provider.ts/cross-post.ts
// (server-only), same "shared constant list separate from data-fetching
// logic" split theme-presets.ts already uses for SocialLink's platform
// allowlist.
export const CROSS_POST_PLATFORMS = ["twitter", "instagram", "facebook", "linkedin", "tiktok", "youtube"] as const;
export type CrossPostPlatform = (typeof CROSS_POST_PLATFORMS)[number];

export function isCrossPostPlatform(platform: string): platform is CrossPostPlatform {
  return (CROSS_POST_PLATFORMS as readonly string[]).includes(platform);
}
