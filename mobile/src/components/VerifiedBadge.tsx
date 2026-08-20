import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../theme";

// One shared verified-checkmark rendering (feed card, profile header, post
// detail) instead of each screen picking its own icon/size/color.
export function VerifiedBadge({ size = 15 }: { size?: number }) {
  const theme = useTheme();
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={theme.colors.accent}
      accessibilityLabel="Verified account"
      accessible
    />
  );
}
