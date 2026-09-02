import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../auth/AuthContext";
import { BrandMark } from "../components/BrandMark";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function LockScreen() {
  const { error, unlock, signOut } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale({ scale: 0.97, opacity: 0.9 });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <BrandMark size={92} badge="lock-closed" />
        </Animated.View>
        <Animated.Text entering={FadeInDown.duration(500).delay(80)} style={styles.title}>
          0dot is locked
        </Animated.Text>
        <Animated.Text entering={FadeInDown.duration(500).delay(140)} style={styles.subtitle}>
          Unlock with Face ID, Touch ID, or your device passcode to continue.
        </Animated.Text>
      </View>

      <Animated.View entering={FadeIn.duration(500).delay(240)} style={styles.footer}>
        <AnimatedPressable
          onPress={() => {
            haptics.light();
            unlock();
          }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Unlock"
          style={[styles.primaryButton, press.animatedStyle]}
        >
          <Ionicons name="finger-print" size={18} color={theme.colors.onAccent} />
          <Text style={styles.primaryButtonText}>Unlock</Text>
        </AnimatedPressable>

        {/* Without this, a user whose biometrics stop working (broken sensor,
            no longer enrolled) would be permanently stuck here — a valid
            session they can neither access nor discard. */}
        <Pressable
          onPress={() => {
            haptics.medium();
            signOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out instead"
          style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.secondaryButtonText}>Sign out instead</Text>
        </Pressable>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={15} color={theme.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, justifyContent: "space-between", padding: theme.space[6] },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space[3] },
    title: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground, marginTop: theme.space[3] },
    subtitle: {
      fontSize: theme.text.base,
      color: theme.colors.mutedForeground,
      textAlign: "center",
      maxWidth: 300,
      lineHeight: theme.text.base * 1.45,
    },
    footer: { gap: theme.space[3], paddingBottom: theme.space[2] },
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
    secondaryButton: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: theme.space[6] },
    secondaryButtonText: { color: theme.colors.mutedForeground, fontWeight: theme.weight.label, fontSize: theme.text.sm },
    errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space[2], paddingHorizontal: theme.space[4] },
    errorText: { color: theme.colors.danger, textAlign: "center", fontSize: theme.text.sm, flexShrink: 1 },
  });
}
