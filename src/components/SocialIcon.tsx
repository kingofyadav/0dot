import type { SocialPlatform } from "@/lib/theme-presets";

const SIZE = 18;

// Simplified, single-color marks (currentColor) rather than pixel-accurate
// brand logos — matches DESIGN_SYSTEM.md's restrained-accent philosophy
// (no per-platform brand colors splashed into an otherwise monochrome UI)
// and avoids the accuracy risk of hand-reproducing exact trademark artwork.
// Each is recognizable by shape/silhouette, which is all "icon next to the
// platform name" needs.

function Website() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  );
}

function X() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

function Instagram() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Facebook() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path
        d="M13.4 20v-6.6h2.1l.3-2.5h-2.4V9.2c0-.7.2-1.2 1.2-1.2h1.3V5.8c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.4v1.8H8.6v2.5h2.2V20"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function LinkedIn() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8 12v6" />
      <path d="M12 18v-4c0-1.5 1-2.4 2.2-2.4 1.2 0 1.8.9 1.8 2.4v4" />
    </svg>
  );
}

function YouTube() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="6" width="19" height="12" rx="4" />
      <path d="M10.3 9.3v5.4l4.7-2.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTok() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 3.5v11a3.5 3.5 0 1 1-3.2-3.49" />
      <path d="M14 3.5c.35 2.55 2.1 4.25 4.5 4.5" />
    </svg>
  );
}

function GitHub() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function Reddit() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <ellipse cx="12" cy="14" rx="8" ry="6" />
      <circle cx="9" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 17c1 .8 5 .8 6 0" />
      <path d="M12 8V4" />
      <circle cx="14.3" cy="2.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Threads() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3c-4.5 0-7 2.8-7 7.5S7.2 21 12.5 21c3 0 4.8-1.3 4.8-3.4 0-1.9-1.4-2.9-3.5-2.9-2.5 0-3.7 1.1-3.7 2.5 0 1 .7 1.6 1.7 1.6.7 0 1.2-.3 1.4-.8" />
      <path d="M13 10c1.8 0 3-1 3-2.4C16 6 14.6 5 12.6 5c-2.4 0-3.9 1.4-4.2 3.6" />
    </svg>
  );
}

function Snapchat() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3c3.3 0 5.5 2.6 5.5 6.2 0 1.4.2 2.4.6 3.1.5.9 1.3 1.2 1.3 1.8 0 .5-.7.8-1.6 1-.2 0-.3.2-.3.4.1.5.1 1-.6 1.2-.6.2-1.4.1-1.9.4-.5.3-.8 1-1.9 1-.9 0-1.3-.5-1.9-1-.5-.3-1.3-.2-1.9-.4-.7-.2-.7-.7-.6-1.2 0-.2-.1-.4-.3-.4-.9-.2-1.6-.5-1.6-1 0-.6.8-.9 1.3-1.8.4-.7.6-1.7.6-3.1C6.5 5.6 8.7 3 12 3Z" />
      <circle cx="9" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Telegram() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 11.6 20.3 4c.7-.3 1.4.3 1.1 1L18.6 20c-.2.8-1.1 1.1-1.7.5l-4.3-3.6-2.4 2.3c-.3.3-.8.1-.8-.3l.2-3.9L16.6 8 8.3 13l-5-1.2c-.6-.2-.6-1-.3-1.2Z" />
    </svg>
  );
}

const ICONS: Record<SocialPlatform, () => React.JSX.Element> = {
  website: Website,
  twitter: X,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: LinkedIn,
  youtube: YouTube,
  tiktok: TikTok,
  github: GitHub,
  reddit: Reddit,
  threads: Threads,
  snapchat: Snapchat,
  telegram: Telegram,
};

export function SocialIcon({ platform }: { platform: SocialPlatform }) {
  const Icon = ICONS[platform];
  return <Icon />;
}
