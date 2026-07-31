// Fixed taxonomy — a business's category is a key into this list, validated
// server-side, never free text (spec §3.1: "from a curated taxonomy, same
// reasoning as Phase 3 discovery tags"). Unlike CommunityTag (many-to-many),
// Business.category is a single required field, so this is a select list,
// not a checkbox set — same "curated set, not user-supplied text" posture
// as src/lib/community-tags.ts and src/lib/theme-presets.ts.
export type BusinessCategoryOption = { key: string; label: string };

export const BUSINESS_CATEGORIES: BusinessCategoryOption[] = [
  { key: "retail", label: "Retail" },
  { key: "restaurant_food", label: "Restaurant & Food" },
  { key: "professional_services", label: "Professional Services" },
  { key: "health_wellness", label: "Health & Wellness" },
  { key: "technology", label: "Technology" },
  { key: "finance", label: "Finance" },
  { key: "education", label: "Education" },
  { key: "real_estate", label: "Real Estate" },
  { key: "home_services", label: "Home Services" },
  { key: "beauty_personal_care", label: "Beauty & Personal Care" },
  { key: "automotive", label: "Automotive" },
  { key: "entertainment_events", label: "Entertainment & Events" },
  { key: "nonprofit", label: "Nonprofit" },
  { key: "media_marketing", label: "Media & Marketing" },
  { key: "other", label: "Other" },
];

export const BUSINESS_CATEGORY_KEYS = new Set(BUSINESS_CATEGORIES.map((c) => c.key));

export function businessCategoryLabel(key: string): string {
  return BUSINESS_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
