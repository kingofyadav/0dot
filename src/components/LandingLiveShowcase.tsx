"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Calendar, Palette, ShoppingBag, Music, Code2, Store } from "lucide-react";

type ShowcaseProfile = {
  handle: string;
  name: string;
  role: string;
  followers: string;
  following: string;
  links: string;
  items: { icon: typeof Palette; label: string }[];
};

const PROFILES: ShowcaseProfile[] = [
  {
    handle: "priya",
    name: "Priya Sharma",
    role: "Designer & Creator",
    followers: "12.4k",
    following: "340",
    links: "28",
    items: [
      { icon: Palette, label: "Portfolio" },
      { icon: ShoppingBag, label: "Shop my designs" },
      { icon: Calendar, label: "Book a call" },
    ],
  },
  {
    handle: "rohan",
    name: "Rohan Mehta",
    role: "Musician",
    followers: "8.2k",
    following: "512",
    links: "14",
    items: [
      { icon: Music, label: "Latest album" },
      { icon: Calendar, label: "Tour dates" },
      { icon: Store, label: "Merch store" },
    ],
  },
  {
    handle: "aisha",
    name: "Aisha Khan",
    role: "Developer",
    followers: "5.6k",
    following: "189",
    links: "9",
    items: [
      { icon: Code2, label: "Open source" },
      { icon: Palette, label: "Blog" },
      { icon: Calendar, label: "Hire me" },
    ],
  },
];

const ROTATE_MS = 3200;

// Swaps between a few example profiles instead of a static mockup — the
// hero's one visual proof point that this is a real, active platform, not
// a single frozen screenshot. Skips the interval entirely under
// prefers-reduced-motion rather than just shortening it (matches how the
// rest of the app treats that preference — see globals.css's global rule).
export function LandingLiveShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % PROFILES.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  const profile = PROFILES[index];

  return (
    <div className="landingPreview" aria-hidden="true">
      <div className="landingPreviewChrome">
        <span className="landingPreviewDot" />
        <span className="landingPreviewDot" />
        <span className="landingPreviewDot" />
        <span className="landingPreviewUrl">
          <span className="brandUrl">0dot.in</span>/{profile.handle}
        </span>
      </div>
      <div className="landingPreviewBody" key={profile.handle}>
        <div className="landingPreviewCover" />
        <div className="landingPreviewHeaderRow">
          <span className="landingPreviewAvatar" />
          <div className="landingPreviewIdentity">
            <div className="landingPreviewName">
              {profile.name}
              <span className="verifiedBadge">
                <BadgeCheck size={13} aria-hidden="true" />
              </span>
            </div>
            <div className="landingPreviewHandle">{profile.role}</div>
          </div>
        </div>
        <div className="landingPreviewStats">
          <span><strong>{profile.followers}</strong> followers</span>
          <span><strong>{profile.following}</strong> following</span>
          <span><strong>{profile.links}</strong> links</span>
        </div>
        <div className="landingPreviewLinks">
          {profile.items.map(({ icon: Icon, label }) => (
            <div className="landingPreviewLink" key={label}>
              <Icon size={14} aria-hidden="true" /> {label}
            </div>
          ))}
        </div>
      </div>
      <span className="landingPreviewBadge">
        <span className="landingPreviewBadgeDot" />
        Live preview
      </span>
    </div>
  );
}
