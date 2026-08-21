import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

// A reusable slide-up sheet for the action menus later sub-phases need
// (community moderation actions, marketplace listing actions, event RSVP
// options) — RN has no built-in bottom sheet, so this is the one place
// that owns the slide/fade animation and backdrop-dismiss behavior rather
// than each screen re-implementing it on top of a bare Modal. Uses
// theme.motion.slow for the same enter/exit duration web's own modal
// transition (--transition-slow) uses.
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const translateY = useRef(new Animated.Value(300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: theme.motion.slow, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: theme.motion.slow, useNativeDriver: true }),
      ]).start();
    } else {
      translateY.setValue(300);
      backdropOpacity.setValue(0);
    }
  }, [visible, translateY, backdropOpacity, theme.motion.slow]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
      </Pressable>
      <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.surface, transform: [{ translateY }] }]}>
        <SafeAreaView edges={["bottom"]}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
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
