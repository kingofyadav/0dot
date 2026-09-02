import { useEffect, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

const OFFSCREEN = 300;
// Past this many px of downward drag (or a fast enough downward flick,
// checked separately below), a release counts as "let go of the sheet"
// rather than "let go mid-adjustment" — half the closed-state travel
// distance, the same "past the midpoint" convention react-native-
// gesture-handler's own Swipeable uses for its open/closed threshold.
const DISMISS_THRESHOLD = OFFSCREEN / 2;
const DISMISS_VELOCITY = 800;

// A reusable slide-up sheet for the action menus later sub-phases need
// (community moderation actions, marketplace listing actions, event RSVP
// options) — RN has no built-in bottom sheet, so this is the one place
// that owns the slide/fade animation and backdrop-dismiss behavior rather
// than each screen re-implementing it on top of a bare Modal. Uses
// theme.motion.slow for the same enter/exit duration web's own modal
// transition (--transition-slow) uses.
//
// M9: gained drag-to-dismiss, via the handle only — not the whole sheet,
// so dragging doesn't fight with a TextInput or Button living in the
// sheet's own content (the wallet confirm sheet has both). translateY is
// now a Reanimated shared value driving both the programmatic open/close
// animation and the gesture, rather than two separate animation systems
// disagreeing about the sheet's position.
//
// M15/D2: the backdrop and the sheet surface both became BlurViews — the
// backdrop a light frost (glass.overlayIntensity) over a faint wash, the
// sheet itself the same chrome material the tab bar uses
// (glass.chromeTint/chromeIntensity). Pure background-layer swaps: the
// radius/shadow/keyboard-lift/drag-to-dismiss logic is all untouched.
//
// expo-blur only blurs on iOS — on Android it renders a weak translucent
// tint, which left the sheet's content floating over a barely-dimmed
// screen with almost no surface behind it. So the blur layers are
// iOS-only; Android gets a solid themed surface + a real dark scrim, the
// same as the platform's own bottom sheets.
const USE_BLUR = Platform.OS === "ios";

export function BottomSheet({ visible, onClose, title, children }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(OFFSCREEN);
  // The sheet is pinned to the bottom of a full-screen Modal, and RN's
  // Modal window does not resize for the soft keyboard on Android — so a
  // sheet with a TextInput in it (ReplySheet, the wallet transfer sheet,
  // the contact-change sheet) was left sitting *under* the keyboard, input
  // and buttons hidden. This lifts the whole sheet by the live keyboard
  // height. useAnimatedKeyboard (not KeyboardAvoidingView) because it's
  // the one keyboard API that reports correctly from inside a Modal on
  // both platforms, and it composes straight into the translateY the
  // drag-gesture and open/close animation already drive.
  const keyboard = useAnimatedKeyboard();

  useEffect(() => {
    const target = visible ? 0 : OFFSCREEN;
    translateY.value = reduceMotion ? target : withTiming(target, { duration: theme.motion.slow });
  }, [visible, reduceMotion, theme.motion.slow, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value - keyboard.height.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: OFFSCREEN > 0 ? 1 - Math.min(Math.max(translateY.value, 0), OFFSCREEN) / OFFSCREEN : 1,
  }));

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Downward drag only — the sheet is already fully open at 0, so
      // there's nothing above that position to reveal.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss = translateY.value > DISMISS_THRESHOLD || event.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = reduceMotion ? OFFSCREEN : withTiming(OFFSCREEN, { duration: theme.motion.fast });
        runOnJS(onClose)();
      } else {
        translateY.value = reduceMotion ? 0 : withTiming(0, { duration: theme.motion.fast });
      }
    });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          {USE_BLUR ? (
            <BlurView
              tint={theme.glass.chromeTint}
              intensity={theme.glass.overlayIntensity}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, USE_BLUR ? styles.backdropWash : styles.backdropScrim]} />
        </Animated.View>
      </Pressable>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Inner clip layer: overflow:hidden keeps the BlurView inside the
            rounded top corners without also clipping the outer view's
            shadow (which needs overflow visible on iOS). */}
        <View style={styles.sheetClip}>
          {USE_BLUR ? (
            <BlurView
              tint={theme.glass.chromeTint}
              intensity={theme.glass.chromeIntensity}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, USE_BLUR ? styles.sheetWash : styles.sheetSolid]} />
          <SafeAreaView edges={["bottom"]} style={styles.sheetContent}>
            <GestureDetector gesture={pan}>
              <View style={styles.dragArea}>
                <View style={styles.handle} />
                {title ? <Text style={styles.title}>{title}</Text> : null}
              </View>
            </GestureDetector>
            {children}
          </SafeAreaView>
        </View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    // A faint dark wash over the frosted (iOS) backdrop so the content
    // behind still reads as dimmed, not just softened — the blur alone can
    // leave a bright photo underneath too legible.
    backdropWash: { backgroundColor: "rgba(0, 0, 0, 0.28)" },
    // Android has no blur behind it, so the scrim does the whole job of
    // separating the sheet from the screen — the standard Material dim.
    backdropScrim: { backgroundColor: "rgba(0, 0, 0, 0.45)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      ...theme.shadow.lg,
    },
    sheetClip: {
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      overflow: "hidden",
    },
    // Tints the chrome blur toward the theme surface so text on the sheet
    // keeps its contrast regardless of what's behind it — the same role
    // the old solid `theme.colors.surface` fill played, at a translucency
    // that lets the blur still read.
    sheetWash: { backgroundColor: theme.scheme === "dark" ? "rgba(19, 19, 19, 0.55)" : "rgba(251, 250, 248, 0.6)" },
    // Android: no blur, so the sheet is a plain opaque surface.
    sheetSolid: { backgroundColor: theme.colors.surface },
    sheetContent: {
      paddingHorizontal: theme.space[5],
      paddingTop: theme.space[3],
      paddingBottom: theme.space[4],
    },
    dragArea: { paddingBottom: theme.space[1] },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: theme.radius.full,
      backgroundColor: theme.glass.hairlineOnGlass,
      marginBottom: theme.space[3],
    },
    title: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginBottom: theme.space[3] },
  });
}
