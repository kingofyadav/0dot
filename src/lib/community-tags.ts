// Fixed taxonomy — a community's tag is a key into this list, validated
// server-side, never free text (phase-3 spec §6: "keeps discovery
// browsable rather than fragmented across thousands of one-off tags").
// Same "curated set, not user-supplied text" posture as
// src/lib/theme-presets.ts.
export type CommunityTagOption = { key: string; label: string };

export const COMMUNITY_TAGS: CommunityTagOption[] = [
  { key: "design", label: "Design" },
  { key: "gaming", label: "Gaming" },
  { key: "tech", label: "Tech" },
  { key: "music", label: "Music" },
  { key: "sports", label: "Sports" },
  { key: "science", label: "Science" },
  { key: "business", label: "Business" },
  { key: "art", label: "Art" },
  { key: "writing", label: "Writing" },
  { key: "photography", label: "Photography" },
  { key: "fitness", label: "Fitness" },
  { key: "food", label: "Food" },
  { key: "travel", label: "Travel" },
  { key: "education", label: "Education" },
  { key: "finance", label: "Finance" },
  { key: "news", label: "News" },
  { key: "entertainment", label: "Entertainment" },
  { key: "hobbies", label: "Hobbies" },
  { key: "other", label: "Other" },
];

export const COMMUNITY_TAG_KEYS = new Set(COMMUNITY_TAGS.map((t) => t.key));

// Defensive cap, not spec-mandated — keeps tag chips scannable on a
// community's identity header rather than a wall of labels.
export const MAX_TAGS_PER_COMMUNITY = 5;

export function communityTagLabel(key: string): string {
  return COMMUNITY_TAGS.find((t) => t.key === key)?.label ?? key;
}
