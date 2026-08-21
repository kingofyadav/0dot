import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../theme";

// Mirrors VerifiedBadge's own shape exactly (same accent color, same
// accessible-icon pattern) — web's own profile page badge (isPremium,
// [username]/page.tsx) uses a Sparkle icon at the same "identity marker
// next to the name" position; this is that same badge, not a new design.
// Deliberately reuses theme.colors.accent rather than a gold/yellow tone:
// this app's palette reserves warning (Yellow) for status only, never
// decorative (theme.ts's own comment on the Google 4-color system) — a
// premium badge is decorative, so it follows VerifiedBadge's precedent of
// using accent, distinguished by icon shape alone.
export function PremiumBadge({ size = 15 }: { size?: number }) {
  const theme = useTheme();
  return (
    <Ionicons
      name="sparkles"
      size={size}
      color={theme.colors.accent}
      accessibilityLabel="Premium account"
      accessible
    />
  );
}
