import { useEffect, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
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
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(OFFSCREEN);

  useEffect(() => {
    const target = visible ? 0 : OFFSCREEN;
    translateY.value = reduceMotion ? target : withTiming(target, { duration: theme.motion.slow });
  }, [visible, reduceMotion, theme.motion.slow, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      </Pressable>
      <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.surface }, sheetStyle]}>
        <SafeAreaView edges={["bottom"]}>
          <GestureDetector gesture={pan}>
            <View style={styles.dragArea}>
              <View style={styles.handle} />
              {title ? <Text style={styles.title}>{title}</Text> : null}
            </View>
          </GestureDetector>
          {children}
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { backgroundColor: "rgba(0, 0, 0, 0.4)" },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingHorizontal: theme.space[5],
      paddingTop: theme.space[3],
      paddingBottom: theme.space[4],
      ...theme.shadow.lg,
    },
    dragArea: { paddingBottom: theme.space[1] },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.border,
      marginBottom: theme.space[3],
    },
    title: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginBottom: theme.space[3] },
  });
}
