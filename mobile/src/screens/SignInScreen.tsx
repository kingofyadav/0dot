import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../auth/AuthContext";
import { useTheme, type Theme } from "../theme";

export function SignInScreen() {
  const { error, signIn } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph}>0</Text>
        </View>
        <Text style={styles.title}>0dot</Text>
        <Text style={styles.subtitle}>Sign in to see your feed, notifications, and profile.</Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={signIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in with 0dot"
          style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="log-in-outline" size={18} color={theme.colors.onAccent} />
          <Text style={styles.primaryButtonText}>Sign in with 0dot</Text>
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
    logoMark: {
      width: 72,
      height: 72,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.space[2],
    },
    logoGlyph: { fontSize: 32, fontWeight: theme.weight.heading, color: theme.colors.onAccent },
    title: { fontSize: theme.text.xxl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    subtitle: { fontSize: theme.text.base, color: theme.colors.mutedForeground, textAlign: "center", maxWidth: 280 },
    footer: { gap: theme.space[3], paddingBottom: theme.space[4] },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space[2],
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.full,
      minHeight: 48,
      paddingHorizontal: theme.space[6],
    },
    primaryButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
    errorText: { color: theme.colors.danger, textAlign: "center", fontSize: theme.text.sm },
  });
}
