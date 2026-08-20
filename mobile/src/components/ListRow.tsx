import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// Shared by the feed and notifications rows (and any future tappable list
// row) so the press-opacity/hairline-border/padding shell — previously
// hand-duplicated per screen with the same values — lives in one place.
// Each screen still owns its own inner layout (byline, stats row, icon
// badge, etc.), just not this wrapper.
export function ListRow({ onPress, accessibilityLabel, highlighted, style, children }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border },
        highlighted ? { backgroundColor: theme.colors.accentSoft } : null,
        { opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
