import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../auth/AuthContext";
import { BrandMark } from "../components/BrandMark";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";
import { API_BASE_URL } from "../config";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// What signing in actually unlocks — kept concrete (the three things the
// tab bar gates behind auth) rather than a vague "get the full
// experience" line.
const PERKS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "sparkles-outline", label: "A feed from the people you follow" },
  { icon: "chatbubbles-outline", label: "Messages and notifications" },
  { icon: "person-circle-outline", label: "Your profile at 0dot.in/you" },
];

export function SignInScreen() {
  const { error, signIn } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale({ scale: 0.97, opacity: 0.9 });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <BrandMark size={96} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.duration(500).delay(80)} style={styles.wordmark}>
          0dot
        </Animated.Text>
        <Animated.Text entering={FadeInDown.duration(500).delay(140)} style={styles.tagline}>
          One identity. One profile. Infinite possibilities.
        </Animated.Text>

        <Animated.View entering={FadeIn.duration(500).delay(260)} style={styles.perks}>
          {PERKS.map((perk) => (
            <View key={perk.label} style={styles.perkRow}>
              <View style={styles.perkIcon}>
                <Ionicons name={perk.icon} size={16} color={theme.colors.accent} />
              </View>
              <Text style={styles.perkLabel}>{perk.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      {/* Plain View, not an entering-animated one: a Reanimated layout
          animation that fails to run leaves its subtree stuck at opacity 0,
          and the primary sign-in CTA must never be able to end up invisible
          or untappable. The hero above can animate — it's decorative. */}
      <View style={styles.footer}>
        <AnimatedPressable
          onPress={() => {
            haptics.light();
            signIn();
          }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Continue with 0dot"
          style={[styles.primaryButton, press.animatedStyle]}
        >
          <Text style={styles.primaryButtonText}>Continue with 0dot</Text>
          <Ionicons name="arrow-forward" size={18} color={theme.colors.onAccent} />
        </AnimatedPressable>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={theme.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => Linking.openURL(API_BASE_URL)}
            accessibilityRole="link"
            accessibilityLabel="Learn more at 0dot.in"
            hitSlop={8}
            style={styles.learnMore}
          >
            <Text style={styles.learnMoreText}>New here? Learn more at 0dot.in</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, justifyContent: "space-between", padding: theme.space[6] },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space[3] },
    wordmark: { fontSize: theme.text.xxl, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginTop: theme.space[2] },
    tagline: {
      fontSize: theme.text.base,
      color: theme.colors.mutedForeground,
      textAlign: "center",
      maxWidth: 300,
      lineHeight: theme.text.base * 1.45,
    },
    perks: { alignSelf: "stretch", gap: theme.space[3], marginTop: theme.space[6], paddingHorizontal: theme.space[2] },
    perkRow: { flexDirection: "row", alignItems: "center", gap: theme.space[3] },
    perkIcon: {
      width: 30,
      height: 30,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    perkLabel: { flex: 1, fontSize: theme.text.sm, color: theme.colors.foreground },
    footer: { gap: theme.space[4], paddingBottom: theme.space[2] },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space[2],
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.full,
      minHeight: 52,
      paddingHorizontal: theme.space[6],
      ...theme.shadow.sm,
    },
    primaryButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
    errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space[2], paddingHorizontal: theme.space[4] },
    errorText: { color: theme.colors.danger, textAlign: "center", fontSize: theme.text.sm, flexShrink: 1 },
    learnMore: { alignSelf: "center", minHeight: 32, justifyContent: "center" },
    learnMoreText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, textAlign: "center" },
  });
}
