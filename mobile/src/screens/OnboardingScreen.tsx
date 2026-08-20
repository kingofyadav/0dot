import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";

// Three value-prop slides pulled from docs/VISION.md's own framing
// ("One Identity. One Profile. Infinite Possibilities.", the identity-
// fragmentation problem, the no-dark-patterns principle) — not invented
// copy, the same story the product already tells itself.
const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "person-circle-outline",
    title: "One identity, one link",
    body: "0dot.in/username is your permanent home on the internet — not another profile scattered across five apps.",
  },
  {
    icon: "newspaper-outline",
    title: "Share what's real",
    body: "Posts, updates, and proof of life — not an algorithm optimizing for how long it can hold your attention.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "You're in control",
    body: "Private by default, no ads, no dark patterns. Your identity, your data, your call.",
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  // A plain ScrollView.scrollTo(x) rather than FlatList's scrollToIndex —
  // scrollToIndex needs either getItemLayout or a reliable onLayout-based
  // measurement to work, and react-native-web's implementation doesn't
  // reliably advance at all without it (confirmed: tapping Next silently
  // no-op'd). Three fixed-width, non-virtualized slides don't need
  // FlatList's virtualization anyway — a raw x-offset scroll is simpler
  // and actually reliable cross-platform.
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  function onNext() {
    haptics.light();
    if (isLast) {
      onDone();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  function onSkip() {
    haptics.light();
    onDone();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip" style={styles.skipButton}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.iconMark}>
              <Ionicons name={slide.icon} size={36} color={theme.colors.accent} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.title}
              style={[styles.dot, { backgroundColor: i === index ? theme.colors.accent : theme.colors.border }]}
            />
          ))}
        </View>
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Get started" : "Next"}
          style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.nextButtonText}>{isLast ? "Get started" : "Next"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    skipButton: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", paddingHorizontal: theme.space[5] },
    skipText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, fontWeight: theme.weight.label },
    slide: { alignItems: "center", justifyContent: "center", padding: theme.space[8], gap: theme.space[3] },
    iconMark: {
      width: 80,
      height: 80,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.space[3],
    },
    title: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground, textAlign: "center" },
    body: { fontSize: theme.text.base, color: theme.colors.mutedForeground, textAlign: "center", lineHeight: theme.text.base * 1.4 },
    footer: { gap: theme.space[4], paddingHorizontal: theme.space[6], paddingBottom: theme.space[4] },
    dots: { flexDirection: "row", justifyContent: "center", gap: theme.space[2] },
    dot: { width: 8, height: 8, borderRadius: 4 },
    nextButton: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.full,
      minHeight: 48,
    },
    nextButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
  });
}
