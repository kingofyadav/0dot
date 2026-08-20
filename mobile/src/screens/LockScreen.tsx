import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../auth/AuthContext";
import { useTheme, type Theme } from "../theme";
import { haptics } from "../utils/haptics";

export function LockScreen() {
  const { error, unlock, signOut } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <View style={styles.iconMark}>
          <Ionicons name="lock-closed" size={30} color={theme.colors.accent} />
        </View>
        <Text style={styles.title}>0dot is locked</Text>
        <Text style={styles.subtitle}>Unlock with Face ID or your device passcode to continue.</Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            haptics.light();
            unlock();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock"
          style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.primaryButtonText}>Unlock</Text>
        </Pressable>
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
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, justifyContent: "space-between", padding: theme.space[6] },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space[3] },
    iconMark: {
      width: 64,
      height: 64,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.space[2],
    },
    title: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    subtitle: { fontSize: theme.text.base, color: theme.colors.mutedForeground, textAlign: "center", maxWidth: 280 },
    footer: { gap: theme.space[3], paddingBottom: theme.space[4] },
    primaryButton: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.full,
      minHeight: 48,
      paddingHorizontal: theme.space[6],
    },
    primaryButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
    secondaryButton: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: theme.space[6] },
    secondaryButtonText: { color: theme.colors.mutedForeground, fontWeight: theme.weight.label, fontSize: theme.text.sm },
    errorText: { color: theme.colors.danger, textAlign: "center", fontSize: theme.text.sm },
  });
}
