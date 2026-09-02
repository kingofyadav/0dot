import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BrandMark } from "../components/BrandMark";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";
import { useTheme, type Theme } from "../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Three value-prop slides pulled from docs/VISION.md's own framing
// ("One Identity. One Profile. Infinite Possibilities.", the identity-
// fragmentation problem, the no-dark-patterns principle) — not invented
// copy, the same story the product already tells itself.
const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "link-outline",
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
    body: "Private by default. No ads, no dark patterns. Your identity, your data, your call.",
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
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const isLast = index === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
      haptics.selection();
    }
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

  const nextPress = usePressScale({ scale: 0.97, opacity: 0.9 });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <BrandMark size={36} />
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip"
          hitSlop={12}
          style={[styles.skipButton, isLast && styles.skipHidden]}
          disabled={isLast}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <Slide key={slide.title} slide={slide} index={i} width={width} scrollX={scrollX} theme={theme} styles={styles} />
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <Dot key={slide.title} index={i} scrollX={scrollX} width={width} theme={theme} />
          ))}
        </View>
        <AnimatedPressable
          onPress={onNext}
          onPressIn={nextPress.onPressIn}
          onPressOut={nextPress.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Get started" : "Next"}
          style={[styles.nextButton, nextPress.animatedStyle]}
        >
          <Text style={styles.nextButtonText}>{isLast ? "Get started" : "Next"}</Text>
          <Ionicons name="arrow-forward" size={18} color={theme.colors.onAccent} />
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

function Slide({
  slide,
  index,
  width,
  scrollX,
  theme,
  styles,
}: {
  slide: (typeof SLIDES)[number];
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
}) {
  // Content lifts in and fades as its page reaches centre — a small
  // parallax that makes the swipe feel considered rather than a flat
  // carousel.
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(scrollX.value, inputRange, [24, 0, 24], Extrapolation.CLAMP) },
        { scale: interpolate(scrollX.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.slideInner, animatedStyle]}>
        <View style={styles.iconMark}>
          <Ionicons name={slide.icon} size={40} color={theme.colors.accent} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  index,
  scrollX,
  width,
  theme,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  theme: Theme;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, inputRange, [8, 22, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, inputRange, [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }, animatedStyle]} />;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.space[5],
      paddingTop: theme.space[2],
      minHeight: 48,
    },
    skipButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.space[3] },
    skipHidden: { opacity: 0 },
    skipText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, fontWeight: theme.weight.label },
    slide: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[8] },
    slideInner: { alignItems: "center", gap: theme.space[4] },
    iconMark: {
      width: 104,
      height: 104,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.space[3],
    },
    title: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground, textAlign: "center" },
    body: {
      fontSize: theme.text.base,
      color: theme.colors.mutedForeground,
      textAlign: "center",
      lineHeight: theme.text.base * 1.5,
      maxWidth: 320,
    },
    footer: { gap: theme.space[5], paddingHorizontal: theme.space[6], paddingBottom: theme.space[4], paddingTop: theme.space[2] },
    dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: theme.space[2] },
    nextButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space[2],
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.full,
      minHeight: 52,
      ...theme.shadow.sm,
    },
    nextButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
  });
}
