import type { SocialPlatform } from "@/lib/theme-presets";

const SIZE = 22;

// Colorful brand-color badges (solid circle in each platform's official
// color + a simplified white/black glyph on top) rather than pixel-accurate
// logo reproductions — recognizable by color+silhouette without hand-copying
// trademarked artwork. Glyph paths render via `color` on the wrapping <g>
// so "currentColor" in each glyph resolves to that badge's glyph color.
function Badge({ bg, glyph, children }: { bg: string; glyph: string; children: React.ReactNode }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill={bg} />
      <g transform="translate(12 12) scale(0.8) translate(-12 -12)" style={{ color: glyph }}>
        {children}
      </g>
    </svg>
  );
}

function WebsiteGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </g>
  );
}

function XGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </g>
  );
}

function InstagramGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.3" />
      <circle cx="17.3" cy="6.7" r="0.7" fill="currentColor" stroke="none" />
    </g>
  );
}

function FacebookGlyph() {
  return (
    <path
      d="M13.4 20v-6.6h2.1l.3-2.5h-2.4V9.2c0-.7.2-1.2 1.2-1.2h1.3V5.8c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.4v1.8H8.6v2.5h2.2V20"
      fill="currentColor"
    />
  );
}

function LinkedInGlyph() {
  return (
    <g fill="currentColor">
      <circle cx="7.3" cy="7.2" r="1.6" />
      <rect x="5.9" y="10.3" width="2.8" height="8.2" />
      <path d="M10.9 10.3h2.7v1.2c.5-.8 1.4-1.4 2.7-1.4 2.4 0 3.2 1.5 3.2 3.7v4.7h-2.8v-4.2c0-1-.4-1.8-1.4-1.8-.9 0-1.4.6-1.6 1.2-.1.2-.1.5-.1.8v4h-2.7v-8.2Z" />
    </g>
  );
}

function YouTubeGlyph() {
  return <path d="M9.5 7.6v8.8l7.3-4.4z" fill="currentColor" />;
}

function TikTokGlyph() {
  return (
    <g fill="none" strokeWidth="1.6" strokeLinecap="round">
      <path d="M14.6 4.1v11a3.5 3.5 0 1 1-3.2-3.49" stroke="#25F4EE" transform="translate(-0.5 -0.5)" />
      <path d="M14.6 4.1v11a3.5 3.5 0 1 1-3.2-3.49" stroke="#FE2C55" transform="translate(0.5 0.5)" />
      <path d="M14.6 4.1v11a3.5 3.5 0 1 1-3.2-3.49" stroke="currentColor" />
      <path d="M14.6 4.1c.35 2.55 2.1 4.25 4.5 4.5" stroke="currentColor" />
    </g>
  );
}

function GitHubGlyph() {
  return (
    <path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
    />
  );
}

function RedditGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <ellipse cx="12" cy="14" rx="8" ry="6" />
      <circle cx="9" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 17c1 .8 5 .8 6 0" />
      <path d="M12 8V4" />
      <circle cx="14.3" cy="2.6" r="0.9" fill="currentColor" stroke="none" />
    </g>
  );
}

function ThreadsGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3c-4.5 0-7 2.8-7 7.5S7.2 21 12.5 21c3 0 4.8-1.3 4.8-3.4 0-1.9-1.4-2.9-3.5-2.9-2.5 0-3.7 1.1-3.7 2.5 0 1 .7 1.6 1.7 1.6.7 0 1.2-.3 1.4-.8" />
      <path d="M13 10c1.8 0 3-1 3-2.4C16 6 14.6 5 12.6 5c-2.4 0-3.9 1.4-4.2 3.6" />
    </g>
  );
}

function SnapchatGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3c3.3 0 5.5 2.6 5.5 6.2 0 1.4.2 2.4.6 3.1.5.9 1.3 1.2 1.3 1.8 0 .5-.7.8-1.6 1-.2 0-.3.2-.3.4.1.5.1 1-.6 1.2-.6.2-1.4.1-1.9.4-.5.3-.8 1-1.9 1-.9 0-1.3-.5-1.9-1-.5-.3-1.3-.2-1.9-.4-.7-.2-.7-.7-.6-1.2 0-.2-.1-.4-.3-.4-.9-.2-1.6-.5-1.6-1 0-.6.8-.9 1.3-1.8.4-.7.6-1.7.6-3.1C6.5 5.6 8.7 3 12 3Z" />
      <circle cx="9" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.7" fill="currentColor" stroke="none" />
    </g>
  );
}

function TelegramGlyph() {
  return (
    <path
      fill="currentColor"
      d="M3 11.6 20.3 4c.7-.3 1.4.3 1.1 1L18.6 20c-.2.8-1.1 1.1-1.7.5l-4.3-3.6-2.4 2.3c-.3.3-.8.1-.8-.3l.2-3.9L16.6 8 8.3 13l-5-1.2c-.6-.2-.6-1-.3-1.2Z"
    />
  );
}

// Representative official brand colors, and the glyph color that reads best
// against each (white almost everywhere; black on the light Snapchat yellow).
const BRAND: Record<SocialPlatform, { bg: string; glyph: string; Glyph: () => React.JSX.Element }> = {
  website: { bg: "#64748b", glyph: "#fff", Glyph: WebsiteGlyph },
  twitter: { bg: "#000000", glyph: "#fff", Glyph: XGlyph },
  instagram: { bg: "#C13584", glyph: "#fff", Glyph: InstagramGlyph },
  facebook: { bg: "#1877F2", glyph: "#fff", Glyph: FacebookGlyph },
  linkedin: { bg: "#0A66C2", glyph: "#fff", Glyph: LinkedInGlyph },
  youtube: { bg: "#FF0000", glyph: "#fff", Glyph: YouTubeGlyph },
  tiktok: { bg: "#000000", glyph: "#fff", Glyph: TikTokGlyph },
  github: { bg: "#181717", glyph: "#fff", Glyph: GitHubGlyph },
  reddit: { bg: "#FF4500", glyph: "#fff", Glyph: RedditGlyph },
  threads: { bg: "#000000", glyph: "#fff", Glyph: ThreadsGlyph },
  snapchat: { bg: "#FFFC00", glyph: "#000", Glyph: SnapchatGlyph },
  telegram: { bg: "#26A5E4", glyph: "#fff", Glyph: TelegramGlyph },
};

export function SocialIcon({ platform }: { platform: SocialPlatform }) {
  const { bg, glyph, Glyph } = BRAND[platform];
  return (
    <Badge bg={bg} glyph={glyph}>
      <Glyph />
    </Badge>
  );
}
