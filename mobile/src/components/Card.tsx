import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

// A raised surface for content that needs to visually separate from the
// screen background beyond a hairline border — the wallet balance card,
// a marketplace listing card, an event card in later sub-phases. Uses
// theme.shadow.sm by default (a listing/card level of elevation; pass
// `elevated` for theme.shadow.md when something needs to read as sitting
// above its neighbors, e.g. a featured card).
export function Card({ children, elevated, style }: { children: ReactNode; elevated?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
        elevated ? theme.shadow.md : theme.shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16 },
});
